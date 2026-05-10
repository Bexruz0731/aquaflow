"""operator cash balance and submissions

Revision ID: h3i4j5k6l7m8
Revises: g2h3i4j5k6l7
Create Date: 2026-03-29

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'h3i4j5k6l7m8'
down_revision = 'g2h3i4j5k6l7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('cash_balance', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('card_balance', sa.Integer(), nullable=False, server_default='0'))

    op.create_table(
        'operator_cash_submissions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('operator_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('collected_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('cash_amount', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('card_amount', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_amount', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('submission_date', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['operator_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['collected_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_operator_cash_submissions_tenant_id', 'operator_cash_submissions', ['tenant_id'])
    op.create_index('ix_operator_cash_submissions_operator_id', 'operator_cash_submissions', ['operator_id'])


def downgrade():
    op.drop_index('ix_operator_cash_submissions_operator_id', 'operator_cash_submissions')
    op.drop_index('ix_operator_cash_submissions_tenant_id', 'operator_cash_submissions')
    op.drop_table('operator_cash_submissions')
    op.drop_column('users', 'card_balance')
    op.drop_column('users', 'cash_balance')
