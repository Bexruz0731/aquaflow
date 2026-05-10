import uuid
import enum
from sqlalchemy import Column, String, Boolean, ForeignKey, Integer, Text, Enum, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.base_mixin import TimestampMixin


class StockStatus(str, enum.Enum):
    OK = "ok"          # Qoniqarli
    LOW = "low"        # Kam qoldi
    OUT = "out"        # Tugagan


class WarehouseTransactionType(str, enum.Enum):
    KIRIM = "kirim"    # income
    CHIQIM = "chiqim"  # expense


class WarehouseItem(Base, TimestampMixin):
    """Types of items tracked in warehouse."""
    __tablename__ = "warehouse_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=True)

    name = Column(String(200), nullable=False)
    unit = Column(String(20), nullable=False, default="ta")  # ta / dona / kg / litr
    is_container = Column(Boolean, default=False, nullable=False)
    is_full = Column(Boolean, default=True, nullable=False)   # full vs empty (for 18.9L)

    low_threshold = Column(Integer, default=50, nullable=False)   # Kam qoldi threshold
    out_threshold = Column(Integer, default=10, nullable=False)   # Tugagan threshold

    stocks = relationship("WarehouseStock", back_populates="item", lazy="noload")
    transactions = relationship("WarehouseTransaction", back_populates="item", lazy="noload")


class WarehouseStock(Base):
    """Current stock levels."""
    __tablename__ = "warehouse_stock"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(UUID(as_uuid=True), ForeignKey("warehouse_items.id", ondelete="CASCADE"), nullable=False)

    quantity = Column(Integer, default=0, nullable=False)  # Full/finished products
    empty_quantity = Column(Integer, default=0, nullable=False)  # Empty containers (for returnable products)

    item = relationship("WarehouseItem", back_populates="stocks", lazy="noload")

    @property
    def status(self) -> StockStatus:
        if self.item and self.quantity <= self.item.out_threshold:
            return StockStatus.OUT
        if self.item and self.quantity <= self.item.low_threshold:
            return StockStatus.LOW
        return StockStatus.OK


class WarehouseTransaction(Base):
    """All stock movements."""
    __tablename__ = "warehouse_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(UUID(as_uuid=True), ForeignKey("warehouse_items.id", ondelete="RESTRICT"), nullable=False)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    courier_id = Column(UUID(as_uuid=True), ForeignKey("couriers.id", ondelete="SET NULL"), nullable=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    transaction_type = Column(Enum(WarehouseTransactionType, native_enum=False), nullable=False)
    quantity = Column(Integer, nullable=False)
    balance_before = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    item = relationship("WarehouseItem", back_populates="transactions", lazy="noload")
    created_by = relationship("User", lazy="noload")
    courier = relationship("Courier", lazy="noload")
