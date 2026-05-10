from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from datetime import date, datetime

from app.db.base import get_db
from app.core.deps import require_operator, require_agent, require_boshliq
from app.models.user import User, UserRole
from app.models.finance import OperatorCashSubmission

router = APIRouter()


@router.get("/balance")
async def get_operator_balance(
    user: User = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
):
    """Return current operator's cash/card balance."""
    if user.role not in (UserRole.OPERATOR, UserRole.AGENT):
        raise HTTPException(status_code=403, detail="Only operators/agents can access this")
    return {
        "cash_balance": user.cash_balance,
        "card_balance": user.card_balance,
        "total": user.cash_balance + user.card_balance,
    }


class SubmitCashRequest(BaseModel):
    note: Optional[str] = None


@router.post("/submit-cash")
async def submit_cash(
    data: SubmitCashRequest,
    user: User = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
):
    """Operator submits collected cash to boss. Resets operator's balance."""
    if user.role not in (UserRole.OPERATOR, UserRole.AGENT):
        raise HTTPException(status_code=403, detail="Only operators/agents can access this")

    # Lock the user row to prevent race condition with concurrent payments
    locked_user = (await db.execute(
        select(User).where(User.id == user.id).with_for_update()
    )).scalar_one()

    if locked_user.cash_balance == 0 and locked_user.card_balance == 0:
        raise HTTPException(status_code=400, detail="Topshiriladigan naqd pul yo'q")

    submission = OperatorCashSubmission(
        tenant_id=locked_user.tenant_id,
        operator_id=locked_user.id,
        cash_amount=locked_user.cash_balance,
        card_amount=locked_user.card_balance,
        total_amount=locked_user.cash_balance + locked_user.card_balance,
        note=data.note,
    )
    db.add(submission)

    locked_user.cash_balance = 0
    locked_user.card_balance = 0

    await db.flush()
    return {
        "ok": True,
        "submitted_cash": submission.cash_amount,
        "submitted_card": submission.card_amount,
        "total": submission.total_amount,
    }


@router.get("/submissions")
async def list_submissions(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    operator_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    """Boss sees all operator cash submissions."""
    from sqlalchemy import func

    query = select(OperatorCashSubmission).where(OperatorCashSubmission.tenant_id == user.tenant_id)
    if start_date:
        query = query.where(OperatorCashSubmission.submission_date >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        query = query.where(OperatorCashSubmission.submission_date <= datetime.combine(end_date, datetime.max.time()))
    if operator_id:
        query = query.where(OperatorCashSubmission.operator_id == operator_id)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    result = await db.execute(query.order_by(desc(OperatorCashSubmission.submission_date)).offset((page - 1) * per_page).limit(per_page))
    submissions = result.scalars().all()

    # Load operator names
    op_ids = list({str(s.operator_id) for s in submissions})
    ops = {}
    if op_ids:
        op_result = await db.execute(select(User).where(User.id.in_(op_ids)))
        ops = {str(u.id): u for u in op_result.scalars().all()}

    return {
        "items": [
            {
                "id": str(s.id),
                "operator_id": str(s.operator_id),
                "operator_name": ops[str(s.operator_id)].full_name if str(s.operator_id) in ops else "—",
                "cash_amount": s.cash_amount,
                "card_amount": s.card_amount,
                "total_amount": s.total_amount,
                "note": s.note,
                "submission_date": s.submission_date,
            }
            for s in submissions
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }
