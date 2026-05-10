import uuid
from sqlalchemy import Column, String, Boolean, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.models.base_mixin import TimestampMixin


class Region(Base, TimestampMixin):
    __tablename__ = "regions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    # tenant_id = None → system-level region (shared across all tenants)

    name_uz = Column(String(100), nullable=False)
    name_uz_cyrillic = Column(String(100), nullable=True)
    name_ru = Column(String(100), nullable=True)

    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
