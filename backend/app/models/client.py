import uuid
from sqlalchemy import Column, String, Boolean, ForeignKey, Integer, Text, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.base_mixin import TimestampMixin


class ClientGroup(Base, TimestampMixin):
    """Client segment/group — used to split client base (e.g. by product type or source)."""
    __tablename__ = "client_groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    inactive_threshold_days = Column(Integer, default=30, nullable=False)

    clients = relationship("Client", back_populates="group", lazy="noload")


class Client(Base, TimestampMixin):
    __tablename__ = "clients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=True)
    phone = Column(String(20), nullable=False, index=True)

    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    is_blocked = Column(Boolean, default=False, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)
    has_contract = Column(Boolean, default=False, nullable=False)

    # Container debt (initial balance set manually)
    container_balance = Column(Integer, default=0, nullable=False)  # bottles at client

    # Financial
    debt_amount = Column(Integer, default=0, nullable=False)   # in UZS, integer
    advance_amount = Column(Integer, default=0, nullable=False)  # overpayment

    company_name = Column(String(200), nullable=True)
    notes = Column(Text, nullable=True)

    group_id = Column(UUID(as_uuid=True), ForeignKey("client_groups.id", ondelete="SET NULL"), nullable=True, index=True)

    # Relationships
    tenant = relationship("Tenant", back_populates="clients", lazy="noload")
    user = relationship("User", back_populates="client", lazy="noload")
    addresses = relationship("ClientAddress", back_populates="client", lazy="noload")
    orders = relationship("Order", back_populates="client", lazy="noload")
    container_transactions = relationship("ContainerTransaction", back_populates="client", lazy="noload")
    debt_transactions = relationship("DebtTransaction", back_populates="client", lazy="noload")
    group = relationship("ClientGroup", back_populates="clients", lazy="noload")

    @property
    def full_name(self) -> str:
        if self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.first_name

    @property
    def initials(self) -> str:
        parts = self.full_name.split()
        return "".join(p[0].upper() for p in parts[:2])


class ClientAddress(Base, TimestampMixin):
    __tablename__ = "client_addresses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)

    label = Column(String(50), nullable=False)  # Uy / Ish / Boshqa / custom
    address_text = Column(String(500), nullable=False)
    landmark = Column(String(200), nullable=True)  # Mo'ljal
    apartment = Column(String(50), nullable=True)  # Kvartira
    floor = Column(String(20), nullable=True)
    entrance = Column(String(20), nullable=True)

    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    region_id = Column(UUID(as_uuid=True), ForeignKey("regions.id", ondelete="SET NULL"), nullable=True)
    city = Column(String(100), nullable=True)

    is_primary = Column(Boolean, default=False, nullable=False)

    # Relationships
    client = relationship("Client", back_populates="addresses", lazy="noload")
    region = relationship("Region", lazy="noload")
