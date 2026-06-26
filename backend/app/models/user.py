import enum
import uuid
from sqlalchemy import Column, String, Boolean, ForeignKey, Enum, BigInteger, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.base_mixin import TimestampMixin


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    BOSHLIQ = "boshliq"
    OPERATOR = "operator"
    AGENT = "agent"
    COURIER = "courier"
    CLIENT = "client"


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True)

    telegram_id = Column(BigInteger, unique=True, nullable=True, index=True)
    telegram_username = Column(String(100), nullable=True)

    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=True)
    phone = Column(String(20), nullable=True, index=True)  # 998901234567

    role = Column(Enum(UserRole, native_enum=False, values_callable=lambda x: [m.value for m in x]), nullable=False, default=UserRole.CLIENT)
    secondary_role = Column(String(20), nullable=True, default=None)  # optional second role e.g. courier for operator
    hashed_password = Column(String(200), nullable=True)  # only for web panel users

    is_active = Column(Boolean, default=True, nullable=False)
    is_phone_verified = Column(Boolean, default=False, nullable=False)
    bot_blocked = Column(Boolean, default=False, nullable=False)

    language = Column(String(10), default="uz", nullable=False)  # uz / uz_cyrillic / ru
    fcm_token = Column(String(300), nullable=True)  # Firebase push notification token

    # Operator cash balances (cash physically held by operator, pending submission to boss)
    cash_balance = Column(Integer, default=0, nullable=False)
    card_balance = Column(Integer, default=0, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="users", lazy="noload")
    courier = relationship("Courier", back_populates="user", uselist=False, lazy="noload")
    client = relationship("Client", back_populates="user", uselist=False, lazy="noload")

    @property
    def full_name(self) -> str:
        if self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.first_name

    @property
    def initials(self) -> str:
        parts = self.full_name.split()
        return "".join(p[0].upper() for p in parts[:2])
