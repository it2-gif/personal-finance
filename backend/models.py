from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import UniqueConstraint
from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    LargeBinary,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(
        String(254),
        unique=True,
        nullable=False,
    )
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    recovery_code_hash: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class LoginSession(Base):
    __tablename__ = "login_sessions"

    token_hash: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        index=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class EncryptedVault(Base):
    """Opaque client-encrypted financial data and key envelopes."""

    __tablename__ = "encrypted_vaults"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    format_version: Mapped[int] = mapped_column(nullable=False, default=1)
    revision: Mapped[int] = mapped_column(BigInteger, nullable=False, default=1)
    password_kdf_salt: Mapped[str] = mapped_column(String(64), nullable=False)
    password_kdf_iterations: Mapped[int] = mapped_column(nullable=False)
    password_wrap_nonce: Mapped[str] = mapped_column(String(32), nullable=False)
    password_wrapped_key: Mapped[str] = mapped_column(Text, nullable=False)
    recovery_kdf_salt: Mapped[str] = mapped_column(String(64), nullable=False)
    recovery_kdf_iterations: Mapped[int] = mapped_column(nullable=False)
    recovery_wrap_nonce: Mapped[str] = mapped_column(String(32), nullable=False)
    recovery_wrapped_key: Mapped[str] = mapped_column(Text, nullable=False)
    passkey_envelope: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_nonce: Mapped[str] = mapped_column(String(32), nullable=False)
    ciphertext: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Account(Base):
    __tablename__ = "accounts"

    __table_args__ = (
        CheckConstraint(
            "account_type IN ('cash', 'bank', 'credit')",
            name="ck_accounts_type",
        ),
        CheckConstraint(
            """
            (
                account_type = 'credit'
                AND credit_limit IS NOT NULL
                AND credit_limit > 0
                AND opening_balance <= 0
            )
            OR
            (
                account_type IN ('cash', 'bank')
                AND credit_limit IS NULL
                AND default_payment_account_id IS NULL
            )
            """,
            name="ck_accounts_credit_fields",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    account_type: Mapped[str] = mapped_column(
        String(6),
        nullable=False,
        default="cash",
        server_default="cash",
    )

    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="EGP",
    )

    opening_balance: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        nullable=False,
        default=Decimal("0.00"),
    )

    credit_limit: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 2),
        nullable=True,
    )

    default_payment_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="SET NULL"),
        nullable=True,
    )

    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

class AccountSaveReceipt(Base):
    __tablename__ = "account_save_receipts"

    request_id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    account_id: Mapped[int | None] = mapped_column(
        nullable=True,
    )

    payload_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

class Transaction(Base):
    __tablename__ = "transactions"

    __table_args__ = (
        CheckConstraint(
            "amount > 0",
            name="ck_transactions_positive_amount",
        ),
        CheckConstraint(
            "type IN ('income', 'expense')",
            name="ck_transactions_type",
        ),
        CheckConstraint(
            "kind IN ('regular', 'card_purchase', 'card_refund', 'card_fee', 'card_interest')",
            name="ck_transactions_kind",
        ),
        UniqueConstraint(
            "request_id",
            name="uq_transactions_request_id",
        ),
    )


    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
    )
    
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    type: Mapped[str] = mapped_column(
        String(7),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="regular",
        server_default="regular",
    )
    amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        nullable=False,
    )
    date: Mapped[date] = mapped_column(
        Date,
        index=True,
        nullable=False,
    )
    category: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    reversed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class LoginThrottle(Base):
    __tablename__ = "login_throttles"

    key_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    failed_attempts: Mapped[int] = mapped_column(nullable=False, default=0)
    window_started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    blocked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

class TransactionSaveReceipt(Base):
    __tablename__ = "transaction_save_receipts"

    request_id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    transaction_id: Mapped[int | None] = mapped_column(
        nullable=True,
    )

    payload_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
class TransferSaveReceipt(Base):
    __tablename__ = "transfer_save_receipts"

    request_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    transfer_id: Mapped[int | None] = mapped_column(nullable=True)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class CreditCardStatement(Base):
    __tablename__ = "credit_card_statements"

    __table_args__ = (
        CheckConstraint("amount_due >= 0", name="ck_statements_amount_due"),
        CheckConstraint(
            "minimum_payment >= 0 AND minimum_payment <= amount_due",
            name="ck_statements_minimum_payment",
        ),
        UniqueConstraint(
            "account_id", "closing_date", name="uq_statements_account_closing_date"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    opening_date: Mapped[date] = mapped_column(Date, nullable=False)
    closing_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    amount_due: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    minimum_payment: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00"), server_default="0.00"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class StatementPaymentAllocation(Base):
    __tablename__ = "statement_payment_allocations"

    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_allocations_positive_amount"),
        UniqueConstraint(
            "transfer_id", "statement_id", name="uq_allocation_transfer_statement"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    transfer_id: Mapped[int] = mapped_column(
        ForeignKey("transfers.id", ondelete="CASCADE"), index=True, nullable=False
    )
    statement_id: Mapped[int] = mapped_column(
        ForeignKey("credit_card_statements.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)


class Transfer(Base):
    __tablename__ = "transfers"

    __table_args__ = (
        CheckConstraint(
            "amount > 0",
            name="ck_transfers_positive_amount",
        ),
        CheckConstraint(
            "from_account_id <> to_account_id",
            name="ck_transfers_different_accounts",
        ),
        UniqueConstraint(
            "request_id",
            name="uq_transfers_request_id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    request_id: Mapped[str] = mapped_column(
        String(36),
        nullable=False,
    )

    from_account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )

    to_account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )

    amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        nullable=False,
    )

    date: Mapped[date] = mapped_column(
        Date,
        index=True,
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    reversed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
