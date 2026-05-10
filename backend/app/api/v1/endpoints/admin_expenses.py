from uuid import UUID
from typing import Optional
from datetime import date, datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from pydantic import BaseModel, Field

from app.db.base import get_db
from app.core.deps import require_operator
from app.models.user import User
from app.models.finance import AdminExpense
from app.models.courier import CourierExpense, Courier
from app.models.order import PaymentMethod

router = APIRouter()


class AdminExpenseCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    amount: int = Field(..., gt=0)
    payment_method: PaymentMethod = PaymentMethod.NAQD
    note: Optional[str] = None


class AdminExpenseUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    amount: Optional[int] = Field(None, gt=0)
    payment_method: Optional[PaymentMethod] = None
    note: Optional[str] = None


@router.get("/")
async def list_admin_expenses(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    TASHKENT = timezone(timedelta(hours=5))
    dt_from = datetime(date_from.year, date_from.month, date_from.day, tzinfo=TASHKENT) if date_from else None
    dt_to = datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=TASHKENT) if date_to else None

    # Admin expenses
    where = [AdminExpense.tenant_id == user.tenant_id]
    if search:
        where.append(AdminExpense.title.ilike(f"%{search.strip()}%"))
    if dt_from:
        where.append(AdminExpense.created_at >= dt_from)
    if dt_to:
        where.append(AdminExpense.created_at <= dt_to)

    admin_rows = (await db.execute(
        select(AdminExpense).where(*where).order_by(AdminExpense.created_at.desc())
    )).scalars().all()

    admin_items = [
        {
            "id": str(e.id),
            "type": "admin",
            "title": e.title,
            "amount": e.amount,
            "payment_method": e.payment_method.value if e.payment_method else "NAQD",
            "note": e.note,
            "courier_name": None,
            "created_at": e.created_at.isoformat(),
        }
        for e in admin_rows
    ]

    # Courier expenses — join with courier + user to get name
    c_where = [CourierExpense.tenant_id == user.tenant_id]
    if search:
        c_where.append(CourierExpense.title.ilike(f"%{search.strip()}%"))
    if dt_from:
        c_where.append(CourierExpense.created_at >= dt_from)
    if dt_to:
        c_where.append(CourierExpense.created_at <= dt_to)

    courier_rows = (await db.execute(
        select(CourierExpense, User)
        .join(Courier, Courier.id == CourierExpense.courier_id)
        .join(User, User.id == Courier.user_id)
        .where(*c_where)
        .order_by(CourierExpense.created_at.desc())
    )).all()

    courier_items = [
        {
            "id": str(ce.id),
            "type": "courier",
            "title": ce.title,
            "amount": ce.amount,
            "payment_method": ce.payment_method.upper() if ce.payment_method else "NAQD",
            "note": None,
            "courier_name": f"{u.first_name} {u.last_name or ''}".strip(),
            "created_at": ce.created_at.isoformat(),
        }
        for ce, u in courier_rows
    ]

    # Merge and sort by date desc
    all_items = sorted(admin_items + courier_items, key=lambda x: x["created_at"], reverse=True)
    total = len(all_items)
    start = (page - 1) * per_page
    page_items = all_items[start: start + per_page]

    return {
        "items": page_items,
        "total": total,
        "page": page,
        "pages": max(1, (total + per_page - 1) // per_page),
    }


@router.post("/", status_code=201)
async def create_admin_expense(
    data: AdminExpenseCreate,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    expense = AdminExpense(
        tenant_id=user.tenant_id,
        created_by_id=user.id,
        title=data.title,
        amount=data.amount,
        payment_method=data.payment_method,
        note=data.note,
    )
    db.add(expense)
    await db.flush()

    return {
        "id": str(expense.id),
        "title": expense.title,
        "amount": expense.amount,
        "payment_method": expense.payment_method.value,
        "note": expense.note,
        "created_at": expense.created_at.isoformat(),
    }


@router.put("/{expense_id}")
async def update_admin_expense(
    expense_id: UUID,
    data: AdminExpenseUpdate,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AdminExpense).where(
            AdminExpense.id == expense_id,
            AdminExpense.tenant_id == user.tenant_id,
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    if data.title is not None:
        expense.title = data.title
    if data.amount is not None:
        expense.amount = data.amount
    if data.payment_method is not None:
        expense.payment_method = data.payment_method
    if data.note is not None:
        expense.note = data.note

    await db.flush()
    return {"id": str(expense.id), "title": expense.title, "amount": expense.amount}


@router.delete("/{expense_id}", status_code=204)
async def delete_admin_expense(
    expense_id: UUID,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AdminExpense).where(
            AdminExpense.id == expense_id,
            AdminExpense.tenant_id == user.tenant_id,
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    await db.delete(expense)
    await db.flush()
