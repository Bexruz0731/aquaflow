import hashlib
from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.db.base import get_db
from app.db.redis import get_redis
from app.core.config import settings
from app.core.security import (
    verify_password, create_access_token, create_refresh_token,
    decode_token, verify_telegram_init_data,
)
from app.core.limiter import limiter
from app.core.deps import get_current_user, verify_bot_secret
from app.models.user import User, UserRole
from app.models.client import Client, ClientAddress
from app.models.tenant import Tenant
from pydantic import BaseModel
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest, TelegramVerifyRequest, UserMeResponse

router = APIRouter()


def _make_tokens(user: User) -> TokenResponse:
    data = {"sub": str(user.id), "role": user.role.value, "tenant_id": str(user.tenant_id) if user.tenant_id else None}
    return TokenResponse(access_token=create_access_token(data), refresh_token=create_refresh_token(data))


def _parse_tenant_id(raw: str) -> UUID:
    try:
        return UUID(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid tenant_id")


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Web panel login — by phone or username + password."""
    result = await db.execute(
        select(User).where(
            or_(User.phone == data.login, User.telegram_username == data.login),
            User.role.in_([UserRole.BOSHLIQ, UserRole.OPERATOR, UserRole.AGENT, UserRole.SUPER_ADMIN, UserRole.COURIER]),
            User.is_active == True,
        )
    )
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token_data = {"sub": str(user.id), "role": user.role.value, "tenant_id": str(user.tenant_id) if user.tenant_id else None}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Silently refresh access token using refresh token."""
    payload = decode_token(data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    # Check blacklist
    redis = await get_redis()
    token_hash = hashlib.sha256(data.refresh_token.encode()).hexdigest()
    if await redis.exists(f"blacklist:refresh:{token_hash}"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has been revoked")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == UUID(user_id), User.is_active == True))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    token_data = {"sub": str(user.id), "role": user.role.value, "tenant_id": str(user.tenant_id) if user.tenant_id else None}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


class LogoutRequest(BaseModel):
    refresh_token: str


@router.post("/logout", status_code=204)
async def logout(data: LogoutRequest):
    """Invalidate refresh token by adding it to Redis blacklist."""
    payload = decode_token(data.refresh_token)
    if payload and payload.get("type") == "refresh":
        exp = payload.get("exp", 0)
        ttl = max(0, exp - int(datetime.now(timezone.utc).timestamp()))
        if ttl > 0:
            redis = await get_redis()
            token_hash = hashlib.sha256(data.refresh_token.encode()).hexdigest()
            await redis.setex(f"blacklist:refresh:{token_hash}", ttl, "1")


@router.get("/me", response_model=UserMeResponse)
async def get_me(user: User = Depends(get_current_user)):
    """Get current authenticated user."""
    return user


@router.get("/telegram/user/{telegram_id}")
async def get_user_by_telegram_id(
    telegram_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_bot_secret),
):
    """Look up a user by Telegram ID — used by the bot on /start."""
    result = await db.execute(
        select(User).where(User.telegram_id == telegram_id, User.is_active == True)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": str(user.id),
        "role": user.role.value,
        "secondary_role": user.secondary_role,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "tenant_id": str(user.tenant_id) if user.tenant_id else None,
    }


class BotBlockedUpdate(BaseModel):
    bot_blocked: bool


@router.patch("/telegram/user/{telegram_id}/blocked")
async def set_bot_blocked(
    telegram_id: int,
    data: BotBlockedUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_bot_secret),
):
    """Mark a user as having blocked the bot."""
    result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.bot_blocked = data.bot_blocked
    await db.flush()
    return {"ok": True}


@router.post("/telegram/verify", response_model=TokenResponse)
@limiter.limit("10/minute")
async def telegram_verify(
    request: Request,
    data: TelegramVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """Verify Telegram initData and return JWT tokens for Mini Apps."""
    # Get tenant bot token — for now use the global one from settings
    # In multi-tenant: look up tenant by bot_token from initData
    bot_token = settings.TELEGRAM_BOT_TOKEN

    tg_user = verify_telegram_init_data(data.init_data, bot_token)
    if not tg_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Telegram data")

    telegram_id = int(tg_user.get("id", 0))

    result = await db.execute(select(User).where(User.telegram_id == telegram_id, User.is_active == True))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not registered. Please use /start in the bot first.",
        )

    token_data = {"sub": str(user.id), "role": user.role.value, "tenant_id": str(user.tenant_id) if user.tenant_id else None}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


class TelegramIdLoginRequest(BaseModel):
    telegram_id: int


@router.post("/telegram/login-by-id", response_model=TokenResponse)
async def telegram_login_by_id(
    data: TelegramIdLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Dev fallback: login by telegram_id without HMAC (Telegram Desktop has empty initData)."""
    if settings.APP_ENV == "production":
        raise HTTPException(status_code=404)

    result = await db.execute(select(User).where(User.telegram_id == data.telegram_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not registered. Use /start in the bot first.")

    token_data = {"sub": str(user.id), "role": user.role.value, "tenant_id": str(user.tenant_id) if user.tenant_id else None}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


# ─── Mobile app endpoints (no password — phone-only auth for MVP) ─────────────

class MobilePhoneRequest(BaseModel):
    phone: str
    tenant_id: str


class MobileRegisterRequest(BaseModel):
    phone: str
    first_name: str
    last_name: str | None = None
    address: str | None = None
    tenant_id: str


@router.post("/mobile/login", response_model=TokenResponse)
@limiter.limit("20/minute")
async def mobile_login(
    request: Request,
    data: MobilePhoneRequest,
    db: AsyncSession = Depends(get_db),
):
    """Mobile login by phone only — no password for MVP."""
    tid = _parse_tenant_id(data.tenant_id)
    result = await db.execute(
        select(User).where(User.phone == data.phone, User.tenant_id == tid, User.is_active == True)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="not_found")
    return _make_tokens(user)


@router.post("/mobile/register", response_model=TokenResponse, status_code=201)
@limiter.limit("10/minute")
async def mobile_register(
    request: Request,
    data: MobileRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Register a new client via mobile app — no password for MVP."""
    tid = _parse_tenant_id(data.tenant_id)

    tenant_result = await db.execute(select(Tenant).where(Tenant.id == tid))
    if not tenant_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tenant not found")

    existing = await db.execute(
        select(User).where(User.phone == data.phone, User.tenant_id == tid)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Bu telefon raqam allaqachon ro'yxatda bor")

    new_user = User(
        tenant_id=tid, phone=data.phone,
        first_name=data.first_name, last_name=data.last_name,
        role=UserRole.CLIENT, is_active=True,
    )
    db.add(new_user)

    client = Client(
        tenant_id=tid, user_id=new_user.id,
        first_name=data.first_name, last_name=data.last_name, phone=data.phone,
    )
    db.add(client)
    await db.flush()

    if data.address and data.address.strip():
        db.add(ClientAddress(
            client_id=client.id, label='Uy',
            address_text=data.address.strip(), is_primary=True,
        ))
        await db.flush()

    return _make_tokens(new_user)


@router.post("/mobile/fcm-token", status_code=204)
async def save_fcm_token(
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save FCM push token for this device."""
    token = payload.get("token", "").strip()
    if token:
        user.fcm_token = token
        await db.flush()
