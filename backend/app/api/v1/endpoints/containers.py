from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.db.base import get_db
from app.core.deps import require_operator, require_boshliq
from app.models.user import User
from app.models.client import Client
from app.models.finance import ContainerClientBalance, ContainerTransaction
from app.models.warehouse import WarehouseItem, WarehouseStock, WarehouseTransaction, WarehouseTransactionType
from app.models.product import Product
from app.models.order import Order, OrderItem

router = APIRouter()


class AdjustContainerRequest(BaseModel):
    delta: int
    note: Optional[str] = None
    product_id: Optional[UUID] = None


@router.get("/{client_id}/history")
async def container_history(
    client_id: UUID,
    page: int = Query(1, ge=1),
    per_page: int = Query(20),
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    query = select(ContainerTransaction).where(
        ContainerTransaction.client_id == client_id,
        ContainerTransaction.tenant_id == user.tenant_id,
    )
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    result = await db.execute(
        query.order_by(ContainerTransaction.created_at.desc())
        .offset((page - 1) * per_page).limit(per_page)
    )
    return {"items": result.scalars().all(), "total": total, "page": page}


@router.post("/{client_id}/adjust")
async def adjust_containers(
    client_id: UUID,
    data: AdjustContainerRequest,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    """Manual container balance adjustment — only boshliq/super_admin."""
    if data.delta == 0:
        raise HTTPException(status_code=400, detail="Delta cannot be zero")

    note_text = (data.note or "").strip()

    # ── 1. Update client container balance ───────────────────────────────────
    cb_result = await db.execute(
        select(ContainerClientBalance)
        .where(ContainerClientBalance.client_id == client_id,
               ContainerClientBalance.tenant_id == user.tenant_id)
        .with_for_update()
    )
    cb = cb_result.scalar_one_or_none()
    if not cb:
        client_r = await db.execute(select(Client).where(Client.id == client_id))
        client_seed = client_r.scalar_one_or_none()
        seed_bal = client_seed.container_balance if client_seed else 0
        cb = ContainerClientBalance(tenant_id=user.tenant_id, client_id=client_id, balance=seed_bal)
        db.add(cb)
        await db.flush()

    old_balance = cb.balance
    new_balance = cb.balance + data.delta
    if new_balance < 0:
        raise HTTPException(
            status_code=400,
            detail=f"Balans manfiy bo'lishi mumkin emas (hozir {old_balance} ta)"
        )

    cb.balance = new_balance

    client_result = await db.execute(select(Client).where(Client.id == client_id))
    client = client_result.scalar_one_or_none()
    if client:
        client.container_balance = new_balance

    db.add(ContainerTransaction(
        tenant_id=user.tenant_id,
        client_id=client_id,
        created_by_id=user.id,
        transaction_type="adjustment",
        quantity=data.delta,
        balance_before=old_balance,
        balance_after=new_balance,
        note=note_text or None,
    ))

    # ── 2. Determine which returnable product to update ───────────────────────
    returnable_product = None
    if data.product_id:
        pr = await db.execute(
            select(Product).where(
                Product.id == data.product_id,
                Product.tenant_id == user.tenant_id,
                Product.is_returnable_container == True,
            )
        )
        returnable_product = pr.scalar_one_or_none()

    if not returnable_product:
        # use the product from the client's most recent order
        cp_r = await db.execute(
            select(Product)
            .join(OrderItem, OrderItem.product_id == Product.id)
            .join(Order, Order.id == OrderItem.order_id)
            .where(
                Order.client_id == client_id,
                Order.tenant_id == user.tenant_id,
                Product.is_returnable_container == True,
            )
            .order_by(Order.created_at.desc())
            .limit(1)
        )
        returnable_product = cp_r.scalar_one_or_none()

    if not returnable_product:
        # fall back to first active returnable product
        fb_r = await db.execute(
            select(Product).where(
                Product.tenant_id == user.tenant_id,
                Product.is_returnable_container == True,
                Product.is_active == True,
            ).limit(1)
        )
        returnable_product = fb_r.scalar_one_or_none()

    # ── 3. Update warehouse stock ─────────────────────────────────────────────
    if returnable_product:
        wi_r = await db.execute(
            select(WarehouseItem).where(
                WarehouseItem.product_id == returnable_product.id,
                WarehouseItem.tenant_id == user.tenant_id,
            )
        )
        wi = wi_r.scalar_one_or_none()
        if wi:
            stock_r = await db.execute(
                select(WarehouseStock)
                .where(WarehouseStock.item_id == wi.id)
                .with_for_update()
            )
            stock = stock_r.scalar_one_or_none()
            if stock:
                qty = abs(data.delta)
                if data.delta > 0:
                    # adding to client — take from empty stock
                    if stock.empty_quantity < qty:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Omborda yetarli bo'sh idish yo'q. Mavjud: {stock.empty_quantity}, kerak: {qty}"
                        )
                    before = stock.empty_quantity
                    stock.empty_quantity -= qty
                    db.add(WarehouseTransaction(
                        tenant_id=user.tenant_id,
                        item_id=wi.id,
                        transaction_type=WarehouseTransactionType.CHIQIM,
                        quantity=qty,
                        balance_before=before,
                        balance_after=stock.empty_quantity,
                        note=f"Mijoz tara balansi qo'lda oshirildi (bo'sh idish){': ' + note_text if note_text else ''}",
                        created_by_id=user.id,
                    ))
                else:
                    # removing from client — return to empty stock
                    before = stock.empty_quantity
                    stock.empty_quantity += qty
                    db.add(WarehouseTransaction(
                        tenant_id=user.tenant_id,
                        item_id=wi.id,
                        transaction_type=WarehouseTransactionType.KIRIM,
                        quantity=qty,
                        balance_before=before,
                        balance_after=stock.empty_quantity,
                        note=f"Mijoz tara balansi qo'lda kamaytirildi (bo'sh idish qaytdi){': ' + note_text if note_text else ''}",
                        created_by_id=user.id,
                    ))

    await db.flush()
    return {
        "balance_before": old_balance,
        "balance_after": new_balance,
        "delta": data.delta,
        "product_name": returnable_product.name if returnable_product else None,
    }
