"""add client groups

Revision ID: g2h3i4j5k6l7
Revises: f1g2h3i4j5k6
Create Date: 2026-03-29

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'g2h3i4j5k6l7'
down_revision = 'f1g2h3i4j5k6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'client_groups',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_client_groups_tenant_id', 'client_groups', ['tenant_id'])

    op.add_column('clients', sa.Column('group_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_clients_group_id', 'clients', 'client_groups', ['group_id'], ['id'], ondelete='SET NULL'
    )
    op.create_index('ix_clients_group_id', 'clients', ['group_id'])


def downgrade():
    op.drop_index('ix_clients_group_id', 'clients')
    op.drop_constraint('fk_clients_group_id', 'clients', type_='foreignkey')
    op.drop_column('clients', 'group_id')
    op.drop_index('ix_client_groups_tenant_id', 'client_groups')
    op.drop_table('client_groups')
