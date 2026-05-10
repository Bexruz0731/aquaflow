from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.base import get_db
from app.core.config import settings
from app.core.security import decode_token
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception

    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise credentials_exception

    user_id: str = payload.get("sub")
    if not user_id:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise credentials_exception

    return user


async def get_current_active_user(user: User = Depends(get_current_user)) -> User:
    return user


def require_role(*roles: UserRole):
    """Factory: creates a dependency that enforces at least one of the given roles.
    Checks both primary role and secondary_role."""
    async def _check(user: User = Depends(get_current_user)) -> User:
        role_values = [r.value for r in roles]
        has_primary = user.role in roles
        has_secondary = user.secondary_role in role_values if user.secondary_role else False
        if not has_primary and not has_secondary:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {role_values}",
            )
        return user
    return _check


# Convenience shortcuts
require_boshliq = require_role(UserRole.BOSHLIQ, UserRole.SUPER_ADMIN)
require_operator = require_role(UserRole.OPERATOR, UserRole.BOSHLIQ, UserRole.SUPER_ADMIN)
require_agent = require_role(UserRole.AGENT, UserRole.OPERATOR, UserRole.BOSHLIQ, UserRole.SUPER_ADMIN)
require_courier = require_role(UserRole.COURIER)
require_client = require_role(UserRole.CLIENT)
# All staff roles — excludes CLIENT (used for status-change endpoints)
require_staff = require_role(
    UserRole.COURIER, UserRole.AGENT, UserRole.OPERATOR,
    UserRole.BOSHLIQ, UserRole.SUPER_ADMIN,
)

# Alias for courier endpoints
get_current_courier = require_courier


async def verify_bot_secret(x_bot_secret: Optional[str] = Header(None)) -> None:
    """Dependency for bot-only endpoints: validates X-Bot-Secret header."""
    # Prefer dedicated BOT_SECRET; fall back to TELEGRAM_BOT_TOKEN for backward compat
    expected = settings.BOT_SECRET or settings.TELEGRAM_BOT_TOKEN
    if not x_bot_secret or x_bot_secret != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid bot secret")
