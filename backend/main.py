import hashlib
import hmac
import base64
import binascii
import csv
import io
import json
import logging
import os
import zipfile
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal
from urllib.parse import unquote, urlsplit
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import case, delete, func, or_, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import JSONResponse
from fastapi.responses import StreamingResponse

from auth import (
    COOKIE_NAME,
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    SESSION_DURATION,
    create_session,
    create_recovery_code,
    get_current_user,
    hash_recovery_code,
    hash_token,
    password_hasher,
)
from database import get_db
from models import (
    Account,
    AccountSaveReceipt,
    CreditCardStatement,
    EncryptedVault,
    LoginSession,
    LoginThrottle,
    StatementPaymentAllocation,
    Transaction,
    TransactionSaveReceipt,
    Transfer,
    TransferSaveReceipt,
    User,
)
from schemas import (
    AccountCreate,
    AccountBalanceRead,
    AccountRead,
    AccountSaveRequest,
    ChangePasswordRequest,
    DeleteAccountRequest,
    LoginRequest,
    ResetPasswordRequest,
    RecoveryVaultRead,
    StatementCreate,
    StatementRead,
    SignupRequest,
    SummaryRead,
    TransactionCreate,
    TransactionRead,
    TransactionSaveRequest,
    TransferCreate,
    TransferRead,
    VaultRead,
    VaultWrite,
)


app = FastAPI(title="Spendwise API")

APP_ENV = os.getenv("APP_ENV", "development")
configured_origins = {
    value.strip().rstrip("/")
    for value in os.getenv("APP_ORIGIN", "").split(",")
    if value.strip()
}
if APP_ENV == "production" and not configured_origins:
    raise RuntimeError("APP_ORIGIN is required in production")

ALLOWED_ORIGINS = configured_origins or {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
}
ALLOWED_HOSTS = [
    value.strip()
    for value in os.getenv(
        "ALLOWED_HOSTS",
        "localhost,127.0.0.1,testserver" if APP_ENV != "production" else "",
    ).split(",")
    if value.strip()
]
if APP_ENV == "production" and not ALLOWED_HOSTS:
    raise RuntimeError("ALLOWED_HOSTS is required in production")

app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(ALLOWED_ORIGINS),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)

LEGACY_FINANCE_PATHS = (
    "/api/accounts",
    "/api/transactions",
    "/api/transfers",
    "/api/statements",
    "/api/summary",
    "/api/export",
)


@app.middleware("http")
async def require_encrypted_vaults(request: Request, call_next):
    if request.url.path.startswith(LEGACY_FINANCE_PATHS):
        return JSONResponse(
            status_code=410,
            content={"detail": "This server accepts encrypted vault data only."},
        )
    return await call_next(request)

LOGIN_WINDOW = timedelta(minutes=15)
LOGIN_BLOCK = timedelta(minutes=15)
LOGIN_MAX_FAILURES = 5

database_url_for_redaction = os.getenv("DATABASE_URL", "")
database_password = ""
if database_url_for_redaction:
    database_password = unquote(urlsplit(database_url_for_redaction).password or "")
SENSITIVE_LOG_VALUES = [
    value for value in (database_url_for_redaction, database_password) if value
]


class SecretRedactionFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        for value in SENSITIVE_LOG_VALUES:
            message = message.replace(value, "[redacted]")
        record.msg = message
        record.args = ()
        return True


for handler in logging.getLogger().handlers:
    handler.addFilter(SecretRedactionFilter())

# Used to check passwords even when an email doesn't exist.
DUMMY_PASSWORD_HASH = password_hasher.hash("unused-dummy-password")


@app.middleware("http")
async def protect_write_origins(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.method in {
        "POST", "PUT", "PATCH", "DELETE"
    }:
        origin = request.headers.get("origin")
        if origin:
            if origin.rstrip("/") not in ALLOWED_ORIGINS:
                return JSONResponse(status_code=403, content={"detail": "Request origin is not allowed."})
        elif request.cookies.get(COOKIE_NAME):
            return JSONResponse(status_code=403, content={"detail": "Request origin is required."})
    return await call_next(request)


def login_throttle_key(email: str, client_host: str) -> str:
    value = f"{email.strip().lower()}|{client_host}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def blocked_seconds(record: LoginThrottle | None, now: datetime) -> int:
    if record is None or record.blocked_until is None or record.blocked_until <= now:
        return 0
    return max(1, int((record.blocked_until - now).total_seconds()))


def register_login_failure(db: Session, key_hash: str, now: datetime) -> None:
    record = db.get(LoginThrottle, key_hash)
    if record is None:
        record = LoginThrottle(
            key_hash=key_hash,
            failed_attempts=0,
            window_started_at=now,
        )
        db.add(record)
    elif now - record.window_started_at >= LOGIN_WINDOW:
        record.failed_attempts = 0
        record.window_started_at = now
        record.blocked_until = None
    record.failed_attempts += 1
    if record.failed_attempts >= LOGIN_MAX_FAILURES:
        record.blocked_until = now + LOGIN_BLOCK
    db.commit()


def account_payload_hash(data: AccountSaveRequest) -> str:
    payload = data.model_dump(
        mode="json",
        exclude={"request_id"},
    )

    canonical_payload = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
    )

    return hashlib.sha256(
        canonical_payload.encode("utf-8")
    ).hexdigest()


def transaction_payload_hash(data: TransactionSaveRequest) -> str:
    payload = data.model_dump(
        mode="json",
        exclude={"request_id"},
    )

    canonical_payload = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
    )

    return hashlib.sha256(
        canonical_payload.encode("utf-8")
    ).hexdigest()


def transfer_payload_hash(data: TransferCreate) -> str:
    payload = data.model_dump(mode="json", exclude={"request_id"})
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def calculate_account_balance(db: Session, account: Account) -> Decimal:
    income = db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), Decimal("0.00")))
        .where(
            Transaction.account_id == account.id,
            Transaction.type == "income",
            Transaction.reversed_at.is_(None),
        )
    )
    expenses = db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), Decimal("0.00")))
        .where(
            Transaction.account_id == account.id,
            Transaction.type == "expense",
            Transaction.reversed_at.is_(None),
        )
    )
    received = db.scalar(
        select(func.coalesce(func.sum(Transfer.amount), Decimal("0.00")))
        .where(Transfer.to_account_id == account.id, Transfer.reversed_at.is_(None))
    )
    sent = db.scalar(
        select(func.coalesce(func.sum(Transfer.amount), Decimal("0.00")))
        .where(Transfer.from_account_id == account.id, Transfer.reversed_at.is_(None))
    )
    return account.opening_balance + income - expenses + received - sent


def statement_result(statement: CreditCardStatement) -> StatementRead:
    remaining = max(statement.amount_due - statement.paid_amount, Decimal("0.00"))
    today = datetime.now(ZoneInfo("Africa/Cairo")).date()
    if remaining == 0:
        status = "paid"
    elif statement.due_date < today:
        status = "overdue"
    elif statement.paid_amount > 0:
        status = "partially_paid"
    elif statement.due_date <= today + timedelta(days=7):
        status = "due_soon"
    else:
        status = "open"
    return StatementRead(
        id=statement.id,
        account_id=statement.account_id,
        opening_date=statement.opening_date,
        closing_date=statement.closing_date,
        due_date=statement.due_date,
        amount_due=statement.amount_due,
        minimum_payment=statement.minimum_payment,
        paid_amount=statement.paid_amount,
        remaining_amount=remaining,
        status=status,
    )


def allocate_card_payment(db: Session, transfer: Transfer) -> None:
    remaining = transfer.amount
    statements = db.scalars(
        select(CreditCardStatement)
        .where(
            CreditCardStatement.account_id == transfer.to_account_id,
            CreditCardStatement.paid_amount < CreditCardStatement.amount_due,
        )
        .order_by(CreditCardStatement.due_date, CreditCardStatement.id)
        .with_for_update()
    ).all()
    for statement in statements:
        if remaining <= 0:
            break
        allocation = min(remaining, statement.amount_due - statement.paid_amount)
        statement.paid_amount += allocation
        db.add(
            StatementPaymentAllocation(
                transfer_id=transfer.id,
                statement_id=statement.id,
                amount=allocation,
            )
        )
        remaining -= allocation


def csv_safe(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (int, float, Decimal)):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    text_value = str(value)
    if text_value.startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + text_value
    return text_value


def csv_bytes(headers: list[str], rows) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(headers)
    for row in rows:
        writer.writerow([csv_safe(value) for value in row])
    return output.getvalue().encode("utf-8-sig")


def decode_vault_ciphertext(value: str) -> bytes:
    try:
        decoded = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="Vault ciphertext is not valid base64.")
    if len(decoded) > 6_000_000:
        raise HTTPException(status_code=413, detail="Encrypted vault is too large.")
    return decoded


def vault_result(vault: EncryptedVault) -> VaultRead:
    return VaultRead(
        format_version=vault.format_version,
        revision=vault.revision,
        password_kdf_salt=vault.password_kdf_salt,
        password_kdf_iterations=vault.password_kdf_iterations,
        password_wrap_nonce=vault.password_wrap_nonce,
        password_wrapped_key=vault.password_wrapped_key,
        recovery_kdf_salt=vault.recovery_kdf_salt,
        recovery_kdf_iterations=vault.recovery_kdf_iterations,
        recovery_wrap_nonce=vault.recovery_wrap_nonce,
        recovery_wrapped_key=vault.recovery_wrapped_key,
        passkey_envelope=vault.passkey_envelope,
        data_nonce=vault.data_nonce,
        ciphertext=base64.b64encode(vault.ciphertext).decode("ascii"),
    )


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    db.scalar(select(func.count()).select_from(EncryptedVault))
    return {"status": "ok", "database": "connected", "encrypted_vaults": "ready"}


@app.get("/api/auth/registration-status")
def registration_status():
    return {"signup_open": True}


@app.post("/api/auth/signup", status_code=201)
def signup(data: SignupRequest, response: Response, db: Session = Depends(get_db)):
    hashed_password = password_hasher.hash(data.password)
    recovery_code = create_recovery_code()
    user = User(
        email=str(data.email).strip().lower(),
        password_hash=hashed_password,
        recovery_code_hash=hash_recovery_code(recovery_code),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    db.refresh(user)
    token = create_session(db, user.id)
    db.commit()
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=int(SESSION_DURATION.total_seconds()),
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )
    return {"id": user.id, "email": user.email, "recovery_code": recovery_code}


@app.post("/api/auth/reset-password")
def reset_password(
    data: ResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    email = str(data.email).strip().lower()
    client_host = request.client.host if request.client else "unknown"
    throttle_key = login_throttle_key(f"recovery:{email}", client_host)
    throttle = db.get(LoginThrottle, throttle_key)
    retry_after = blocked_seconds(throttle, now)
    if retry_after:
        raise HTTPException(
            status_code=429,
            detail="Too many recovery attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    user = db.scalar(select(User).where(User.email == email))
    supplied_hash = hash_recovery_code(data.recovery_code)
    valid_code = bool(
        user
        and user.recovery_code_hash
        and hmac.compare_digest(supplied_hash, user.recovery_code_hash)
    )
    if not valid_code:
        register_login_failure(db, throttle_key, now)
        raise HTTPException(status_code=400, detail="Email or recovery code is incorrect.")

    vault = db.get(EncryptedVault, user.id)
    if vault is None:
        raise HTTPException(status_code=409, detail="Encrypted vault is not initialized.")

    replacement_code = data.new_recovery_code
    user.password_hash = password_hasher.hash(data.new_password)
    user.recovery_code_hash = hash_recovery_code(replacement_code)
    vault.password_kdf_salt = data.password_kdf_salt
    vault.password_kdf_iterations = data.password_kdf_iterations
    vault.password_wrap_nonce = data.password_wrap_nonce
    vault.password_wrapped_key = data.password_wrapped_key
    vault.recovery_kdf_salt = data.recovery_kdf_salt
    vault.recovery_kdf_iterations = data.recovery_kdf_iterations
    vault.recovery_wrap_nonce = data.recovery_wrap_nonce
    vault.recovery_wrapped_key = data.recovery_wrapped_key
    vault.passkey_envelope = None
    db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
    if throttle is not None:
        db.delete(throttle)
    db.commit()
    return {
        "message": "Password reset. All existing sessions were signed out.",
        "recovery_code": replacement_code,
    }


@app.get("/api/auth/recovery-vault", response_model=RecoveryVaultRead)
def recovery_vault(email: str, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    vault = db.get(EncryptedVault, user.id) if user else None
    if vault is None:
        raise HTTPException(status_code=404, detail="Encrypted recovery information was not found.")
    return RecoveryVaultRead(
        recovery_kdf_salt=vault.recovery_kdf_salt,
        recovery_kdf_iterations=vault.recovery_kdf_iterations,
        recovery_wrap_nonce=vault.recovery_wrap_nonce,
        recovery_wrapped_key=vault.recovery_wrapped_key,
    )


@app.post("/api/auth/login")
def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    email = str(data.email).strip().lower()
    client_host = request.client.host if request.client else "unknown"
    throttle_key = login_throttle_key(email, client_host)
    throttle = db.get(LoginThrottle, throttle_key)
    retry_after = blocked_seconds(throttle, now)
    if retry_after:
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    user = db.scalar(
        select(User).where(User.email == email)
    )

    stored_hash = user.password_hash if user else DUMMY_PASSWORD_HASH
    valid_password = password_hasher.verify(data.password, stored_hash)

    if user is None or not valid_password:
        register_login_failure(db, throttle_key, now)
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    if throttle is not None:
        db.delete(throttle)
    db.execute(delete(LoginSession).where(LoginSession.expires_at <= now))

    # Replace this browser's previous session.
    previous_token = request.cookies.get(COOKIE_NAME)
    if previous_token and len(previous_token) <= 128:
        previous_session = db.get(
            LoginSession,
            hash_token(previous_token),
        )
        if previous_session is not None:
            db.delete(previous_session)

    token = create_session(db, user.id)
    result = {"id": user.id, "email": user.email}
    db.commit()

    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=int(SESSION_DURATION.total_seconds()),
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )

    return result

@app.post("/api/auth/logout", status_code=204)
def logout(
    request: Request,
    db: Session = Depends(get_db),
):
    token = request.cookies.get(COOKIE_NAME)

    if token and len(token) <= 128:
        session = db.get(LoginSession, hash_token(token))

        if session is not None:
            db.delete(session)
            db.commit()

    response = Response(status_code=204)
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
    )
    return response


@app.delete("/api/auth/account", status_code=204)
def delete_account(
    data: DeleteAccountRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not password_hasher.verify(data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Password is incorrect.")
    db.delete(user)
    db.commit()
    response = Response(status_code=204)
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
    )
    return response


@app.get("/api/auth/me")
def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "email": user.email}


@app.get("/api/vault", response_model=VaultRead)
def get_vault(
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    vault = db.get(EncryptedVault, user.id)
    if vault is None:
        raise HTTPException(status_code=404, detail="Encrypted vault is not initialized.")
    return vault_result(vault)


@app.put("/api/vault", response_model=VaultRead)
def put_vault(
    data: VaultWrite,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    ciphertext = decode_vault_ciphertext(data.ciphertext)
    vault = db.scalar(
        select(EncryptedVault)
        .where(EncryptedVault.user_id == user.id)
        .with_for_update()
    )
    if vault is None:
        if data.expected_revision is not None:
            raise HTTPException(status_code=409, detail="Vault revision changed. Reload and try again.")
        vault = EncryptedVault(user_id=user.id, revision=1)
        db.add(vault)
    else:
        if data.expected_revision != vault.revision:
            raise HTTPException(status_code=409, detail="Vault revision changed. Reload and try again.")
        vault.revision += 1

    vault.format_version = data.format_version
    vault.password_kdf_salt = data.password_kdf_salt
    vault.password_kdf_iterations = data.password_kdf_iterations
    vault.password_wrap_nonce = data.password_wrap_nonce
    vault.password_wrapped_key = data.password_wrapped_key
    vault.recovery_kdf_salt = data.recovery_kdf_salt
    vault.recovery_kdf_iterations = data.recovery_kdf_iterations
    vault.recovery_wrap_nonce = data.recovery_wrap_nonce
    vault.recovery_wrapped_key = data.recovery_wrapped_key
    vault.passkey_envelope = data.passkey_envelope
    vault.data_nonce = data.data_nonce
    vault.ciphertext = ciphertext
    db.commit()
    db.refresh(vault)
    return vault_result(vault)


@app.post("/api/auth/change-password")
def change_password(
    data: ChangePasswordRequest,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not password_hasher.verify(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    vault = db.get(EncryptedVault, user.id)
    if vault is None:
        raise HTTPException(status_code=409, detail="Encrypted vault is not initialized.")

    user.password_hash = password_hasher.hash(data.new_password)
    vault.password_kdf_salt = data.password_kdf_salt
    vault.password_kdf_iterations = data.password_kdf_iterations
    vault.password_wrap_nonce = data.password_wrap_nonce
    vault.password_wrapped_key = data.password_wrapped_key
    db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
    token = create_session(db, user.id)
    db.commit()

    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=int(SESSION_DURATION.total_seconds()),
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )
    return {"message": "Password changed. Other sessions were signed out."}


@app.post(
    "/api/accounts",
    response_model=AccountRead,
    status_code=201,
)
def create_account(
    data: AccountSaveRequest,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.default_payment_account_id is not None:
        payment_account = db.scalar(
            select(Account).where(
                Account.id == data.default_payment_account_id,
                Account.user_id == user.id,
                Account.account_type == "bank",
                Account.archived_at.is_(None),
            )
        )
        if payment_account is None:
            raise HTTPException(
                status_code=422,
                detail="Choose an active Bank account as the default payment account.",
            )

    request_id = str(data.request_id)
    payload_hash = account_payload_hash(data)

    receipt = db.get(AccountSaveReceipt, request_id)

    if receipt is not None:
        if (
            receipt.user_id != user.id
            or receipt.payload_hash != payload_hash
        ):
            raise HTTPException(
                status_code=409,
                detail="This save ID was used with different account details.",
            )

        account = db.get(Account, receipt.account_id)

        if account is None or account.user_id != user.id:
            raise HTTPException(
                status_code=410,
                detail="This account is no longer available.",
            )

        response.status_code = 200
        return account

    receipt_created = db.scalar(
        insert(AccountSaveReceipt)
        .values(
            request_id=request_id,
            user_id=user.id,
            account_id=None,
            payload_hash=payload_hash,
        )
        .on_conflict_do_nothing(
            index_elements=["request_id"],
        )
        .returning(AccountSaveReceipt.request_id)
    )

    if receipt_created is None:
        receipt = db.get(AccountSaveReceipt, request_id)

        if (
            receipt is None
            or receipt.user_id != user.id
            or receipt.payload_hash != payload_hash
        ):
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="This save ID was used with different account details.",
            )

        account = db.get(Account, receipt.account_id)

        if account is None or account.user_id != user.id:
            db.rollback()
            raise HTTPException(
                status_code=410,
                detail="This account is no longer available.",
            )

        response.status_code = 200
        return account

    values = data.model_dump(exclude={"request_id"})

    account = Account(
        user_id=user.id,
        **values,
    )
    db.add(account)
    db.flush()

    receipt = db.get(AccountSaveReceipt, request_id)
    receipt.account_id = account.id

    db.commit()
    db.refresh(account)

    return account

@app.get("/api/accounts", response_model=list[AccountRead])
def list_accounts(
    include_archived: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(Account).where(Account.user_id == user.id)
    if not include_archived:
        query = query.where(Account.archived_at.is_(None))
    return db.scalars(query.order_by(Account.id)).all()


@app.post(
    "/api/transactions",
    response_model=TransactionRead,
    status_code=201,
)
def create_transaction(
    data: TransactionSaveRequest,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = db.scalar(
        select(Account).where(
            Account.id == data.account_id,
            Account.user_id == user.id,
        )
    )

    if account is None:
        raise HTTPException(
            status_code=404,
            detail="Account not found",
        )

    request_id = str(data.request_id)
    payload_hash = transaction_payload_hash(data)
    values = data.model_dump(exclude={"request_id"})

    receipt = db.get(TransactionSaveReceipt, request_id)

    if receipt is not None:
        if (
            receipt.user_id != user.id
            or receipt.payload_hash != payload_hash
        ):
            raise HTTPException(
                status_code=409,
                detail="This save ID was used with different details.",
            )

        transaction = db.get(
            Transaction,
            receipt.transaction_id,
        )

        if transaction is None:
            raise HTTPException(
                status_code=410,
                detail="This entry was already deleted.",
            )

        response.status_code = 200
        return transaction

    # Support entries created before durable receipts were added.
    legacy_transaction = db.scalar(
        select(Transaction)
        .join(Account, Transaction.account_id == Account.id)
        .where(
            Transaction.request_id == request_id,
            Account.user_id == user.id,
        )
    )

    if legacy_transaction is not None:
        same_details = all(
            getattr(legacy_transaction, field) == value
            for field, value in values.items()
        )

        if not same_details:
            raise HTTPException(
                status_code=409,
                detail="This save ID was used with different details.",
            )

        db.add(
            TransactionSaveReceipt(
                request_id=request_id,
                user_id=user.id,
                transaction_id=legacy_transaction.id,
                payload_hash=payload_hash,
            )
        )
        db.commit()

        response.status_code = 200
        return legacy_transaction

    if account.archived_at is not None:
        raise HTTPException(status_code=422, detail="This account is archived.")

    balance = calculate_account_balance(db, account)
    if account.account_type == "credit":
        if data.kind == "regular":
            raise HTTPException(
                status_code=422,
                detail="Choose Purchase, Refund, Fee, or Interest for a credit card.",
            )
        if data.type == "expense" and balance - data.amount < -account.credit_limit:
            raise HTTPException(status_code=422, detail="This exceeds the available credit.")
        if data.kind == "card_refund" and data.amount > max(-balance, Decimal("0.00")):
            raise HTTPException(status_code=422, detail="Refund cannot exceed the card debt.")
    else:
        if data.kind != "regular":
            raise HTTPException(status_code=422, detail="Card actions require a credit card.")
        if data.type == "expense" and data.amount > balance:
            raise HTTPException(status_code=422, detail="Not enough money in this account.")

    receipt_created = db.scalar(
        insert(TransactionSaveReceipt)
        .values(
            request_id=request_id,
            user_id=user.id,
            transaction_id=None,
            payload_hash=payload_hash,
        )
        .on_conflict_do_nothing(
            index_elements=["request_id"],
        )
        .returning(TransactionSaveReceipt.request_id)
    )

    if receipt_created is None:
        receipt = db.get(TransactionSaveReceipt, request_id)

        if (
            receipt is None
            or receipt.user_id != user.id
            or receipt.payload_hash != payload_hash
        ):
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="This save ID was used with different details.",
            )

        transaction = db.get(
            Transaction,
            receipt.transaction_id,
        )

        if transaction is None:
            db.rollback()
            raise HTTPException(
                status_code=410,
                detail="This entry was already deleted.",
            )

        response.status_code = 200
        return transaction

    transaction = Transaction(
        request_id=request_id,
        **values,
    )
    db.add(transaction)
    db.flush()

    receipt = db.get(TransactionSaveReceipt, request_id)
    receipt.transaction_id = transaction.id

    db.commit()
    db.refresh(transaction)

    return transaction


@app.get(
    "/api/transactions",
    response_model=list[TransactionRead],
)
def list_transactions(
    account_id: int | None = Query(default=None, gt=0),
    type: Literal["income", "expense"] | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    search: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=10, ge=1, le=10),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if (
        start_date is not None
        and end_date is not None
        and start_date > end_date
    ):
        raise HTTPException(
            status_code=422,
            detail="Start date must not be after end date",
        )

    query = (
        select(Transaction)
        .join(Account, Transaction.account_id == Account.id)
        .where(Account.user_id == user.id)
    )

    if account_id is not None:
        query = query.where(Transaction.account_id == account_id)

    if type is not None:
        query = query.where(Transaction.type == type)

    if start_date is not None:
        query = query.where(Transaction.date >= start_date)

    if end_date is not None:
        query = query.where(Transaction.date <= end_date)

    if search and search.strip():
        # Treat %, _ and / as normal characters in the search.
        search_text = (
            search.strip()
            .replace("/", "//")
            .replace("%", "/%")
            .replace("_", "/_")
        )
        pattern = f"%{search_text}%"

        query = query.where(
            or_(
                Transaction.category.ilike(pattern, escape="/"),
                Transaction.description.ilike(pattern, escape="/"),
            )
        )

    return db.scalars(
        query
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()



def reverse_owned_transaction(
    transaction_id: int,
    user: User,
    db: Session,
) -> None:
    transaction = db.scalar(
        select(Transaction)
        .join(Account, Transaction.account_id == Account.id)
        .where(
            Transaction.id == transaction_id,
            Account.user_id == user.id,
        )
    )

    if transaction is None:
        raise HTTPException(
            status_code=404,
            detail="Transaction not found",
        )

    if transaction.reversed_at is None:
        transaction.reversed_at = datetime.now(timezone.utc)
        db.commit()


@app.post("/api/transactions/{transaction_id}/reverse", status_code=204)
def reverse_transaction(
    transaction_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reverse_owned_transaction(transaction_id, user, db)
    return Response(status_code=204)


@app.delete("/api/transactions/{transaction_id}", status_code=204)
def delete_transaction(
    transaction_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reverse_owned_transaction(transaction_id, user, db)

    return Response(status_code=204)



@app.put(
    "/api/transactions/{transaction_id}",
    response_model=TransactionRead,
)
def update_transaction(
    transaction_id: int,
    data: TransactionCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    transaction = db.scalar(
        select(Transaction)
        .join(Account, Transaction.account_id == Account.id)
        .where(
            Transaction.id == transaction_id,
            Account.user_id == user.id,
        )
    )

    if transaction is None:
        raise HTTPException(
            status_code=404,
            detail="Transaction not found",
        )

    account = db.scalar(
        select(Account).where(
            Account.id == data.account_id,
            Account.user_id == user.id,
        )
    )

    if account is None:
        raise HTTPException(
            status_code=404,
            detail="Account not found",
        )

    if transaction.reversed_at is not None:
        raise HTTPException(status_code=409, detail="Reversed entries cannot be edited.")

    current_account = db.get(Account, transaction.account_id)
    if (
        transaction.kind != "regular"
        or data.kind != "regular"
        or current_account.account_type == "credit"
        or account.account_type == "credit"
    ):
        raise HTTPException(
            status_code=409,
            detail="Reverse this card entry and add the corrected entry.",
        )

    old_effect = transaction.amount if transaction.type == "income" else -transaction.amount
    new_effect = data.amount if data.type == "income" else -data.amount
    if current_account.id == account.id:
        projected = calculate_account_balance(db, account) - old_effect + new_effect
        if projected < 0:
            raise HTTPException(status_code=422, detail="This change would overdraw the account.")
    else:
        old_projected = calculate_account_balance(db, current_account) - old_effect
        new_projected = calculate_account_balance(db, account) + new_effect
        if old_projected < 0 or new_projected < 0:
            raise HTTPException(status_code=422, detail="This change would overdraw an account.")

    for field, value in data.model_dump().items():
        setattr(transaction, field, value)

    db.commit()
    db.refresh(transaction)

    return transaction



@app.get("/api/summary", response_model=SummaryRead)
def get_summary(
    start_date: date,
    end_date: date,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if start_date > end_date:
        raise HTTPException(
            status_code=422,
            detail="Start date must not be after end date",
        )

    totals = db.execute(
        select(
            func.coalesce(
                func.sum(
                    case(
                        (
                            (Transaction.type == "income")
                            & (Transaction.kind == "regular"),
                            Transaction.amount,
                        ),
                        else_=Decimal("0.00"),
                    )
                ),
                Decimal("0.00"),
            ),
            func.coalesce(
                func.sum(
                    case(
                        (Transaction.type == "expense", Transaction.amount),
                        (Transaction.kind == "card_refund", -Transaction.amount),
                        else_=Decimal("0.00"),
                    )
                ),
                Decimal("0.00"),
            ),
        )
        .join(Account, Transaction.account_id == Account.id)
        .where(
            Account.user_id == user.id,
            Account.currency == "EGP",
            Transaction.date >= start_date,
            Transaction.date <= end_date,
            Transaction.reversed_at.is_(None),
        )
    ).one()

    income, expenses = totals

    return SummaryRead(
        start_date=start_date,
        end_date=end_date,
        income=income,
        expenses=expenses,
        surplus=income - expenses,
    )


@app.get(
    "/api/accounts/balances",
    response_model=list[AccountBalanceRead],
)
def get_account_balances(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    transaction_totals = (
        select(
            Transaction.account_id.label("account_id"),
            func.sum(
                case(
                    (Transaction.type == "income", Transaction.amount),
                    else_=Decimal("0.00"),
                )
            ).label("income"),
            func.sum(
                case(
                    (Transaction.type == "expense", Transaction.amount),
                    else_=Decimal("0.00"),
                )
            ).label("expenses"),
        )
        .group_by(Transaction.account_id)
        .where(Transaction.reversed_at.is_(None))
        .subquery()
    )

    transfers_in = (
        select(
            Transfer.to_account_id.label("account_id"),
            func.sum(Transfer.amount).label("total"),
        )
        .group_by(Transfer.to_account_id)
        .where(Transfer.reversed_at.is_(None))
        .subquery()
    )

    transfers_out = (
        select(
            Transfer.from_account_id.label("account_id"),
            func.sum(Transfer.amount).label("total"),
        )
        .group_by(Transfer.from_account_id)
        .where(Transfer.reversed_at.is_(None))
        .subquery()
    )

    rows = db.execute(
        select(
            Account,
            func.coalesce(
                transaction_totals.c.income,
                Decimal("0.00"),
            ),
            func.coalesce(
                transaction_totals.c.expenses,
                Decimal("0.00"),
            ),
            func.coalesce(
                transfers_in.c.total,
                Decimal("0.00"),
            ),
            func.coalesce(
                transfers_out.c.total,
                Decimal("0.00"),
            ),
        )
        .outerjoin(
            transaction_totals,
            transaction_totals.c.account_id == Account.id,
        )
        .outerjoin(
            transfers_in,
            transfers_in.c.account_id == Account.id,
        )
        .outerjoin(
            transfers_out,
            transfers_out.c.account_id == Account.id,
        )
        .where(Account.user_id == user.id, Account.archived_at.is_(None))
        .order_by(Account.id)
    ).all()

    results = []

    for account, income, expenses, received, sent in rows:
        balance = (
            account.opening_balance
            + income
            - expenses
            + received
            - sent
        )

        amount_owed = None
        available_credit = None

        if account.account_type == "credit":
            amount_owed = max(-balance, Decimal("0.00"))
            available_credit = account.credit_limit + balance

        results.append(
            AccountBalanceRead(
                id=account.id,
                name=account.name,
                account_type=account.account_type,
                currency=account.currency,
                opening_balance=account.opening_balance,
                credit_limit=account.credit_limit,
                default_payment_account_id=account.default_payment_account_id,
                archived_at=account.archived_at,
                income=income,
                expenses=expenses,
                balance=balance,
                amount_owed=amount_owed,
                available_credit=available_credit,
            )
        )

    return results


@app.put(
    "/api/accounts/{account_id}",
    response_model=AccountRead,
)
def update_account(
    account_id: int,
    data: AccountCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = db.scalar(
        select(Account).where(
            Account.id == account_id,
            Account.user_id == user.id,
        )
    )

    if account is None:
        raise HTTPException(
            status_code=404,
            detail="Account not found",
        )

    if data.default_payment_account_id is not None:
        payment_account = db.scalar(
            select(Account).where(
                Account.id == data.default_payment_account_id,
                Account.user_id == user.id,
                Account.account_type == "bank",
                Account.archived_at.is_(None),
            )
        )
        if payment_account is None or payment_account.id == account.id:
            raise HTTPException(
                status_code=422,
                detail="Choose an active Bank account as the default payment account.",
            )

    # Credit accounts use different balance rules.
    if (
        account.account_type != data.account_type
        and "credit" in (account.account_type, data.account_type)
    ):
        raise HTTPException(
            status_code=422,
            detail="Create a separate account when switching to or from credit.",
        )

    account.name = data.name
    account.account_type = data.account_type
    account.opening_balance = data.opening_balance
    account.credit_limit = data.credit_limit
    account.default_payment_account_id = data.default_payment_account_id

    db.commit()
    db.refresh(account)

    return account


@app.post("/api/accounts/{account_id}/archive", response_model=AccountRead)
def archive_account(
    account_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = db.scalar(
        select(Account).where(Account.id == account_id, Account.user_id == user.id)
    )
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.archived_at is None:
        account.archived_at = datetime.now(timezone.utc)
        db.execute(
            Account.__table__.update()
            .where(Account.default_payment_account_id == account.id)
            .values(default_payment_account_id=None)
        )
        db.commit()
        db.refresh(account)
    return account



@app.post(
    "/api/transfers",
    response_model=TransferRead,
    status_code=201,
)
def create_transfer(
    data: TransferCreate,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    accounts = db.scalars(
        select(Account).where(
            Account.user_id == user.id,
            Account.archived_at.is_(None),
            Account.id.in_(
                [data.from_account_id, data.to_account_id]
            ),
        ).with_for_update()
    ).all()

    accounts_by_id = {account.id: account for account in accounts}

    if len(accounts_by_id) != 2:
        raise HTTPException(
            status_code=404,
            detail="Account not found",
        )

    source = accounts_by_id[data.from_account_id]
    destination = accounts_by_id[data.to_account_id]

    if source.currency != destination.currency:
        raise HTTPException(
            status_code=422,
            detail="Both accounts must use the same currency.",
        )

    # Cash advances from credit cards need separate handling.
    if source.account_type == "credit":
        raise HTTPException(
            status_code=422,
            detail="Transfer from Cash or Bank. Credit cards can receive payments.",
        )

    request_id = str(data.request_id)
    payload_hash = transfer_payload_hash(data)
    receipt = db.get(TransferSaveReceipt, request_id)
    if receipt is not None:
        if receipt.user_id != user.id or receipt.payload_hash != payload_hash:
            raise HTTPException(status_code=409, detail="This save ID was used with different details.")
        transfer = db.get(Transfer, receipt.transfer_id)
        if transfer is None:
            raise HTTPException(status_code=410, detail="This transfer is no longer available.")
        response.status_code = 200
        return transfer

    legacy_transfer = db.scalar(
        select(Transfer).where(Transfer.request_id == request_id)
    )
    if legacy_transfer is not None:
        values = data.model_dump(exclude={"request_id"})
        if not all(getattr(legacy_transfer, field) == value for field, value in values.items()):
            raise HTTPException(status_code=409, detail="This save ID was used with different details.")
        db.add(
            TransferSaveReceipt(
                request_id=request_id,
                user_id=user.id,
                transfer_id=legacy_transfer.id,
                payload_hash=payload_hash,
            )
        )
        db.commit()
        response.status_code = 200
        return legacy_transfer

    source_balance = calculate_account_balance(db, source)
    if data.amount > source_balance:
        raise HTTPException(status_code=422, detail="Not enough money in the source account.")

    if destination.account_type == "credit":
        card_debt = max(-calculate_account_balance(db, destination), Decimal("0.00"))
        if data.amount > card_debt:
            raise HTTPException(status_code=422, detail="Payment cannot exceed the card debt.")

    values = data.model_dump(exclude={"request_id"})
    receipt_created = db.scalar(
        insert(TransferSaveReceipt)
        .values(
            request_id=request_id,
            user_id=user.id,
            transfer_id=None,
            payload_hash=payload_hash,
        )
        .on_conflict_do_nothing(
            index_elements=["request_id"],
        )
        .returning(TransferSaveReceipt.request_id)
    )
    if receipt_created is None:
        receipt = db.get(TransferSaveReceipt, request_id)
        if receipt is None or receipt.user_id != user.id or receipt.payload_hash != payload_hash:
            db.rollback()
            raise HTTPException(status_code=409, detail="This save ID was used with different details.")
        transfer = db.get(Transfer, receipt.transfer_id)
        if transfer is None:
            db.rollback()
            raise HTTPException(status_code=410, detail="This transfer is no longer available.")
        response.status_code = 200
        return transfer

    transfer = Transfer(request_id=request_id, **values)
    db.add(transfer)
    db.flush()
    receipt = db.get(TransferSaveReceipt, request_id)
    receipt.transfer_id = transfer.id
    if destination.account_type == "credit":
        allocate_card_payment(db, transfer)

    db.commit()
    db.refresh(transfer)

    return transfer


@app.post("/api/transfers/{transfer_id}/reverse", status_code=204)
def reverse_transfer(
    transfer_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_ids = select(Account.id).where(Account.user_id == user.id)
    transfer = db.scalar(
        select(Transfer)
        .where(
            Transfer.id == transfer_id,
            Transfer.from_account_id.in_(owned_ids),
            Transfer.to_account_id.in_(owned_ids),
        )
        .with_for_update()
    )
    if transfer is None:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if transfer.reversed_at is None:
        allocations = db.scalars(
            select(StatementPaymentAllocation)
            .where(StatementPaymentAllocation.transfer_id == transfer.id)
            .with_for_update()
        ).all()
        for allocation in allocations:
            statement = db.get(CreditCardStatement, allocation.statement_id)
            if statement is not None:
                statement.paid_amount = max(
                    statement.paid_amount - allocation.amount,
                    Decimal("0.00"),
                )
            db.delete(allocation)
        transfer.reversed_at = datetime.now(timezone.utc)
        db.commit()
    return Response(status_code=204)


@app.post("/api/statements", response_model=StatementRead, status_code=201)
def create_statement(
    data: StatementCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = db.scalar(
        select(Account).where(
            Account.id == data.account_id,
            Account.user_id == user.id,
            Account.account_type == "credit",
            Account.archived_at.is_(None),
        )
    )
    if account is None:
        raise HTTPException(status_code=404, detail="Credit card not found")
    statement = CreditCardStatement(**data.model_dump())
    db.add(statement)
    db.commit()
    db.refresh(statement)
    return statement_result(statement)


@app.get("/api/statements", response_model=list[StatementRead])
def list_statements(
    account_id: int | None = Query(default=None, gt=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = (
        select(CreditCardStatement)
        .join(Account, CreditCardStatement.account_id == Account.id)
        .where(Account.user_id == user.id)
    )
    if account_id is not None:
        query = query.where(CreditCardStatement.account_id == account_id)
    statements = db.scalars(
        query.order_by(CreditCardStatement.due_date.desc(), CreditCardStatement.id.desc())
    ).all()
    return [statement_result(statement) for statement in statements]


@app.put("/api/statements/{statement_id}", response_model=StatementRead)
def update_statement(
    statement_id: int,
    data: StatementCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    statement = db.scalar(
        select(CreditCardStatement)
        .join(Account, CreditCardStatement.account_id == Account.id)
        .where(CreditCardStatement.id == statement_id, Account.user_id == user.id)
        .with_for_update()
    )
    if statement is None:
        raise HTTPException(status_code=404, detail="Statement not found")
    account = db.scalar(
        select(Account).where(
            Account.id == data.account_id,
            Account.user_id == user.id,
            Account.account_type == "credit",
        )
    )
    if account is None:
        raise HTTPException(status_code=404, detail="Credit card not found")
    if data.amount_due < statement.paid_amount:
        raise HTTPException(
            status_code=422,
            detail="Statement amount cannot be less than payments already allocated.",
        )
    for field, value in data.model_dump().items():
        setattr(statement, field, value)
    db.commit()
    db.refresh(statement)
    return statement_result(statement)


@app.delete("/api/statements/{statement_id}", status_code=204)
def delete_statement(
    statement_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    statement = db.scalar(
        select(CreditCardStatement)
        .join(Account, CreditCardStatement.account_id == Account.id)
        .where(CreditCardStatement.id == statement_id, Account.user_id == user.id)
    )
    if statement is None:
        raise HTTPException(status_code=404, detail="Statement not found")
    if statement.paid_amount > 0:
        raise HTTPException(
            status_code=409,
            detail="Reverse allocated payments before removing this statement.",
        )
    db.delete(statement)
    db.commit()
    return Response(status_code=204)


@app.get(
    "/api/transfers",
    response_model=list[TransferRead],
)
def list_transfers(
    limit: int = Query(default=10, ge=1, le=10),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_account_ids = select(Account.id).where(
        Account.user_id == user.id
    )

    return db.scalars(
        select(Transfer)
        .where(
            Transfer.from_account_id.in_(owned_account_ids),
            Transfer.to_account_id.in_(owned_account_ids),
        )
        .order_by(Transfer.date.desc(), Transfer.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()


@app.get("/api/export")
def export_data(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    accounts = db.scalars(
        select(Account).where(Account.user_id == user.id).order_by(Account.id)
    ).all()
    account_ids = [account.id for account in accounts]
    transactions = db.scalars(
        select(Transaction)
        .where(Transaction.account_id.in_(account_ids))
        .order_by(Transaction.date, Transaction.id)
    ).all()
    transfers = db.scalars(
        select(Transfer)
        .where(
            Transfer.from_account_id.in_(account_ids),
            Transfer.to_account_id.in_(account_ids),
        )
        .order_by(Transfer.date, Transfer.id)
    ).all()
    statements = db.scalars(
        select(CreditCardStatement)
        .where(CreditCardStatement.account_id.in_(account_ids))
        .order_by(CreditCardStatement.closing_date, CreditCardStatement.id)
    ).all()

    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
        bundle.writestr(
            "accounts.csv",
            csv_bytes(
                ["id", "name", "type", "currency", "opening_balance", "credit_limit", "default_payment_account_id", "archived_at", "created_at"],
                (
                    (
                        item.id, item.name, item.account_type, item.currency,
                        item.opening_balance, item.credit_limit,
                        item.default_payment_account_id, item.archived_at, item.created_at,
                    )
                    for item in accounts
                ),
            ),
        )
        bundle.writestr(
            "transactions.csv",
            csv_bytes(
                ["id", "account_id", "type", "kind", "amount", "date", "category", "description", "reversed_at", "created_at"],
                (
                    (
                        item.id, item.account_id, item.type, item.kind, item.amount,
                        item.date, item.category, item.description,
                        item.reversed_at, item.created_at,
                    )
                    for item in transactions
                ),
            ),
        )
        bundle.writestr(
            "transfers.csv",
            csv_bytes(
                ["id", "from_account_id", "to_account_id", "amount", "date", "description", "reversed_at", "created_at"],
                (
                    (
                        item.id, item.from_account_id, item.to_account_id,
                        item.amount, item.date, item.description,
                        item.reversed_at, item.created_at,
                    )
                    for item in transfers
                ),
            ),
        )
        bundle.writestr(
            "statements.csv",
            csv_bytes(
                ["id", "account_id", "opening_date", "closing_date", "due_date", "amount_due", "minimum_payment", "paid_amount", "created_at"],
                (
                    (
                        item.id, item.account_id, item.opening_date,
                        item.closing_date, item.due_date, item.amount_due,
                        item.minimum_payment, item.paid_amount, item.created_at,
                    )
                    for item in statements
                ),
            ),
        )

    archive.seek(0)
    stamp = datetime.now(ZoneInfo("Africa/Cairo")).strftime("%Y-%m-%d")
    return StreamingResponse(
        archive,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="personal-finance-{stamp}.zip"',
            "Cache-Control": "no-store",
        },
    )
