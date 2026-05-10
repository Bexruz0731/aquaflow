import enum
import uuid
from sqlalchemy import Column, String, Boolean, ForeignKey, Integer, Text, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy import DateTime, func

from app.db.base import Base
from app.models.base_mixin import TimestampMixin


class VolumeUnit(str, enum.Enum):
    LITER = "L"
    ML = "ml"
    DONA = "dona"


class ProductCategory(Base, TimestampMixin):
    __tablename__ = "product_categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(100), nullable=False)
    icon = Column(String(50), nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)

    products = relationship("Product", back_populates="category", lazy="noload")


class Product(Base, TimestampMixin):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("product_categories.id", ondelete="SET NULL"), nullable=True)

    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=True)

    price = Column(Integer, nullable=False)  # in UZS, integer
    volume = Column(Integer, nullable=True)  # numeric value
    volume_unit = Column(Enum(VolumeUnit, native_enum=False), nullable=True)

    inactive_threshold_days = Column(Integer, default=30, nullable=False)
    is_returnable_container = Column(Boolean, default=False, nullable=False)  # 18.9L only
    container_product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL"), nullable=True)  # Link to empty container product
    containers_per_unit = Column(Integer, default=1, nullable=False)  # How many containers per 1 unit of this product
    is_active = Column(Boolean, default=True, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)  # Soft delete — hides from all lists, removes from warehouse/couriers
    show_to_clients = Column(Boolean, default=True, nullable=False)  # False = internal supply item (not in client catalog)

    sort_order = Column(Integer, default=0, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="products", lazy="noload")
    category = relationship("ProductCategory", back_populates="products", lazy="noload")
    price_history = relationship("PriceHistory", back_populates="product", lazy="noload")
    order_items = relationship("OrderItem", back_populates="product", lazy="noload")

    @property
    def volume_liters(self) -> float | None:
        """Alias for volume used by client mini-app."""
        return float(self.volume) if self.volume else None

    @property
    def volume_display(self) -> str:
        if self.volume and self.volume_unit:
            return f"{self.volume}{self.volume_unit.value}"
        return ""


class PriceHistory(Base):
    __tablename__ = "price_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)

    old_price = Column(Integer, nullable=False)
    new_price = Column(Integer, nullable=False)
    changed_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    changed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    product = relationship("Product", back_populates="price_history", lazy="noload")
    changed_by = relationship("User", lazy="noload")
