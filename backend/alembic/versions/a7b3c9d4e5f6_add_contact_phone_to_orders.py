"""add_contact_phone_to_orders

Revision ID: a7b3c9d4e5f6
Revises: f8492628e93c
Create Date: 2026-03-23 11:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7b3c9d4e5f6'
down_revision: Union[str, None] = 'f8492628e93c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add contact_phone column to orders table
    op.add_column('orders', sa.Column('contact_phone', sa.String(length=20), nullable=True))


def downgrade() -> None:
    # Remove contact_phone column from orders table
    op.drop_column('orders', 'contact_phone')
