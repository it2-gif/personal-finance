"""add transaction request id

Revision ID: 48d20c0f5ffa
Revises: cc27e716b563
Create Date: 2026-10-05 13:20:56.897331

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '48d20c0f5ffa'
down_revision: Union[str, Sequence[str], None] = 'cc27e716b563'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("request_id", sa.String(length=36), nullable=True),
    )
    op.create_unique_constraint(
        "uq_transactions_request_id",
        "transactions",
        ["request_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_transactions_request_id",
        "transactions",
        type_="unique",
    )
    op.drop_column("transactions", "request_id")
