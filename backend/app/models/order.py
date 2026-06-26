import enum
import uuid
from sqlalchemy import Column, String, Boolean, ForeignKey, Integer, Text, Enum, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.base_mixin import TimestampMixin


class OrderStatus(str, enum.Enum):
    YANGI = "yangi"
    QABUL_QILINDI = "qabul_qilindi"
    TAYINLANDI = "tayinlandi"
    YOLDA = "yolda"
    YETKAZILDI = "yetkazildi"
    BEKOR_QILINDI = "bekor_qilindi"
    MUAMMO = "muammo"
    YOPILDI = "yopildi"


class PaymentStatus(str, enum.Enum):
    TOLANGAN = "tolangan"
    TOLANMAGAN = "tolanmagan"
    QISMAN = "qisman"


class PaymentMethod(str, enum.Enum):
    NAQD = "NAQD"
    KARTA = "KARTA"
    PLASTIK = "PLASTIK"  # Deprecated, use KARTA
    PAYME = "PAYME"
    CLICK = "CLICK"
    QARZ = "QARZ"


class Order(Base, TimestampMixin):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, autoincrement=True)  # sequential for display (#52, #65...)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="RESTRICT"), nullable=True, index=True)
    courier_id = Column(UUID(as_uuid=True), ForeignKey("couriers.id", ondelete="SET NULL"), nullable=True, index=True)
    address_id = Column(UUID(as_uuid=True), ForeignKey("client_addresses.id", ondelete="SET NULL"), nullable=True)

    status = Column(Enum(OrderStatus, native_enum=False, values_callable=lambda x: [m.value for m in x]), nullable=False, default=OrderStatus.YANGI, index=True)
    payment_status = Column(Enum(PaymentStatus, native_enum=False, values_callable=lambda x: [m.value for m in x]), nullable=False, default=PaymentStatus.TOLANMAGAN)
    payment_method = Column(Enum(PaymentMethod, native_enum=False, values_callable=lambda x: [m.value for m in x]), nullable=True)

    total_amount = Column(Integer, nullable=False, default=0)   # in UZS (sum of items)
    discount_amount = Column(Integer, nullable=False, default=0) # discount given
    paid_amount = Column(Integer, nullable=False, default=0)    # amount paid (total)
    cash_amount = Column(Integer, nullable=False, default=0)    # paid in cash
    card_amount = Column(Integer, nullable=False, default=0)    # paid by card
    payme_amount = Column(Integer, nullable=False, default=0)   # paid via Payme/Click
    advance_used = Column(Integer, nullable=False, default=0)   # advance applied from client balance
    debt_amount = Column(Integer, nullable=False, default=0)    # remaining debt after discount

    containers_delivered = Column(Integer, default=0, nullable=False)  # 18.9L delivered
    containers_returned = Column(Integer, default=0, nullable=False)   # 18.9L returned by client

    comment = Column(Text, nullable=True)
    cancel_reason = Column(Text, nullable=True)
    problem_reason = Column(Text, nullable=True)
    contact_phone = Column(String(20), nullable=True)  # Phone number for courier to contact

    is_phone_order = Column(Boolean, default=False, nullable=False)  # created by operator via phone
    is_walkin = Column(Boolean, default=False, nullable=False)  # quick sale without registered client

    # Soft delete
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    deleted_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    walkin_phone = Column(String(20), nullable=True)
    walkin_address = Column(String(300), nullable=True)
    walkin_store = Column(String(200), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    tenant = relationship("Tenant", back_populates="orders", lazy="noload")
    client = relationship("Client", back_populates="orders", lazy="noload")
    courier = relationship("Courier", back_populates="orders", lazy="noload")
    address = relationship("ClientAddress", lazy="noload")
    items = relationship("OrderItem", back_populates="order", lazy="noload", cascade="all, delete-orphan")
    status_history = relationship("OrderStatusHistory", back_populates="order", lazy="noload", order_by="OrderStatusHistory.created_at")


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)

    quantity = Column(Integer, nullable=False, default=1)
    delivered_quantity = Column(Integer, nullable=False)  # actual delivered qty (can be less than ordered)
    price_at_order = Column(Integer, nullable=False)   # price FIXED at order creation
    total = Column(Integer, nullable=False)            # quantity * price_at_order

    order = relationship("Order", back_populates="items", lazy="noload")
    product = relationship("Product", back_populates="order_items", lazy="noload")


class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)

    status = Column(Enum(OrderStatus, native_enum=False, values_callable=lambda x: [m.value for m in x]), nullable=False)
    changed_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    order = relationship("Order", back_populates="status_history", lazy="noload")
    changed_by = relationship("User", lazy="noload")
