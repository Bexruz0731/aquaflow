"""add_courier_cash_collections_table

Revision ID: e1328f511713
Revises: 621e7c4dc734
Create Date: 2026-03-20 08:28:54.961389

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e1328f511713'
down_revision: Union[str, None] = '621e7c4dc734'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
