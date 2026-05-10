from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class CourierCashCollectionBase(BaseModel):
    cash_amount: int = 0
    card_amount: int = 0
    full_containers_returned: int = Field(default=0, ge=0)
    empty_containers_returned: int = Field(default=0, ge=0)
    orders_completed: int = Field(default=0, ge=0)
    note: str | None = None


class CourierCashCollectionCreate(CourierCashCollectionBase):
    courier_id: UUID


class CourierCashCollectionInDB(CourierCashCollectionBase):
    id: UUID
    tenant_id: UUID
    courier_id: UUID
    collected_by_id: UUID | None
    total_amount: int
    collection_date: datetime

    class Config:
        from_attributes = True


class CourierCashCollectionResponse(CourierCashCollectionInDB):
    courier_name: str | None = None
    collected_by_name: str | None = None
