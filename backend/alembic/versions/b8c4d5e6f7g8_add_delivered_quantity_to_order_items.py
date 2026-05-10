"""add_delivered_quantity_to_order_items

Revision ID: b8c4d5e6f7g8
Revises: a7b3c9d4e5f6
Create Date: 2026-03-23 12:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8c4d5e6f7g8'
down_revision: Union[str, None] = 'a7b3c9d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add delivered_quantity column to order_items table
    # Default to quantity (what was ordered) for existing records
    op.add_column('order_items', sa.Column('delivered_quantity', sa.Integer(), nullable=True))

    # Update existing records: set delivered_quantity = quantity
    op.execute('UPDATE order_items SET delivered_quantity = quantity WHERE delivered_quantity IS NULL')

    # Make it non-nullable after populating
    op.alter_column('order_items', 'delivered_quantity', nullable=False)


def downgrade() -> None:
    # Remove delivered_quantity column from order_items table
    op.drop_column('order_items', 'delivered_quantity')
