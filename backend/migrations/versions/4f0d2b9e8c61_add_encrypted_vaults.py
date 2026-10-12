"""add encrypted vaults

Revision ID: 4f0d2b9e8c61
Revises: f82d65c4a913
Create Date: 2026-10-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4f0d2b9e8c61"
down_revision: Union[str, None] = "f82d65c4a913"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "encrypted_vaults",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("format_version", sa.Integer(), nullable=False),
        sa.Column("revision", sa.BigInteger(), nullable=False),
        sa.Column("password_kdf_salt", sa.String(length=64), nullable=False),
        sa.Column("password_kdf_iterations", sa.Integer(), nullable=False),
        sa.Column("password_wrap_nonce", sa.String(length=32), nullable=False),
        sa.Column("password_wrapped_key", sa.Text(), nullable=False),
        sa.Column("recovery_kdf_salt", sa.String(length=64), nullable=False),
        sa.Column("recovery_kdf_iterations", sa.Integer(), nullable=False),
        sa.Column("recovery_wrap_nonce", sa.String(length=32), nullable=False),
        sa.Column("recovery_wrapped_key", sa.Text(), nullable=False),
        sa.Column("passkey_envelope", sa.Text(), nullable=True),
        sa.Column("data_nonce", sa.String(length=32), nullable=False),
        sa.Column("ciphertext", sa.LargeBinary(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )
    # This deployment intentionally starts the encrypted product with a clean
    # test database. The owner confirmed that no production client data exists.
    op.execute("DELETE FROM statement_payment_allocations")
    op.execute("DELETE FROM credit_card_statements")
    op.execute("DELETE FROM transfer_save_receipts")
    op.execute("DELETE FROM transfers")
    op.execute("DELETE FROM transaction_save_receipts")
    op.execute("DELETE FROM transactions")
    op.execute("DELETE FROM account_save_receipts")
    op.execute("DELETE FROM accounts")
    op.execute("DELETE FROM login_sessions")
    op.execute("DELETE FROM login_throttles")
    op.execute("DELETE FROM users")


def downgrade() -> None:
    op.drop_table("encrypted_vaults")
