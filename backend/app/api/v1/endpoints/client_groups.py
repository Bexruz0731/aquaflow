from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.db.base import get_db
from app.core.deps import get_current_user, require_boshliq
from app.models.user import User
from app.models.client import ClientGroup, Client

router = APIRouter()


class GroupCreate(BaseModel):
    name: str
    sort_order: int = 0


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None
    inactive_threshold_days: Optional[int] = None


@router.get("/")
async def list_groups(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ClientGroup)
        .where(ClientGroup.tenant_id == user.tenant_id)
        .order_by(ClientGroup.sort_order, ClientGroup.name)
    )
    groups = result.scalars().all()

    # Count clients per group
    counts_result = await db.execute(
        select(Client.group_id, func.count(Client.id))
        .where(Client.tenant_id == user.tenant_id, Client.is_deleted == False)
        .group_by(Client.group_id)
    )
    counts = {row[0]: row[1] for row in counts_result.all()}

    # Count ungrouped clients
    ungrouped_count = counts.get(None, 0)

    return {
        "groups": [
            {
                "id": str(g.id),
                "name": g.name,
                "sort_order": g.sort_order,
                "inactive_threshold_days": g.inactive_threshold_days,
                "client_count": counts.get(g.id, 0),
            }
            for g in groups
        ],
        "ungrouped_count": ungrouped_count,
    }


@router.post("/", status_code=201)
async def create_group(
    data: GroupCreate,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    group = ClientGroup(tenant_id=user.tenant_id, **data.model_dump())
    db.add(group)
    await db.flush()
    await db.refresh(group)
    await db.flush()
    return {"id": str(group.id), "name": group.name, "sort_order": group.sort_order, "client_count": 0}


@router.patch("/{group_id}/")
async def update_group(
    group_id: UUID,
    data: GroupUpdate,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ClientGroup).where(ClientGroup.id == group_id, ClientGroup.tenant_id == user.tenant_id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(group, field, value)
    await db.flush()
    await db.refresh(group)
    await db.flush()
    return {
        "id": str(group.id),
        "name": group.name,
        "sort_order": group.sort_order,
        "inactive_threshold_days": group.inactive_threshold_days,
    }


@router.delete("/{group_id}/", status_code=204)
async def delete_group(
    group_id: UUID,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ClientGroup).where(ClientGroup.id == group_id, ClientGroup.tenant_id == user.tenant_id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    # Block deletion if group has clients
    count_result = await db.execute(
        select(func.count(Client.id)).where(
            Client.group_id == group_id,
            Client.tenant_id == user.tenant_id,
            Client.is_deleted == False,
        )
    )
    client_count = count_result.scalar_one()
    if client_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Guruhda {client_count} ta mijoz bor. Avval ularni boshqa guruhga yoki guruхsizga o'tkazing.",
        )

    await db.delete(group)
    await db.flush()
