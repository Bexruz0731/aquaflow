from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, Field

from app.db.base import get_db
from app.core.deps import require_operator, require_agent, get_current_courier
from app.core.limiter import limiter
from app.models.user import User
from app.models.client import Client, ClientAddress
from app.models.finance import Debt, DebtTransaction, DebtTransactionType, TreasuryTransaction, TreasuryTransactionType, TreasuryCategory
from app.models.order import PaymentMethod

router = APIRouter()


class PayDebtRequest(BaseModel):
    amount: int = Field(..., gt=0)
    payment_method: PaymentMethod
    note: Optional[str] = None


@router.get("/")
async def list_debtors(
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20),
    user: User = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
):
    """Clients with outstanding debt."""
    from app.models.order import Order, OrderStatus
    addr_subq = (
        select(ClientAddress.address_text)
        .where(ClientAddress.client_id == Client.id, ClientAddress.is_primary == True)
        .limit(1)
        .correlate(Client)
        .scalar_subquery()
    )
    last_order_subq = (
        select(func.max(Order.created_at))
        .where(Order.client_id == Client.id, Order.is_deleted == False, Order.status == OrderStatus.YETKAZILDI)
        .correlate(Client)
        .scalar_subquery()
    )
    query = (
        select(Client, addr_subq.label("primary_address"), last_order_subq.label("last_order_at"))
        .where(Client.tenant_id == user.tenant_id, Client.debt_amount > 0)
    )
    if search:
        from sqlalchemy import or_
        query = query.where(or_(
            Client.phone.ilike(f"%{search}%"),
            Client.first_name.ilike(f"%{search}%"),
            Client.last_name.ilike(f"%{search}%"),
            addr_subq.ilike(f"%{search}%"),
        ))

    total_q = select(func.count()).select_from(
        select(Client).where(Client.tenant_id == user.tenant_id, Client.debt_amount > 0).subquery()
    )
    total = (await db.execute(total_q)).scalar_one()
    result = await db.execute(
        query.order_by(Client.debt_amount.desc()).offset((page - 1) * per_page).limit(per_page)
    )
    rows = result.all()

    return {
        "items": [
            {
                "client_id": str(row.Client.id),
                "name": row.primary_address or row.Client.phone,
                "phone": row.Client.phone,
                "debt_amount": row.Client.debt_amount,
                "advance_amount": row.Client.advance_amount,
                "last_order_at": row.last_order_at.isoformat() if row.last_order_at else None,
            }
            for row in rows
        ],
        "total": total,
        "page": page,
        "pages": max(1, (total + per_page - 1) // per_page),
    }


@router.get("/history")
async def debt_history(
    page: int = Query(1, ge=1),
    per_page: int = Query(20),
    search: Optional[str] = Query(None),
    user: User = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
):
    addr_subq = (
        select(ClientAddress.address_text)
        .where(ClientAddress.client_id == Client.id, ClientAddress.is_primary == True)
        .limit(1)
        .correlate(Client)
        .scalar_subquery()
    )
    base_where = [DebtTransaction.tenant_id == user.tenant_id]
    if search:
        from sqlalchemy import or_
        pat = f"%{search.strip()}%"
        base_where.append(or_(
            Client.first_name.ilike(pat),
            Client.last_name.ilike(pat),
            Client.phone.ilike(pat),
            addr_subq.ilike(pat),
        ))
    query = (
        select(DebtTransaction, Client.phone, addr_subq.label("primary_address"))
        .join(Client, Client.id == DebtTransaction.client_id)
        .where(*base_where)
    )
    total = (await db.execute(
        select(func.count()).select_from(
            select(DebtTransaction)
            .join(Client, Client.id == DebtTransaction.client_id)
            .where(*base_where)
            .subquery()
        )
    )).scalar_one()
    result = await db.execute(
        query.order_by(DebtTransaction.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    )
    rows = result.all()
    def _map_type(t) -> str:
        if t == DebtTransactionType.PAYMENT:
            return "paid"
        if t == DebtTransactionType.DEBT:
            return "created"
        if t == DebtTransactionType.ADVANCE:
            return "advance"
        if t == DebtTransactionType.ADVANCE_USED:
            return "advance_used"
        if t == DebtTransactionType.ADJUSTMENT:
            return "adjustment"
        return "cancelled"

    return {
        "items": [
            {
                "id": str(row.DebtTransaction.id),
                "client_id": str(row.DebtTransaction.client_id),
                "client_name": row.primary_address or row.phone,
                "type": _map_type(row.DebtTransaction.transaction_type),
                "amount": row.DebtTransaction.amount,
                "payment_method": row.DebtTransaction.payment_method.value if row.DebtTransaction.payment_method else None,
                "note": row.DebtTransaction.description,
                "created_at": row.DebtTransaction.created_at,
            }
            for row in rows
        ],
        "total": total,
        "page": page,
        "pages": max(1, (total + per_page - 1) // per_page),
    }


@router.post("/{client_id}/pay", status_code=200)
@limiter.limit("60/minute")
async def pay_debt(
    request: Request,
    client_id: UUID,
    data: PayDebtRequest,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Pay off client debt (partially or fully)."""
    client_result = await db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == user.tenant_id).with_for_update()
    )
    client = client_result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if client.debt_amount <= 0:
        raise HTTPException(status_code=400, detail="Client has no outstanding debt")

    payment_amount = min(data.amount, client.debt_amount)
    overpayment = data.amount - payment_amount

    client.debt_amount -= payment_amount
    if overpayment > 0:
        client.advance_amount += overpayment

    # Reduce Debt.remaining_amount records (oldest first) to keep per-order debt in sync
    remaining_to_apply = payment_amount
    from app.models.order import Order
    debt_records = (await db.execute(
        select(Debt)
        .join(Order, Order.id == Debt.order_id)
        .where(Debt.client_id == client_id, Debt.remaining_amount > 0, Order.is_deleted == False)
        .order_by(Debt.created_at)
        .with_for_update()
    )).scalars().all()
    for dr in debt_records:
        if remaining_to_apply <= 0:
            break
        applied = min(remaining_to_apply, dr.remaining_amount)
        dr.remaining_amount -= applied
        if dr.remaining_amount == 0:
            dr.is_paid = True
            from datetime import datetime, timezone
            dr.paid_at = datetime.now(timezone.utc)
        remaining_to_apply -= applied

    # Track cash in operator's personal balance — lock the User row to prevent lost updates
    from app.models.user import UserRole
    from app.models.order import PaymentMethod as PM
    if user.role == UserRole.OPERATOR:
        locked_user = (await db.execute(
            select(User).where(User.id == user.id).with_for_update()
        )).scalar_one()
        if data.payment_method == PM.NAQD:
            locked_user.cash_balance = (locked_user.cash_balance or 0) + payment_amount
        elif data.payment_method == PM.KARTA:
            locked_user.card_balance = (locked_user.card_balance or 0) + payment_amount

    # Log the transaction
    tx = DebtTransaction(
        tenant_id=user.tenant_id,
        client_id=client_id,
        created_by_id=user.id,
        transaction_type=DebtTransactionType.PAYMENT,
        amount=payment_amount,
        payment_method=data.payment_method,
        description=data.note or f"Qarz to'landi. To'lov: {data.payment_method}",
    )
    db.add(tx)

    if overpayment > 0:
        db.add(DebtTransaction(
            tenant_id=user.tenant_id,
            client_id=client_id,
            created_by_id=user.id,
            transaction_type=DebtTransactionType.ADVANCE,
            amount=overpayment,
            payment_method=data.payment_method,
            description="Avans (oldingi ortiqcha to'lov hisobidan)",
        ))

    # Record in treasury
    db.add(TreasuryTransaction(
        tenant_id=user.tenant_id,
        created_by_id=user.id,
        transaction_type=TreasuryTransactionType.KIRIM,
        category=TreasuryCategory.SUV_SAVDOSI,
        amount=payment_amount,
        payment_method=data.payment_method,
        description=f"Qarz to'lovi: {client.full_name}",
    ))

    await db.flush()
    return {
        "paid": payment_amount,
        "remaining_debt": client.debt_amount,
        "advance": client.advance_amount,
    }


# ==================== COURIER ENDPOINTS ====================

@router.get("/courier/clients")
async def get_clients_with_debts_for_courier(
    search: Optional[str] = Query(None, description="Search by name or phone"),
    user: User = Depends(get_current_courier),
    db: AsyncSession = Depends(get_db),
):
    """Get list of clients with outstanding debt for courier mini-app."""
    addr_subq2 = (
        select(ClientAddress.address_text)
        .where(ClientAddress.client_id == Client.id, ClientAddress.is_primary == True)
        .limit(1)
        .correlate(Client)
        .scalar_subquery()
    )
    query = (
        select(Client, addr_subq2.label("primary_address"))
        .where(Client.tenant_id == user.tenant_id, Client.debt_amount > 0)
    )

    if search:
        from sqlalchemy import or_
        search_pattern = f"%{search.strip()}%"
        query = query.where(or_(
            Client.phone.ilike(search_pattern),
            addr_subq2.ilike(search_pattern),
        ))

    result = await db.execute(query.order_by(addr_subq2).limit(100))
    rows = result.all()

    return {
        "items": [
            {
                "id": str(row.Client.id),
                "name": row.primary_address or row.Client.phone,
                "phone": row.Client.phone,
                "debt_amount": row.Client.debt_amount,
            }
            for row in rows
        ]
    }


@router.post("/courier/{client_id}/pay")
@limiter.limit("60/minute")
async def courier_pay_debt(
    request: Request,
    client_id: UUID,
    data: PayDebtRequest,
    user: User = Depends(get_current_courier),
    db: AsyncSession = Depends(get_db),
):
    """Courier collects debt payment from client."""
    from app.models.courier import Courier

    # Get courier with row lock to prevent concurrent balance updates
    courier_result = await db.execute(
        select(Courier).where(Courier.user_id == user.id, Courier.tenant_id == user.tenant_id).with_for_update()
    )
    courier = courier_result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=403, detail="Not a courier")

    # Get client
    client_result = await db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == user.tenant_id).with_for_update()
    )
    client = client_result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if client.debt_amount <= 0:
        raise HTTPException(status_code=400, detail="Client has no outstanding debt")

    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    # Calculate payment amount (can't pay more than debt)
    payment_amount = min(data.amount, client.debt_amount)
    overpayment = data.amount - payment_amount

    # Update client debt
    client.debt_amount -= payment_amount
    if overpayment > 0:
        client.advance_amount += overpayment

    # Reduce Debt.remaining_amount records (oldest first)
    remaining_to_apply = payment_amount
    from app.models.order import Order
    debt_records = (await db.execute(
        select(Debt)
        .join(Order, Order.id == Debt.order_id)
        .where(Debt.client_id == client_id, Debt.remaining_amount > 0, Order.is_deleted == False)
        .order_by(Debt.created_at)
        .with_for_update()
    )).scalars().all()
    for dr in debt_records:
        if remaining_to_apply <= 0:
            break
        applied = min(remaining_to_apply, dr.remaining_amount)
        dr.remaining_amount -= applied
        if dr.remaining_amount == 0:
            dr.is_paid = True
            from datetime import datetime, timezone
            dr.paid_at = datetime.now(timezone.utc)
        remaining_to_apply -= applied

    # Add money to courier's balance — only the actual payment, not overpayment
    if data.payment_method == PaymentMethod.NAQD:
        courier.cash_balance += payment_amount
    elif data.payment_method == PaymentMethod.KARTA:
        courier.card_balance += payment_amount
    elif data.payment_method == PaymentMethod.PAYME:
        courier.payme_balance += payment_amount

    # Log debt transaction
    tx = DebtTransaction(
        tenant_id=user.tenant_id,
        client_id=client_id,
        created_by_id=user.id,
        transaction_type=DebtTransactionType.PAYMENT,
        amount=payment_amount,
        payment_method=data.payment_method,
        description=data.note or f"Qarz to'landi kuryer orqali. To'lov: {data.payment_method.value}",
    )
    db.add(tx)

    if overpayment > 0:
        db.add(DebtTransaction(
            tenant_id=user.tenant_id,
            client_id=client_id,
            created_by_id=user.id,
            transaction_type=DebtTransactionType.ADVANCE,
            amount=overpayment,
            payment_method=data.payment_method,
            description="Avans (ortiqcha to'lov)",
        ))

    await db.flush()

    return {
        "success": True,
        "paid": payment_amount,
        "overpayment": overpayment,
        "remaining_debt": client.debt_amount,
        "advance": client.advance_amount,
        "courier_cash_balance": courier.cash_balance,
        "courier_card_balance": courier.card_balance,
        "courier_payme_balance": courier.payme_balance,
    }
