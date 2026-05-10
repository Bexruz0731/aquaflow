import uuid
from pydantic import BaseModel, Field
from typing import Optional
from app.models.user import UserRole


class LoginRequest(BaseModel):
    login: str = Field(..., description="Phone number or username")
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class TelegramVerifyRequest(BaseModel):
    init_data: str


class UserMeResponse(BaseModel):
    id: uuid.UUID
    tenant_id: Optional[uuid.UUID]
    first_name: str
    last_name: Optional[str]
    phone: Optional[str]
    role: UserRole
    language: str
    is_active: bool

    model_config = {"from_attributes": True}
