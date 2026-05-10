from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from pydantic import BaseModel
from typing import Optional

from app.db.base import get_db
from app.core.deps import get_current_user, require_boshliq
from app.models.user import User
from app.models.region import Region

router = APIRouter()


class RegionToggle(BaseModel):
    is_active: bool


@router.get("/")
async def list_regions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Return system regions + tenant-specific ones."""
    result = await db.execute(
        select(Region)
        .where(or_(Region.tenant_id == None, Region.tenant_id == user.tenant_id))
        .order_by(Region.sort_order)
    )
    return result.scalars().all()


@router.patch("/{region_id}")
async def toggle_region(
    region_id: UUID,
    data: RegionToggle,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Region).where(Region.id == region_id))
    region = result.scalar_one_or_none()
    if not region:
        raise HTTPException(status_code=404, detail="Region not found")

    region.is_active = data.is_active
    await db.flush()
    return {"id": str(region_id), "is_active": data.is_active}
