"""add user recovery codes

Revision ID: f82d65c4a913
Revises: e71c4a9d2f30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f82d65c4a913"
down_revision: Union[str, Sequence[str], None] = "e71c4a9d2f30"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("recovery_code_hash", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "recovery_code_hash")
