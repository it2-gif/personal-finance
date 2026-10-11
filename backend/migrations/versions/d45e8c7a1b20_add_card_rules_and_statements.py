"""add card rules and statements

Revision ID: d45e8c7a1b20
Revises: 9cf34278a851
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d45e8c7a1b20"
down_revision: Union[str, Sequence[str], None] = "9cf34278a851"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("default_payment_account_id", sa.Integer(), nullable=True))
    op.add_column("accounts", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        "fk_accounts_default_payment_account",
        "accounts",
        "accounts",
        ["default_payment_account_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.drop_constraint("ck_accounts_credit_fields", "accounts", type_="check")
    op.create_check_constraint(
        "ck_accounts_credit_fields",
        "accounts",
        """
        (account_type = 'credit' AND credit_limit IS NOT NULL
         AND credit_limit > 0 AND opening_balance <= 0)
        OR
        (account_type IN ('cash', 'bank') AND credit_limit IS NULL
         AND default_payment_account_id IS NULL)
        """,
    )

    op.add_column(
        "transactions",
        sa.Column("kind", sa.String(length=20), server_default="regular", nullable=False),
    )
    op.add_column("transactions", sa.Column("reversed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint(
        "ck_transactions_kind",
        "transactions",
        "kind IN ('regular', 'card_purchase', 'card_refund', 'card_fee', 'card_interest')",
    )

    op.add_column("transfers", sa.Column("reversed_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "transfer_save_receipts",
        sa.Column("request_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("transfer_id", sa.Integer(), nullable=True),
        sa.Column("payload_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("request_id"),
    )
    op.create_index("ix_transfer_save_receipts_user_id", "transfer_save_receipts", ["user_id"])

    op.create_table(
        "credit_card_statements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("opening_date", sa.Date(), nullable=False),
        sa.Column("closing_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("amount_due", sa.Numeric(14, 2), nullable=False),
        sa.Column("minimum_payment", sa.Numeric(14, 2), nullable=False),
        sa.Column("paid_amount", sa.Numeric(14, 2), server_default="0.00", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("amount_due >= 0", name="ck_statements_amount_due"),
        sa.CheckConstraint(
            "minimum_payment >= 0 AND minimum_payment <= amount_due",
            name="ck_statements_minimum_payment",
        ),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("account_id", "closing_date", name="uq_statements_account_closing_date"),
    )
    op.create_index("ix_credit_card_statements_account_id", "credit_card_statements", ["account_id"])
    op.create_index("ix_credit_card_statements_closing_date", "credit_card_statements", ["closing_date"])
    op.create_index("ix_credit_card_statements_due_date", "credit_card_statements", ["due_date"])

    op.create_table(
        "statement_payment_allocations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transfer_id", sa.Integer(), nullable=False),
        sa.Column("statement_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_allocations_positive_amount"),
        sa.ForeignKeyConstraint(["transfer_id"], ["transfers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["statement_id"], ["credit_card_statements.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("transfer_id", "statement_id", name="uq_allocation_transfer_statement"),
    )
    op.create_index("ix_allocations_transfer_id", "statement_payment_allocations", ["transfer_id"])
    op.create_index("ix_allocations_statement_id", "statement_payment_allocations", ["statement_id"])


def downgrade() -> None:
    op.drop_table("statement_payment_allocations")
    op.drop_table("credit_card_statements")
    op.drop_table("transfer_save_receipts")
    op.drop_column("transfers", "reversed_at")
    op.drop_constraint("ck_transactions_kind", "transactions", type_="check")
    op.drop_column("transactions", "reversed_at")
    op.drop_column("transactions", "kind")
    op.drop_constraint("ck_accounts_credit_fields", "accounts", type_="check")
    op.create_check_constraint(
        "ck_accounts_credit_fields",
        "accounts",
        """
        (account_type = 'credit' AND credit_limit IS NOT NULL
         AND credit_limit > 0 AND opening_balance <= 0)
        OR (account_type IN ('cash', 'bank') AND credit_limit IS NULL)
        """,
    )
    op.drop_constraint("fk_accounts_default_payment_account", "accounts", type_="foreignkey")
    op.drop_column("accounts", "archived_at")
    op.drop_column("accounts", "default_payment_account_id")
