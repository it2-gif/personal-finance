"""add account types and credit limits

Revision ID: 69835002dacd
Revises: 48d20c0f5ffa
Create Date: 2026-10-05 16:17:52.535436
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "69835002dacd"
down_revision: Union[str, Sequence[str], None] = "48d20c0f5ffa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column(
            "account_type",
            sa.String(length=6),
            server_default="cash",
            nullable=False,
        ),
    )

    op.add_column(
        "accounts",
        sa.Column(
            "credit_limit",
            sa.Numeric(precision=14, scale=2),
            nullable=True,
        ),
    )

    op.create_check_constraint(
        "ck_accounts_type",
        "accounts",
        "account_type IN ('cash', 'bank', 'credit')",
    )

    op.create_check_constraint(
        "ck_accounts_credit_fields",
        "accounts",
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
        )
        """,
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_accounts_credit_fields",
        "accounts",
        type_="check",
    )

    op.drop_constraint(
        "ck_accounts_type",
        "accounts",
        type_="check",
    )

    op.drop_column("accounts", "credit_limit")
    op.drop_column("accounts", "account_type")