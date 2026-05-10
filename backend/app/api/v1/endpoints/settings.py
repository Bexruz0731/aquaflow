from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.db.base import get_db
from app.core.deps import get_current_user, require_boshliq
from app.models.user import User
from app.models.notifications import Settings

router = APIRouter()


class SettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    logo_url: Optional[str] = None
    bot_token: Optional[str] = None
    work_start_hour: Optional[int] = None
    work_end_hour: Optional[int] = None
    inactive_client_days: Optional[int] = None
    extra_json: Optional[str] = None


@router.get("/")
async def get_settings(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Settings).where(Settings.tenant_id == user.tenant_id))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = Settings(tenant_id=user.tenant_id)
        db.add(settings)
        await db.flush()
        await db.refresh(settings)
    return settings


@router.patch("/")
async def update_settings(
    data: SettingsUpdate,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Settings).where(Settings.tenant_id == user.tenant_id))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = Settings(tenant_id=user.tenant_id)
        db.add(settings)

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)

    await db.flush()
    await db.refresh(settings)
    return settings
