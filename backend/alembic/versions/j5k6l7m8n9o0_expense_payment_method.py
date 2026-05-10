"""add payment_method to courier_expenses

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-04-25

"""
from alembic import op
import sqlalchemy as sa

revision = 'j5k6l7m8n9o0'
down_revision = 'i4j5k6l7m8n9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('courier_expenses', sa.Column('payment_method', sa.String(10), nullable=False, server_default='naqd'))


def downgrade():
    op.drop_column('courier_expenses', 'payment_method')
