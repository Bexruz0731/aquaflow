# Import all models here so Alembic can detect them via Base.metadata

from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.region import Region
from app.models.client import Client, ClientAddress
from app.models.product import Product, ProductCategory, PriceHistory
from app.models.courier import Courier, CourierBalanceLog
from app.models.order import Order, OrderItem, OrderStatusHistory, OrderStatus, PaymentStatus, PaymentMethod
from app.models.warehouse import WarehouseItem, WarehouseStock, WarehouseTransaction
from app.models.finance import (
    Debt, DebtTransaction, ContainerClientBalance, ContainerTransaction,
    TreasuryTransaction, TreasuryTransactionType, TreasuryCategory,
    CourierCashCollection,
)
from app.models.notifications import NotificationLog, AuditLog, Settings

__all__ = [
    "Tenant", "User", "UserRole",
    "Region",
    "Client", "ClientAddress",
    "Product", "ProductCategory", "PriceHistory",
    "Courier", "CourierBalanceLog",
    "Order", "OrderItem", "OrderStatusHistory", "OrderStatus", "PaymentStatus", "PaymentMethod",
    "WarehouseItem", "WarehouseStock", "WarehouseTransaction",
    "Debt", "DebtTransaction", "ContainerClientBalance", "ContainerTransaction",
    "TreasuryTransaction", "TreasuryTransactionType", "TreasuryCategory", "CourierCashCollection",
    "NotificationLog", "AuditLog", "Settings",
]
