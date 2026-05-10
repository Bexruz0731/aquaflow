import uuid
from sqlalchemy import Column, String, Boolean, ForeignKey, Integer, DateTime, Text, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum

from app.db.base import Base
from app.models.base_mixin import TimestampMixin


class ShiftStatus(str, enum.Enum):
    OPEN = "open"
    CLOSED = "closed"


class Courier(Base, TimestampMixin):
    __tablename__ = "couriers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    car_number = Column(String(20), nullable=True)   # Moshina raqami
    is_active = Column(Boolean, default=True, nullable=False)
    shift_status = Column(Enum(ShiftStatus, native_enum=False), default=ShiftStatus.CLOSED, nullable=False)
    shift_started_at = Column(DateTime(timezone=True), nullable=True)

    # Current cash balances
    cash_balance = Column(Integer, default=0, nullable=False)     # Naqd
    card_balance = Column(Integer, default=0, nullable=False)     # Plastik
    payme_balance = Column(Integer, default=0, nullable=False)    # Payme

    # Container balances
    full_containers = Column(Integer, default=0, nullable=False)   # to'la — взял со склада
    empty_containers = Column(Integer, default=0, nullable=False)  # bo'sh — собрал у клиентов

    preferred_navigator = Column(String(20), default="yandex", nullable=False)  # yandex / 2gis / google

    # Relationships
    user = relationship("User", back_populates="courier", lazy="noload")
    orders = relationship("Order", back_populates="courier", lazy="noload")
    balance_log = relationship("CourierBalanceLog", back_populates="courier", lazy="noload")


class CourierBalanceLog(Base):
    __tablename__ = "courier_balance_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    courier_id = Column(UUID(as_uuid=True), ForeignKey("couriers.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)

    order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    operation = Column(String(50), nullable=False)  # shift_open / delivery / return / shift_close
    full_containers_delta = Column(Integer, default=0, nullable=False)
    empty_containers_delta = Column(Integer, default=0, nullable=False)
    cash_delta = Column(Integer, default=0, nullable=False)
    card_delta = Column(Integer, default=0, nullable=False)
    payme_delta = Column(Integer, default=0, nullable=False)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=__import__("sqlalchemy").func.now(), nullable=False)

    courier = relationship("Courier", back_populates="balance_log", lazy="noload")


class CourierInventory(Base):
    """Current product inventory for each courier."""
    __tablename__ = "courier_inventory"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    courier_id = Column(UUID(as_uuid=True), ForeignKey("couriers.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)

    quantity = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=__import__("sqlalchemy").func.now(),
                       onupdate=__import__("sqlalchemy").func.now(), nullable=False)

    # Relationships
    courier = relationship("Courier", lazy="noload")
    product = relationship("Product", lazy="noload")


class CourierExpense(Base):
    """Expenses logged by couriers (lunch, fuel, repairs, etc.)."""
    __tablename__ = "courier_expenses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    courier_id = Column(UUID(as_uuid=True), ForeignKey("couriers.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    amount = Column(Integer, nullable=False)
    payment_method = Column(String(10), nullable=False, default="naqd")  # naqd | karta
    created_at = Column(DateTime(timezone=True), server_default=__import__("sqlalchemy").func.now(), nullable=False)

    courier = relationship("Courier", lazy="noload")
