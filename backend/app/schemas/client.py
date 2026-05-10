from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid


class ClientAddressCreate(BaseModel):
    label: str
    address_text: str
    landmark: Optional[str] = None
    apartment: Optional[str] = None
    floor: Optional[str] = None
    entrance: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    region_id: Optional[uuid.UUID] = None
    city: Optional[str] = None
    is_primary: bool = False


class ClientAddressResponse(BaseModel):
    id: uuid.UUID
    label: str
    address_text: str
    landmark: Optional[str]
    apartment: Optional[str]
    floor: Optional[str]
    entrance: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    is_primary: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ClientCreate(BaseModel):
    first_name: str
    last_name: Optional[str] = None
    phone: str = Field(..., pattern=r"^\+?998\d{9}$")
    has_contract: bool = False
    notes: Optional[str] = None
    company_name: Optional[str] = None
    container_balance: int = 0
    group_id: Optional[uuid.UUID] = None
    initial_debt: int = Field(default=0, ge=0)  # initial debt balance (not stored on Client, set separately)


class ClientUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    has_contract: Optional[bool] = None
    is_active: Optional[bool] = None
    is_blocked: Optional[bool] = None
    notes: Optional[str] = None
    company_name: Optional[str] = None
    container_balance: Optional[int] = None
    group_id: Optional[uuid.UUID] = None


class ClientSelfUpdate(BaseModel):
    """Fields the client can update themselves via Mini App."""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    language: Optional[str] = None


class ClientResponse(BaseModel):
    id: uuid.UUID
    first_name: str
    last_name: Optional[str]
    phone: str
    language: str = "uz"
    is_active: bool
    is_verified: bool
    is_blocked: bool
    has_contract: bool
    container_balance: int
    debt_amount: int
    advance_amount: int
    notes: Optional[str]
    created_at: datetime
    addresses: List[ClientAddressResponse] = []
    telegram_id: Optional[int] = None
    telegram_username: Optional[str] = None
    orders_count: int = 0
    total_spent: int = 0
    last_order_at: Optional[datetime] = None
    group_id: Optional[uuid.UUID] = None
    user_role: Optional[str] = None
    user_secondary_role: Optional[str] = None
    linked_user_id: Optional[uuid.UUID] = None
    container_product_id: Optional[uuid.UUID] = None
    container_product_name: Optional[str] = None
    company_name: Optional[str] = None
    display_name: Optional[str] = None  # primary address or phone — use this everywhere instead of first_name

    model_config = {"from_attributes": True}


class ClientRegisterRequest(BaseModel):
    """Used by the Telegram bot to register a new client."""
    telegram_id: int
    telegram_username: Optional[str] = None
    first_name: str
    last_name: Optional[str] = None
    phone: str
    language: str = "uz"
    tenant_id: uuid.UUID
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address_text: Optional[str] = None  # manual address typed by user
