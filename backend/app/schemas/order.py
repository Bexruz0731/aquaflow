from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid

from app.models.order import OrderStatus, PaymentStatus, PaymentMethod


class OrderItemCreate(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(..., gt=0)


class OrderCreate(BaseModel):
    client_id: Optional[uuid.UUID] = None  # auto-resolved from token for client role
    address_id: Optional[uuid.UUID] = None
    delivery_address: Optional[str] = None
    items: List[OrderItemCreate]
    comment: Optional[str] = None
    contact_phone: Optional[str] = None  # Phone number for courier to contact
    courier_id: Optional[uuid.UUID] = None
    is_phone_order: bool = False
    # Walkin sale fields
    is_walkin: bool = False
    walkin_phone: Optional[str] = None
    walkin_address: Optional[str] = None
    walkin_store: Optional[str] = None
    walkin_company_name: Optional[str] = None  # company/store name for new walkin client
    walkin_cash_amount: Optional[int] = Field(default=None, ge=0)
    walkin_card_amount: Optional[int] = Field(default=None, ge=0)
    walkin_payme_amount: Optional[int] = Field(default=None, ge=0)
    walkin_debt_amount: Optional[int] = Field(default=None, ge=0)  # debt portion for walkin with client
    walkin_first_name: Optional[str] = None   # new client first name (Yangi mijoz)
    walkin_last_name: Optional[str] = None    # new client last name (optional)
    discount_amount: int = Field(default=0, ge=0)  # discount subtracted from payable total
    walkin_containers_returned: Optional[int] = Field(default=0, ge=0)
    # Allow creating order with YETKAZILDI status (backdated)
    status: Optional[str] = None


class OrderItemResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_name: Optional[str] = None
    quantity: int
    delivered_quantity: int
    price_at_order: int
    total: int
    volume_liters: Optional[float] = None
    is_returnable: bool = False

    model_config = {"from_attributes": True}


class OrderResponse(BaseModel):
    id: int
    tenant_id: uuid.UUID
    client_id: Optional[uuid.UUID] = None
    courier_id: Optional[uuid.UUID]
    address_id: Optional[uuid.UUID]
    status: OrderStatus
    payment_status: PaymentStatus
    payment_method: Optional[PaymentMethod]
    total_amount: int
    discount_amount: int = 0
    paid_amount: int
    cash_amount: int = 0
    card_amount: int = 0
    payme_amount: int = 0
    advance_used: int = 0
    debt_amount: int
    containers_delivered: int
    containers_returned: int
    comment: Optional[str]
    cancel_reason: Optional[str]
    problem_reason: Optional[str]
    contact_phone: Optional[str]
    is_phone_order: bool
    is_walkin: bool = False
    walkin_phone: Optional[str] = None
    walkin_address: Optional[str] = None
    walkin_store: Optional[str] = None
    delivered_at: Optional[datetime]
    created_at: datetime
    items: List[OrderItemResponse] = []
    # Joined / computed fields (populated by endpoints that need them)
    address_text: Optional[str] = None
    courier_name: Optional[str] = None
    courier_phone: Optional[str] = None
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    order_number: Optional[int] = None
    client_debt: Optional[int] = 0
    client_container_balance: Optional[int] = 0
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AssignCourierRequest(BaseModel):
    courier_id: uuid.UUID


class DeliveredQuantity(BaseModel):
    """Delivered quantity for a specific product in the order."""
    product_id: uuid.UUID
    delivered_quantity: int = Field(..., ge=0)


class CompleteOrderRequest(BaseModel):
    """Courier completes delivery — sets payment and container info."""
    containers_returned: int = Field(default=0, ge=0)
    payment_type: str = "paid"    # "paid" | "unpaid" | "partial"
    payment_method: Optional[str] = None  # "NAQD" | "KARTA" (from courier app)
    paid_amount: int = Field(default=0, ge=0)   # amount actually received — legacy
    # Split payment fields (new)
    cash_amount: int = Field(default=0, ge=0)    # amount paid in cash
    card_amount: int = Field(default=0, ge=0)    # amount paid by card
    payme_amount: int = Field(default=0, ge=0)   # amount paid via Payme/Click
    discount_amount: int = Field(default=0, ge=0)  # discount subtracted from payable total
    note: Optional[str] = None
    # Delivered quantities per product (optional, for partial delivery)
    delivered_quantities: Optional[List[DeliveredQuantity]] = None


class ProblemRequest(BaseModel):
    reason: str


class CancelRequest(BaseModel):
    reason: str


class StatusChangeResponse(BaseModel):
    order_id: int
    status: OrderStatus
    message: str
