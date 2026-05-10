"""add_missing_tables_and_columns

Revision ID: d4e5f6g7h8i9
Revises: c1d2e3f4g5h6
Create Date: 2026-03-26 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'd4e5f6g7h8i9'
down_revision: Union[str, None] = 'c1d2e3f4g5h6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add cash_amount and card_amount to orders
    op.add_column('orders', sa.Column('cash_amount', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('orders', sa.Column('card_amount', sa.Integer(), nullable=False, server_default='0'))

    # Add empty_quantity to warehouse_stock
    op.add_column('warehouse_stock', sa.Column('empty_quantity', sa.Integer(), nullable=False, server_default='0'))
    op.create_check_constraint(
        'check_warehouse_stock_quantity_non_negative',
        'warehouse_stock',
        'quantity >= 0 AND empty_quantity >= 0'
    )

    # Create courier_cash_collections table
    op.create_table(
        'courier_cash_collections',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('courier_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('couriers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('collected_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('cash_amount', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('card_amount', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('payme_amount', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_amount', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('full_containers_returned', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('empty_containers_returned', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('orders_completed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('collection_date', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('idx_courier_cash_collections_tenant', 'courier_cash_collections', ['tenant_id'])
    op.create_index('idx_courier_cash_collections_courier', 'courier_cash_collections', ['courier_id'])

    # Create courier_inventory table
    op.create_table(
        'courier_inventory',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('courier_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('couriers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('product_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('products.id', ondelete='CASCADE'), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True, server_default=sa.text('now()')),
        sa.UniqueConstraint('courier_id', 'product_id', name='courier_inventory_courier_id_product_id_key'),
        sa.CheckConstraint('quantity >= 0', name='check_courier_inventory_quantity_non_negative'),
    )
    op.create_index('idx_courier_inventory_courier', 'courier_inventory', ['courier_id'])
    op.create_index('idx_courier_inventory_product', 'courier_inventory', ['product_id'])
    op.create_index('idx_courier_inventory_full', 'courier_inventory', ['courier_id', 'product_id', 'quantity'])


def downgrade() -> None:
    op.drop_table('courier_inventory')
    op.drop_table('courier_cash_collections')
    op.drop_column('warehouse_stock', 'empty_quantity')
    op.drop_column('orders', 'card_amount')
    op.drop_column('orders', 'cash_amount')
