from typing import Optional
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.db.base import get_db
from app.core.deps import require_boshliq
from app.models.user import User
from app.models.finance import TreasuryTransaction, TreasuryTransactionType, TreasuryCategory
from app.models.order import PaymentMethod

router = APIRouter()


class TreasuryCreate(BaseModel):
    transaction_type: TreasuryTransactionType
    category: Optional[TreasuryCategory] = None
    amount: int
    payment_method: PaymentMethod
    description: Optional[str] = None
    transaction_date: Optional[datetime] = None


@router.get("/")
async def list_transactions(
    transaction_type: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20),
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    query = select(TreasuryTransaction).where(TreasuryTransaction.tenant_id == user.tenant_id)

    if transaction_type:
        query = query.where(TreasuryTransaction.transaction_type == transaction_type)
    if date_from:
        query = query.where(TreasuryTransaction.transaction_date >= datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc))
    if date_to:
        query = query.where(TreasuryTransaction.transaction_date <= datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=timezone.utc))

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()

    # Summary cards
    income_result = await db.execute(
        select(func.sum(TreasuryTransaction.amount))
        .where(TreasuryTransaction.tenant_id == user.tenant_id, TreasuryTransaction.transaction_type == TreasuryTransactionType.KIRIM)
    )
    total_income = income_result.scalar_one() or 0

    expense_result = await db.execute(
        select(func.sum(TreasuryTransaction.amount))
        .where(TreasuryTransaction.tenant_id == user.tenant_id, TreasuryTransaction.transaction_type == TreasuryTransactionType.CHIQIM)
    )
    total_expense = expense_result.scalar_one() or 0

    result = await db.execute(
        query.order_by(TreasuryTransaction.transaction_date.desc())
        .offset((page - 1) * per_page).limit(per_page)
    )
    items = result.scalars().all()

    return {
        "items": items,
        "total": total,
        "page": page,
        "summary": {
            "total_income": total_income,
            "total_expense": total_expense,
            "balance": total_income - total_expense,
        },
    }


@router.post("/", status_code=201)
async def create_transaction(
    data: TreasuryCreate,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    tx = TreasuryTransaction(
        tenant_id=user.tenant_id,
        created_by_id=user.id,
        transaction_date=data.transaction_date or datetime.now(timezone.utc),
        **data.model_dump(exclude={"transaction_date"}),
    )
    db.add(tx)
    await db.flush()
    await db.refresh(tx)
    return tx
