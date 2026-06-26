import uuid
import enum
from sqlalchemy import Column, String, ForeignKey, Integer, Text, Enum, DateTime, Boolean, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.order import PaymentMethod


class DebtTransactionType(str, enum.Enum):
    DEBT = "debt"             # new debt created
    PAYMENT = "payment"       # debt paid
    ADVANCE = "advance"       # client paid more than owed / manual advance added
    ADVANCE_USED = "advance_used"  # advance used for order
    ADJUSTMENT = "adjustment" # manual debt correction (write-off / forgiveness)


class Debt(Base):
    """Current debt state per client per order."""
    __tablename__ = "debts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)

    original_amount = Column(Integer, nullable=False)   # total debt from this order
    remaining_amount = Column(Integer, nullable=False)  # remaining to pay
    is_paid = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    paid_at = Column(DateTime(timezone=True), nullable=True)

    client = relationship("Client", lazy="noload")
    transactions = relationship("DebtTransaction", back_populates="debt", lazy="noload")


class DebtTransaction(Base):
    """Immutable log of all debt operations."""
    __tablename__ = "debt_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    debt_id = Column(UUID(as_uuid=True), ForeignKey("debts.id", ondelete="CASCADE"), nullable=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    transaction_type = Column(Enum(DebtTransactionType, native_enum=False, values_callable=lambda x: [m.value for m in x]), nullable=False)
    amount = Column(Integer, nullable=False)           # positive = debt, negative = payment
    payment_method = Column(Enum(PaymentMethod, native_enum=False, values_callable=lambda x: [m.value for m in x]), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    debt = relationship("Debt", back_populates="transactions", lazy="noload")
    client = relationship("Client", back_populates="debt_transactions", lazy="noload")
    created_by = relationship("User", lazy="noload")


class ContainerClientBalance(Base):
    """Current container balance per client."""
    __tablename__ = "container_client_balance"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, unique=True)

    balance = Column(Integer, default=0, nullable=False)  # number of 18.9L bottles at client


class ContainerTransaction(Base):
    """All 18.9L container movements per client."""
    __tablename__ = "container_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    transaction_type = Column(String(20), nullable=False)  # delivered / returned / adjustment
    quantity = Column(Integer, nullable=False)              # + delivered, - returned
    balance_before = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    client = relationship("Client", back_populates="container_transactions", lazy="noload")
    created_by = relationship("User", lazy="noload")


class TreasuryTransactionType(str, enum.Enum):
    KIRIM = "kirim"
    CHIQIM = "chiqim"


class TreasuryCategory(str, enum.Enum):
    # Income
    SUV_SAVDOSI = "suv_savdosi"
    KULER_IJARASI = "kuler_ijarasi"
    AVANS = "avans"
    BOSHQA_KIRIM = "boshqa_kirim"
    # Expense
    YOQILGI = "yoqilgi"
    ISH_HAQI = "ish_haqi"
    OFIS = "ofis"
    TAMIRLASH = "tamirlash"
    BOSHQA_CHIQIM = "boshqa_chiqim"


class TreasuryTransaction(Base):
    """Main company treasury — all financial operations."""
    __tablename__ = "treasury_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    transaction_type = Column(Enum(TreasuryTransactionType, native_enum=False, values_callable=lambda x: [m.value for m in x]), nullable=False)
    category = Column(Enum(TreasuryCategory, native_enum=False, values_callable=lambda x: [m.value for m in x]), nullable=True)
    amount = Column(Integer, nullable=False)
    payment_method = Column(Enum(PaymentMethod, native_enum=False, values_callable=lambda x: [m.value for m in x]), nullable=False)
    description = Column(Text, nullable=True)
    transaction_date = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    created_by = relationship("User", lazy="noload")


class CourierCashCollection(Base):
    """Cash register — money collected from couriers when they close shifts."""
    __tablename__ = "courier_cash_collections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    courier_id = Column(UUID(as_uuid=True), ForeignKey("couriers.id", ondelete="CASCADE"), nullable=False, index=True)
    collected_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Money amounts by payment method
    cash_amount = Column(Integer, default=0, nullable=False)
    card_amount = Column(Integer, default=0, nullable=False)
    payme_amount = Column(Integer, default=0, nullable=False)
    total_amount = Column(Integer, default=0, nullable=False)

    # Container counts
    full_containers_returned = Column(Integer, default=0, nullable=False)
    empty_containers_returned = Column(Integer, default=0, nullable=False)

    # Delivery stats for this shift
    orders_completed = Column(Integer, default=0, nullable=False)

    # Notes and timing
    note = Column(Text, nullable=True)
    collection_date = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    courier = relationship("Courier", lazy="noload")
    collected_by = relationship("User", lazy="noload")


class AdminExpense(Base):
    """Expenses recorded by operators/admins (not courier field expenses)."""
    __tablename__ = "admin_expenses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    title = Column(String(255), nullable=False)
    amount = Column(Integer, nullable=False)
    payment_method = Column(Enum(PaymentMethod, native_enum=False, values_callable=lambda x: [m.value for m in x]), nullable=False, default=PaymentMethod.NAQD)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    created_by = relationship("User", lazy="noload")


class OperatorCashSubmission(Base):
    """Cash submitted by operator to boss (like courier shift close but for operators)."""
    __tablename__ = "operator_cash_submissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    operator_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    collected_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    cash_amount = Column(Integer, default=0, nullable=False)
    card_amount = Column(Integer, default=0, nullable=False)
    total_amount = Column(Integer, default=0, nullable=False)

    note = Column(Text, nullable=True)
    submission_date = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    operator = relationship("User", foreign_keys=[operator_id], lazy="noload")
    collected_by = relationship("User", foreign_keys=[collected_by_id], lazy="noload")
