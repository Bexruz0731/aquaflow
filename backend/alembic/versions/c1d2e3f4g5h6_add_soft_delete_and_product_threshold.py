"""add_soft_delete_and_product_threshold

Revision ID: c1d2e3f4g5h6
Revises: b8c4d5e6f7g8
Create Date: 2026-03-26 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c1d2e3f4g5h6'
down_revision: Union[str, None] = 'b8c4d5e6f7g8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Soft-delete flag for clients
    op.add_column('clients', sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'))

    # Per-product inactivity threshold (days)
    op.add_column('products', sa.Column('inactive_threshold_days', sa.Integer(), nullable=False, server_default='30'))


def downgrade() -> None:
    op.drop_column('clients', 'is_deleted')
    op.drop_column('products', 'inactive_threshold_days')
