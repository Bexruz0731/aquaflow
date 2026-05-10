import uuid
from sqlalchemy import Column, String, Boolean, ForeignKey, Text, DateTime, func, BigInteger, Integer
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class NotificationLog(Base):
    __tablename__ = "notifications_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)

    telegram_id = Column(BigInteger, nullable=True)
    message = Column(Text, nullable=False)
    notification_type = Column(String(50), nullable=False)  # order_new / order_status / debt_paid
    is_sent = Column(Boolean, default=False, nullable=False)
    error = Column(Text, nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    action = Column(String(100), nullable=False)
    entity_type = Column(String(50), nullable=True)
    entity_id = Column(String(100), nullable=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Settings(Base):
    __tablename__ = "settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True)

    company_name = Column(String(200), nullable=True)
    logo_url = Column(String(500), nullable=True)
    bot_token = Column(String(200), nullable=True)

    work_start_hour = Column(Integer, default=8, nullable=False)
    work_end_hour = Column(Integer, default=22, nullable=False)
    inactive_client_days = Column(Integer, default=30, nullable=False)

    extra_json = Column(Text, nullable=True)
