from datetime import date as DateValue, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


class SignupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class DeleteAccountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: str = Field(min_length=1, max_length=128)


class VaultWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    format_version: int = Field(default=1, ge=1, le=1)
    expected_revision: int | None = Field(default=None, ge=1)
    password_kdf_salt: str = Field(min_length=16, max_length=64)
    password_kdf_iterations: int = Field(ge=210_000, le=2_000_000)
    password_wrap_nonce: str = Field(min_length=16, max_length=32)
    password_wrapped_key: str = Field(min_length=24, max_length=256)
    recovery_kdf_salt: str = Field(min_length=16, max_length=64)
    recovery_kdf_iterations: int = Field(ge=210_000, le=2_000_000)
    recovery_wrap_nonce: str = Field(min_length=16, max_length=32)
    recovery_wrapped_key: str = Field(min_length=24, max_length=256)
    passkey_envelope: str | None = Field(default=None, max_length=4096)
    data_nonce: str = Field(min_length=16, max_length=32)
    ciphertext: str = Field(min_length=24, max_length=8_000_000)


class VaultRead(BaseModel):
    format_version: int
    revision: int
    password_kdf_salt: str
    password_kdf_iterations: int
    password_wrap_nonce: str
    password_wrapped_key: str
    recovery_kdf_salt: str
    recovery_kdf_iterations: int
    recovery_wrap_nonce: str
    recovery_wrapped_key: str
    passkey_envelope: str | None
    data_nonce: str
    ciphertext: str


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)
    password_kdf_salt: str = Field(min_length=16, max_length=64)
    password_kdf_iterations: int = Field(ge=210_000, le=2_000_000)
    password_wrap_nonce: str = Field(min_length=16, max_length=32)
    password_wrapped_key: str = Field(min_length=24, max_length=256)

    @model_validator(mode="after")
    def passwords_must_differ(self):
        if self.current_password == self.new_password:
            raise ValueError("New password must be different from the current password.")
        return self


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    recovery_code: str = Field(min_length=32, max_length=64)
    new_password: str = Field(min_length=12, max_length=128)
    new_recovery_code: str = Field(min_length=32, max_length=64)
    password_kdf_salt: str = Field(min_length=16, max_length=64)
    password_kdf_iterations: int = Field(ge=210_000, le=2_000_000)
    password_wrap_nonce: str = Field(min_length=16, max_length=32)
    password_wrapped_key: str = Field(min_length=24, max_length=256)
    recovery_kdf_salt: str = Field(min_length=16, max_length=64)
    recovery_kdf_iterations: int = Field(ge=210_000, le=2_000_000)
    recovery_wrap_nonce: str = Field(min_length=16, max_length=32)
    recovery_wrapped_key: str = Field(min_length=24, max_length=256)


class RecoveryVaultRead(BaseModel):
    recovery_kdf_salt: str
    recovery_kdf_iterations: int
    recovery_wrap_nonce: str
    recovery_wrapped_key: str


class AccountCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    account_type: Literal["cash", "bank", "credit"] = "cash"
    currency: Literal["EGP"] = "EGP"
    opening_balance: Decimal = Field(default=Decimal("0.00"), max_digits=14, decimal_places=2, allow_inf_nan=False)
    credit_limit: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2, allow_inf_nan=False)
    default_payment_account_id: int | None = Field(default=None, gt=0)

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def check_account_fields(self):
        if self.account_type == "credit":
            if self.credit_limit is None:
                raise ValueError("Enter a credit limit.")
            if self.opening_balance > 0:
                raise ValueError("Enter card debt as zero or a negative balance.")
        elif self.credit_limit is not None or self.default_payment_account_id is not None:
            raise ValueError("Credit settings are only available for credit cards.")
        return self


class AccountSaveRequest(AccountCreate):
    request_id: UUID


class AccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    account_type: Literal["cash", "bank", "credit"]
    currency: str
    opening_balance: Decimal
    credit_limit: Decimal | None
    default_payment_account_id: int | None
    archived_at: datetime | None


class TransactionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    account_id: int = Field(gt=0)
    type: Literal["income", "expense"]
    kind: Literal["regular", "card_purchase", "card_refund", "card_fee", "card_interest"] = "regular"
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2, allow_inf_nan=False)
    date: DateValue
    category: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)

    @field_validator("category", mode="before")
    @classmethod
    def clean_category(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("description", mode="before")
    @classmethod
    def clean_description(cls, value):
        return value.strip() or None if isinstance(value, str) else value

    @model_validator(mode="after")
    def check_kind(self):
        if self.type == "income" and self.kind not in {"regular", "card_refund"}:
            raise ValueError("Entry type and card action do not match.")
        if self.type == "expense" and self.kind not in {"regular", "card_purchase", "card_fee", "card_interest"}:
            raise ValueError("Entry type and card action do not match.")
        return self


class TransactionSaveRequest(TransactionCreate):
    request_id: UUID


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    account_id: int
    type: Literal["income", "expense"]
    kind: str
    amount: Decimal
    date: DateValue
    category: str
    description: str | None
    reversed_at: datetime | None


class SummaryRead(BaseModel):
    start_date: DateValue
    end_date: DateValue
    currency: Literal["EGP"] = "EGP"
    income: Decimal
    expenses: Decimal
    surplus: Decimal


class AccountBalanceRead(BaseModel):
    id: int
    name: str
    account_type: Literal["cash", "bank", "credit"]
    currency: str
    opening_balance: Decimal
    credit_limit: Decimal | None
    default_payment_account_id: int | None
    archived_at: datetime | None
    income: Decimal
    expenses: Decimal
    balance: Decimal
    amount_owed: Decimal | None = None
    available_credit: Decimal | None = None


class TransferCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    from_account_id: int = Field(gt=0)
    to_account_id: int = Field(gt=0)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2, allow_inf_nan=False)
    date: DateValue
    description: str | None = Field(default=None, max_length=500)

    @field_validator("description", mode="before")
    @classmethod
    def clean_description(cls, value):
        return value.strip() or None if isinstance(value, str) else value

    @model_validator(mode="after")
    def check_accounts(self):
        if self.from_account_id == self.to_account_id:
            raise ValueError("Choose two different accounts.")
        return self


class TransferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    from_account_id: int
    to_account_id: int
    amount: Decimal
    date: DateValue
    description: str | None
    reversed_at: datetime | None


class StatementCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    account_id: int = Field(gt=0)
    opening_date: DateValue
    closing_date: DateValue
    due_date: DateValue
    amount_due: Decimal = Field(ge=0, max_digits=14, decimal_places=2, allow_inf_nan=False)
    minimum_payment: Decimal = Field(ge=0, max_digits=14, decimal_places=2, allow_inf_nan=False)

    @model_validator(mode="after")
    def check_statement(self):
        if self.opening_date > self.closing_date:
            raise ValueError("Opening date must not be after closing date.")
        if self.due_date <= self.closing_date:
            raise ValueError("Due date must be after closing date.")
        if self.minimum_payment > self.amount_due:
            raise ValueError("Minimum payment cannot exceed the amount due.")
        return self


class StatementRead(BaseModel):
    id: int
    account_id: int
    opening_date: DateValue
    closing_date: DateValue
    due_date: DateValue
    amount_due: Decimal
    minimum_payment: Decimal
    paid_amount: Decimal
    remaining_amount: Decimal
    status: Literal["paid", "partially_paid", "due_soon", "overdue", "open"]
