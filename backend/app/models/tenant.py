from sqlalchemy import Column, String, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

from app.db.base import Base
from app.models.base_mixin import TimestampMixin


class Tenant(Base, TimestampMixin):
    __tablename__ = "tenants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    logo_url = Column(String(500), nullable=True)
    bot_token = Column(String(200), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    settings = Column(Text, nullable=True)  # JSON

    # Relationships
    users = relationship("User", back_populates="tenant", lazy="noload")
    clients = relationship("Client", back_populates="tenant", lazy="noload")
    products = relationship("Product", back_populates="tenant", lazy="noload")
    orders = relationship("Order", back_populates="tenant", lazy="noload")
