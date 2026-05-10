"""add_container_tracking_to_products

Revision ID: 621e7c4dc734
Revises: 0001
Create Date: 2026-03-20 08:40:20.762346

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '621e7c4dc734'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add container tracking fields to products table
    op.add_column('products', sa.Column('container_product_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('products', sa.Column('containers_per_unit', sa.Integer(), nullable=False, server_default='1'))

    # Add foreign key constraint
    op.create_foreign_key(
        'fk_products_container_product_id',
        'products', 'products',
        ['container_product_id'], ['id'],
        ondelete='SET NULL'
    )


def downgrade() -> None:
    # Drop foreign key constraint
    op.drop_constraint('fk_products_container_product_id', 'products', type_='foreignkey')

    # Remove columns
    op.drop_column('products', 'containers_per_unit')
    op.drop_column('products', 'container_product_id')
