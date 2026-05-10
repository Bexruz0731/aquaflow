"""add_courier_inventory_table

Revision ID: f8492628e93c
Revises: e1328f511713
Create Date: 2026-03-20 20:14:54.134083

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f8492628e93c'
down_revision: Union[str, None] = 'e1328f511713'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
