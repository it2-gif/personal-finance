"""add login throttling

Revision ID: e71c4a9d2f30
Revises: d45e8c7a1b20
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e71c4a9d2f30"
down_revision: Union[str, Sequence[str], None] = "d45e8c7a1b20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "login_throttles",
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column("failed_attempts", sa.Integer(), nullable=False),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("blocked_until", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("key_hash"),
    )


def downgrade() -> None:
    op.drop_table("login_throttles")
