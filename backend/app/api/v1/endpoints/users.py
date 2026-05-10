from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.db.base import get_db
from app.core.deps import require_boshliq
from app.core.security import hash_password
from app.models.user import User, UserRole

router = APIRouter()


class UserCreate(BaseModel):
    first_name: str
    last_name: Optional[str] = None
    phone: str
    telegram_id: Optional[int] = None
    telegram_username: Optional[str] = None
    role: UserRole
    password: str
    is_active: bool = True


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[UserRole] = None
    secondary_role: Optional[str] = None  # "courier" for operator who also works as courier; "" to clear
    is_active: Optional[bool] = None
    password: Optional[str] = None


@router.get("/")
async def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(20),
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    query = select(User).where(
        User.tenant_id == user.tenant_id,
        User.role.in_([UserRole.BOSHLIQ, UserRole.OPERATOR, UserRole.AGENT, UserRole.COURIER]),
    )
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    result = await db.execute(query.offset((page - 1) * per_page).limit(per_page))
    items = result.scalars().all()
    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get("/{user_id}")
async def get_user(
    user_id: UUID,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == user.tenant_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    return target


@router.post("/", status_code=201)
async def create_user(
    data: UserCreate,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    new_user = User(
        tenant_id=user.tenant_id,
        first_name=data.first_name,
        last_name=data.last_name,
        phone=data.phone,
        telegram_id=data.telegram_id,
        telegram_username=data.telegram_username,
        role=data.role,
        hashed_password=hash_password(data.password),
        is_active=data.is_active,
    )
    db.add(new_user)

    # If courier, also create Courier record
    if data.role == UserRole.COURIER:
        from app.models.courier import Courier
        await db.flush()
        courier = Courier(tenant_id=user.tenant_id, user_id=new_user.id)
        db.add(courier)

    await db.flush()
    await db.refresh(new_user)
    return new_user


@router.patch("/{user_id}")
async def update_user(
    user_id: UUID,
    data: UserUpdate,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == user.tenant_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # If role is changing — check pending balances first
    if data.role is not None and data.role != target.role:
        old_role = target.role

        if old_role == UserRole.COURIER:
            from app.models.courier import Courier, CourierInventory
            c_res = await db.execute(select(Courier).where(Courier.user_id == target.id))
            courier = c_res.scalar_one_or_none()
            if courier:
                problems = []
                if courier.cash_balance > 0:
                    problems.append(f"naqd: {courier.cash_balance:,} so'm")
                if courier.card_balance > 0:
                    problems.append(f"plastik: {courier.card_balance:,} so'm")
                if courier.payme_balance > 0:
                    problems.append(f"payme: {courier.payme_balance:,} so'm")
                if courier.full_containers > 0:
                    problems.append(f"to'la idish: {courier.full_containers} ta")
                if courier.empty_containers > 0:
                    problems.append(f"bo'sh idish: {courier.empty_containers} ta")
                inv_res = await db.execute(
                    select(CourierInventory).where(
                        CourierInventory.courier_id == courier.id,
                        CourierInventory.quantity > 0,
                    )
                )
                inv_items = inv_res.scalars().all()
                if inv_items:
                    total_items = sum(i.quantity for i in inv_items)
                    problems.append(f"mahsulot: {total_items} ta")
                if problems:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Avval kuryer smenasini yoping. Balansda: {', '.join(problems)}.",
                    )
                # Deactivate courier record when role changes away from COURIER
                courier.is_active = False

        elif old_role in (UserRole.OPERATOR, UserRole.AGENT):
            problems = []
            if (target.cash_balance or 0) > 0:
                problems.append(f"naqd: {target.cash_balance:,} so'm")
            if (target.card_balance or 0) > 0:
                problems.append(f"plastik: {target.card_balance:,} so'm")
            if problems:
                raise HTTPException(
                    status_code=409,
                    detail=f"Avval kassani topshiring. Balansda: {', '.join(problems)}.",
                )

    # Handle secondary_role changes
    if "secondary_role" in data.model_dump(exclude_unset=True):
        new_secondary = data.secondary_role  # None or "" clears it; "courier" sets it
        if new_secondary == "courier":
            from app.models.courier import Courier
            c_res = await db.execute(select(Courier).where(Courier.user_id == target.id))
            existing = c_res.scalar_one_or_none()
            if not existing:
                await db.flush()
                courier = Courier(tenant_id=user.tenant_id, user_id=target.id)
                db.add(courier)
        target.secondary_role = new_secondary if new_secondary else None

    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "secondary_role":
            continue  # handled above
        if field == "password" and value:
            setattr(target, "hashed_password", hash_password(value))
        else:
            setattr(target, field, value)

    await db.flush()
    await db.refresh(target)
    return target


@router.delete("/{user_id}", status_code=204)
async def demote_user(
    user_id: UUID,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    """Remove staff role — demotes to client. Blocks if courier has open shift/balance or operator has pending cash."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == user.tenant_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Xodim topilmadi")

    if target.role == UserRole.COURIER:
        from app.models.courier import Courier, CourierInventory
        c_res = await db.execute(select(Courier).where(Courier.user_id == target.id))
        courier = c_res.scalar_one_or_none()
        if courier:
            problems = []
            if courier.cash_balance > 0:
                problems.append(f"naqd: {courier.cash_balance:,} so'm")
            if courier.card_balance > 0:
                problems.append(f"plastik: {courier.card_balance:,} so'm")
            if courier.payme_balance > 0:
                problems.append(f"payme: {courier.payme_balance:,} so'm")
            if courier.full_containers > 0:
                problems.append(f"to'la idish: {courier.full_containers} ta")
            if courier.empty_containers > 0:
                problems.append(f"bo'sh idish: {courier.empty_containers} ta")
            inv_res = await db.execute(
                select(CourierInventory).where(
                    CourierInventory.courier_id == courier.id,
                    CourierInventory.quantity > 0,
                )
            )
            if inv_res.scalars().all():
                problems.append("mahsulotlar mavjud")
            if problems:
                raise HTTPException(
                    status_code=409,
                    detail=f"Avval kuryer smenasini yoping. Balansda: {', '.join(problems)}.",
                )

    elif target.role in (UserRole.OPERATOR, UserRole.AGENT):
        problems = []
        if (target.cash_balance or 0) > 0:
            problems.append(f"naqd: {target.cash_balance:,} so'm")
        if (target.card_balance or 0) > 0:
            problems.append(f"plastik: {target.card_balance:,} so'm")
        if problems:
            raise HTTPException(
                status_code=409,
                detail=f"Avval kassani topshiring. Balansda: {', '.join(problems)}.",
            )

    target.role = UserRole.CLIENT
    target.secondary_role = None

    # Deactivate courier record so it no longer appears in couriers list
    from app.models.courier import Courier as _Courier
    _cr = await db.execute(select(_Courier).where(_Courier.user_id == target.id, _Courier.is_active == True))
    _courier_rec = _cr.scalar_one_or_none()
    if _courier_rec:
        _courier_rec.is_active = False

    await db.flush()
