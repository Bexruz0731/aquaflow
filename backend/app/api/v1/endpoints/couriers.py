from uuid import UUID
from typing import Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, text
from sqlalchemy import Date as SQLDate
from pydantic import BaseModel, Field

from app.db.base import get_db
from app.core.deps import get_current_user, require_operator, require_agent, require_boshliq, get_current_courier
from app.models.user import User, UserRole
from app.models.courier import Courier, ShiftStatus, CourierInventory
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product
from app.models.warehouse import WarehouseStock, WarehouseItem
from app.models.client import Client, ClientAddress

router = APIRouter()


class ShiftOpen(BaseModel):
    full_containers: int = Field(default=0, ge=0)


class ShiftClose(BaseModel):
    actual_cash: int = Field(default=0, ge=0)
    actual_card: int = Field(default=0, ge=0)
    actual_payme: int = Field(default=0, ge=0)
    actual_full_containers: int = Field(default=0, ge=0)
    actual_empty_containers: int = Field(default=0, ge=0)
    note: Optional[str] = None
    return_goods: bool = Field(default=True)


class CourierUpdate(BaseModel):
    car_number: Optional[str] = None
    preferred_navigator: Optional[str] = None
    language: Optional[str] = None


class CourierInvite(BaseModel):
    first_name: str
    last_name: Optional[str] = None
    phone: str


class ProductIssueItem(BaseModel):
    product_id: UUID
    quantity: int = Field(..., gt=0)


class IssueProductsRequest(BaseModel):
    items: list[ProductIssueItem]
    note: Optional[str] = None


class ReturnProductsRequest(BaseModel):
    items: list[ProductIssueItem]
    note: Optional[str] = None


class CourierSelfRegister(BaseModel):
    telegram_id: int
    telegram_username: Optional[str] = None
    first_name: str
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    phone: str
    car_number: str
    tenant_id: str


@router.post("/invite", status_code=201)
async def invite_courier(
    data: CourierInvite,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Pre-register a courier by phone so they can register via the bot."""
    from app.models.user import UserRole

    # Check if phone already registered
    existing_result = await db.execute(
        select(User).where(User.phone == data.phone, User.tenant_id == user.tenant_id)
    )
    existing_user = existing_result.scalar_one_or_none()

    if existing_user:
        # If this user has an inactive courier record — reactivate it
        courier_result = await db.execute(
            select(Courier).where(Courier.user_id == existing_user.id)
        )
        existing_courier = courier_result.scalar_one_or_none()
        if existing_courier and not existing_courier.is_active:
            existing_courier.is_active = True
            existing_user.role = UserRole.COURIER
            existing_user.secondary_role = None
            await db.flush()
            return {"ok": True, "message": "Kuryer qayta faollashtirildi. Barcha tarixi saqlangan."}
        raise HTTPException(status_code=409, detail="Bu telefon raqam allaqachon ro'yxatda bor")

    new_user = User(
        tenant_id=user.tenant_id,
        first_name=data.first_name,
        last_name=data.last_name,
        phone=data.phone,
        role=UserRole.COURIER,
        is_active=True,
    )
    db.add(new_user)
    await db.flush()
    return {"ok": True, "message": "Kuryer taklif qilindi. Endi u botda ro'yxatdan o'tishi mumkin."}


@router.post("/register")
async def self_register_courier(
    data: CourierSelfRegister,
    db: AsyncSession = Depends(get_db),
):
    """Courier self-registration via Telegram bot."""
    from uuid import UUID as _UUID
    from app.models.user import User, UserRole
    from app.core.security import hash_password
    import secrets

    tenant_id = _UUID(data.tenant_id)

    # Check not already registered
    existing = await db.execute(select(User).where(User.telegram_id == data.telegram_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already registered")

    # Create user account
    user = User(
        tenant_id=tenant_id,
        telegram_id=data.telegram_id,
        telegram_username=data.telegram_username,
        first_name=data.first_name,
        last_name=data.last_name,
        phone=data.phone,
        role=UserRole.COURIER,
        hashed_password=hash_password(secrets.token_urlsafe(16)),
        is_active=True,
    )
    db.add(user)
    await db.flush()

    # Create courier profile
    courier = Courier(
        user_id=user.id,
        tenant_id=tenant_id,
        car_number=data.car_number,
    )
    db.add(courier)
    await db.flush()
    return {"ok": True, "user_id": str(user.id)}


@router.get("/invite/check")
async def check_courier_invite(
    phone: str,
    db: AsyncSession = Depends(get_db),
):
    """Check if a phone number is pre-registered as a courier invite."""
    from app.models.user import User, UserRole
    result = await db.execute(
        select(User).where(
            User.phone == phone,
            User.role == UserRole.COURIER,
            User.telegram_id == None,
            User.is_active == True,
        )
    )
    user = result.scalar_one_or_none()
    return {"invited": user is not None}


@router.get("/")
async def list_couriers(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    user: User = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone

    base_query = (
        select(Courier, User)
        .join(User, User.id == Courier.user_id)
        .where(Courier.tenant_id == user.tenant_id, Courier.is_active == True)
    )
    
    total_result = await db.execute(select(func.count()).select_from(base_query.subquery()))
    total = total_result.scalar_one()

    query = base_query.order_by(Courier.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    rows = result.all()

    TASHKENT = timezone(timedelta(hours=5))
    _today = datetime.now(TASHKENT).date()
    today_start = datetime(_today.year, _today.month, _today.day, tzinfo=TASHKENT)
    today_end = datetime(_today.year, _today.month, _today.day, 23, 59, 59, tzinfo=TASHKENT)

    couriers_data = []
    for c, u in rows:
        # Get completed orders count for today (by delivery date, not creation date)
        today_orders = (await db.execute(
            select(func.count()).where(
                Order.courier_id == c.id,
                Order.status == OrderStatus.YETKAZILDI,
                Order.delivered_at >= today_start,
                Order.delivered_at <= today_end,
            )
        )).scalar_one() or 0

        # Get total income collected today (orders + debt payments)
        from app.models.finance import DebtTransaction, DebtTransactionType
        today_order_income = (await db.execute(
            select(func.coalesce(func.sum(Order.paid_amount - Order.advance_used), 0)).where(
                Order.courier_id == c.id,
                Order.is_deleted == False,
                Order.status == OrderStatus.YETKAZILDI,
                Order.delivered_at >= today_start,
                Order.delivered_at <= today_end,
            )
        )).scalar_one() or 0

        today_debt_income = (await db.execute(
            select(func.coalesce(func.sum(DebtTransaction.amount), 0)).where(
                DebtTransaction.created_by_id == c.user_id,
                DebtTransaction.transaction_type == DebtTransactionType.PAYMENT,
                DebtTransaction.tenant_id == user.tenant_id,
                DebtTransaction.created_at >= today_start,
                DebtTransaction.created_at <= today_end,
            )
        )).scalar_one() or 0

        today_income = today_order_income + today_debt_income

        couriers_data.append({
            "id": str(c.id),
            "user_id": str(c.user_id),
            "first_name": u.first_name,
            "last_name": u.last_name,
            "phone": u.phone or "",
            "car_number": c.car_number or "",
            "shift_status": c.shift_status.value if c.shift_status else "closed",
            "is_active": c.is_active,
            "cash_balance": c.cash_balance,
            "card_balance": c.card_balance,
            "payme_balance": c.payme_balance,
            "full_containers": c.full_containers,
            "empty_containers": c.empty_containers,
            "today_orders": today_orders,
            "today_income": today_income,
        })

    return {
        "items": couriers_data,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page
    }


@router.get("/me")
async def get_my_courier_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Courier).where(Courier.user_id == user.id))
    courier = result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier profile not found")

    TASHKENT = timezone(timedelta(hours=5))
    _today = datetime.now(TASHKENT).date()
    today_start = datetime(_today.year, _today.month, _today.day, tzinfo=TASHKENT)
    today_end = datetime(_today.year, _today.month, _today.day, 23, 59, 59, tzinfo=TASHKENT)

    today_count = (await db.execute(
        select(func.count()).where(
            Order.courier_id == courier.id,
            Order.status == OrderStatus.YETKAZILDI,
            Order.delivered_at >= today_start,
            Order.delivered_at <= today_end,
        )
    )).scalar_one() or 0

    from app.models.finance import DebtTransaction, DebtTransactionType
    today_order_income = (await db.execute(
        select(func.coalesce(func.sum(Order.paid_amount - Order.advance_used), 0)).where(
            Order.courier_id == courier.id,
            Order.is_deleted == False,
            Order.status == OrderStatus.YETKAZILDI,
            Order.delivered_at >= today_start,
            Order.delivered_at <= today_end,
        )
    )).scalar_one() or 0

    today_debt_income = (await db.execute(
        select(func.coalesce(func.sum(DebtTransaction.amount), 0)).where(
            DebtTransaction.created_by_id == user.id,
            DebtTransaction.transaction_type == DebtTransactionType.PAYMENT,
            DebtTransaction.tenant_id == user.tenant_id,
            DebtTransaction.created_at >= today_start,
            DebtTransaction.created_at <= today_end,
        )
    )).scalar_one() or 0

    today_income = today_order_income + today_debt_income

    return {
        "id": str(courier.id),
        "user_id": str(courier.user_id),
        "first_name": user.first_name,
        "last_name": user.last_name,
        "phone": user.phone,
        "car_number": courier.car_number,
        "is_active": courier.is_active,
        "shift_open": courier.shift_status == ShiftStatus.OPEN,
        "shift_started_at": courier.shift_started_at.isoformat() if courier.shift_started_at else None,
        "today_deliveries": today_count,
        "today_income": today_income,
        "cash_balance": courier.cash_balance,
        "card_balance": courier.card_balance,
        "payme_balance": courier.payme_balance,
        "container_balance": courier.full_containers,
        "preferred_navigator": courier.preferred_navigator,
        "language": user.language or "uz",
    }


@router.get("/me/inventory")
async def get_my_inventory(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current courier's own inventory (for walkin sales)."""
    courier_result = await db.execute(select(Courier).where(Courier.user_id == user.id))
    courier = courier_result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")

    inventory_result = await db.execute(
        select(CourierInventory).where(CourierInventory.courier_id == courier.id)
    )
    inventory_items = inventory_result.scalars().all()

    product_ids = [item.product_id for item in inventory_items]
    if product_ids:
        products_result = await db.execute(select(Product).where(Product.id.in_(product_ids)))
        products = {p.id: p for p in products_result.scalars().all()}
    else:
        products = {}

    return {
        "items": [
            {
                "product_id": str(item.product_id),
                "product_name": products.get(item.product_id).name if item.product_id in products else "Unknown",
                "price": products.get(item.product_id).price if item.product_id in products else 0,
                "is_returnable_container": products.get(item.product_id).is_returnable_container if item.product_id in products else False,
                "quantity": item.quantity,
            }
            for item in inventory_items
        ]
    }


@router.get("/{courier_id}")
async def get_courier(
    courier_id: UUID,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Courier, User)
        .join(User, User.id == Courier.user_id)
        .where(Courier.id == courier_id, Courier.tenant_id == user.tenant_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Courier not found")
    c, u = row

    # Calculate today's stats (Tashkent timezone)
    TASHKENT = timezone(timedelta(hours=5))
    _today = datetime.now(TASHKENT).date()
    today_start = datetime(_today.year, _today.month, _today.day, tzinfo=TASHKENT)
    today_end = datetime(_today.year, _today.month, _today.day, 23, 59, 59, tzinfo=TASHKENT)

    today_orders = (await db.execute(
        select(func.count()).where(
            Order.courier_id == c.id,
            Order.status == OrderStatus.YETKAZILDI,
            Order.delivered_at >= today_start,
            Order.delivered_at <= today_end,
        )
    )).scalar_one() or 0

    today_order_income = (await db.execute(
        select(func.coalesce(func.sum(Order.paid_amount - Order.advance_used), 0)).where(
            Order.courier_id == c.id,
            Order.is_deleted == False,
            Order.status == OrderStatus.YETKAZILDI,
            Order.delivered_at >= today_start,
            Order.delivered_at <= today_end,
        )
    )).scalar_one() or 0

    from app.models.finance import DebtTransaction, DebtTransactionType
    today_debt_income = (await db.execute(
        select(func.coalesce(func.sum(DebtTransaction.amount), 0)).where(
            DebtTransaction.created_by_id == c.user_id,
            DebtTransaction.transaction_type == DebtTransactionType.PAYMENT,
            DebtTransaction.tenant_id == user.tenant_id,
            DebtTransaction.created_at >= today_start,
            DebtTransaction.created_at <= today_end,
        )
    )).scalar_one() or 0

    today_income = today_order_income + today_debt_income

    return {
        "id": str(c.id),
        "user_id": str(c.user_id),
        "first_name": u.first_name,
        "last_name": u.last_name,
        "phone": u.phone or "",
        "car_number": c.car_number or "",
        "shift_status": c.shift_status.value if c.shift_status else "closed",
        "is_active": c.is_active,
        "cash_balance": c.cash_balance,
        "card_balance": c.card_balance,
        "payme_balance": c.payme_balance,
        "full_containers": c.full_containers,
        "empty_containers": c.empty_containers,
        "today_orders": today_orders,
        "today_income": today_income,
    }


@router.patch("/me")
async def update_my_profile(
    data: CourierUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Courier).where(Courier.user_id == user.id))
    courier = result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier profile not found")

    update_data = data.model_dump(exclude_unset=True)
    language = update_data.pop("language", None)
    for field, value in update_data.items():
        setattr(courier, field, value)
    if language is not None:
        user.language = language

    await db.flush()
    await db.refresh(courier)
    return courier


@router.post("/me/shift/open")
async def open_shift(
    data: ShiftOpen,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Courier).where(Courier.user_id == user.id))
    courier = result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier profile not found")

    if courier.shift_status == ShiftStatus.OPEN:
        raise HTTPException(status_code=400, detail="Shift already open")

    from datetime import datetime, timezone

    # Deduct full containers from warehouse before giving to courier
    if data.full_containers > 0:
        from app.models.warehouse import WarehouseItem, WarehouseStock, WarehouseTransaction, WarehouseTransactionType
        from app.models.product import Product

        # Find water 18.9L product (returnable container)
        prod_result = await db.execute(
            select(Product)
            .where(Product.tenant_id == courier.tenant_id, Product.is_returnable_container == True)
            .limit(1)
        )
        water_product = prod_result.scalar_one_or_none()

        if not water_product:
            raise HTTPException(status_code=400, detail="Qaytariladigan mahsulot topilmadi")

        # Find warehouse item for this product
        wi_result = await db.execute(
            select(WarehouseItem)
            .where(WarehouseItem.product_id == water_product.id, WarehouseItem.tenant_id == courier.tenant_id)
        )
        wi = wi_result.scalar_one_or_none()

        if not wi:
            raise HTTPException(status_code=400, detail="Omborda mahsulot topilmadi")

        ws_result = await db.execute(
            select(WarehouseStock).where(WarehouseStock.item_id == wi.id).with_for_update()
        )
        ws = ws_result.scalar_one_or_none()

        if not ws:
            raise HTTPException(status_code=400, detail="Ombor qoldig'i topilmadi")

        if ws.quantity < data.full_containers:
            raise HTTPException(
                status_code=400,
                detail=f"Omborda yetarli mahsulot yo'q. Mavjud: {ws.quantity}, kerak: {data.full_containers}"
            )

        # Deduct from warehouse
        balance_before = ws.quantity
        ws.quantity -= data.full_containers

        # Record warehouse transaction
        db.add(WarehouseTransaction(
            tenant_id=courier.tenant_id,
            item_id=wi.id,
            transaction_type=WarehouseTransactionType.CHIQIM,
            quantity=data.full_containers,
            balance_before=balance_before,
            balance_after=ws.quantity,
            note=f"Kuryerga berildi (smena ochish) - {courier.user_id}",
            created_by_id=user.id,
        ))

    courier.shift_status = ShiftStatus.OPEN
    courier.shift_started_at = datetime.now(timezone.utc)
    courier.full_containers = data.full_containers
    courier.empty_containers = 0
    # Do NOT reset balances — shift_close already zeroed them.
    # Any remaining balance is from inter-shift deliveries and belongs to the courier.

    from app.models.courier import CourierBalanceLog
    log = CourierBalanceLog(
        courier_id=courier.id,
        tenant_id=courier.tenant_id,
        operation="shift_open",
        full_containers_delta=data.full_containers,
        note=f"Smena ochildi. Boshlang'ich to'la tara: {data.full_containers}, balans: naqd={courier.cash_balance}, karta={courier.card_balance}",
    )
    db.add(log)
    await db.flush()
    return {"status": "ok", "shift_status": "open"}


@router.post("/me/shift/close")
async def close_shift(
    data: ShiftClose,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Courier).where(Courier.user_id == user.id).with_for_update()
    )
    courier = result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")

    if courier.shift_status == ShiftStatus.CLOSED:
        raise HTTPException(status_code=400, detail="Shift already closed")

    if data.actual_cash > courier.cash_balance:
        raise HTTPException(status_code=400, detail=f"Naqd summasi balansdan oshib ketdi: balans {courier.cash_balance} so'm, kiritilgan {data.actual_cash} so'm")
    if data.actual_card > courier.card_balance:
        raise HTTPException(status_code=400, detail=f"Karta summasi balansdan oshib ketdi: balans {courier.card_balance} so'm, kiritilgan {data.actual_card} so'm")
    if data.actual_payme > courier.payme_balance:
        raise HTTPException(status_code=400, detail=f"Payme summasi balansdan oshib ketdi: balans {courier.payme_balance} so'm, kiritilgan {data.actual_payme} so'm")

    # Check for discrepancies
    cash_diff = data.actual_cash - courier.cash_balance
    card_diff = data.actual_card - courier.card_balance
    payme_diff = data.actual_payme - courier.payme_balance

    has_discrepancy = any(d != 0 for d in [cash_diff, card_diff, payme_diff])

    courier.shift_status = ShiftStatus.CLOSED

    from app.models.courier import CourierBalanceLog
    log = CourierBalanceLog(
        courier_id=courier.id,
        tenant_id=courier.tenant_id,
        operation="shift_close",
        note=data.note or f"Smena yopildi. Farq: naqd={cash_diff}, karta={card_diff}, payme={payme_diff}",
    )
    db.add(log)

    if has_discrepancy:
        # Notify boshliq via task queue
        from app.tasks.notifications import notify_shift_discrepancy
        notify_shift_discrepancy.delay(str(courier.id), cash_diff, card_diff, payme_diff)

    # Return unsold full containers to warehouse (only if return_goods=True)
    if data.actual_full_containers > 0 and data.return_goods:
        from app.models.warehouse import WarehouseItem, WarehouseStock, WarehouseTransaction, WarehouseTransactionType
        from app.models.product import Product

        prod_result = await db.execute(
            select(Product)
            .where(Product.tenant_id == courier.tenant_id, Product.is_returnable_container == True)
            .limit(1)
        )
        water_product = prod_result.scalar_one_or_none()

        if water_product:
            wi_result = await db.execute(
                select(WarehouseItem)
                .where(WarehouseItem.product_id == water_product.id, WarehouseItem.tenant_id == courier.tenant_id)
            )
            wi = wi_result.scalar_one_or_none()

            if wi:
                ws_result = await db.execute(
                    select(WarehouseStock).where(WarehouseStock.item_id == wi.id).with_for_update()
                )
                ws = ws_result.scalar_one_or_none()

                if ws:
                    ws.quantity += data.actual_full_containers
                    db.add(WarehouseTransaction(
                        tenant_id=courier.tenant_id,
                        item_id=wi.id,
                        transaction_type=WarehouseTransactionType.KIRIM,
                        quantity=data.actual_full_containers,
                        balance_before=ws.quantity - data.actual_full_containers,
                        balance_after=ws.quantity,
                        note=f"Kuryer smena yopdi - sotilmagan mahsulot qaytarildi",
                        created_by_id=user.id,
                    ))

    # Record cash collection by delivery date using actual per-day order amounts
    from app.models.finance import CourierCashCollection
    from collections import defaultdict

    _tz_tashkent = timezone(timedelta(hours=5))
    shift_start = courier.shift_started_at or datetime(2000, 1, 1, tzinfo=timezone.utc)

    # Portable query: fetch orders and group by Tashkent date in Python
    orders_result = await db.execute(
        select(
            Order.delivered_at,
            Order.cash_amount,
            Order.card_amount,
            Order.payme_amount,
        )
        .where(
            Order.courier_id == courier.id,
            Order.status == OrderStatus.YETKAZILDI,
            Order.delivered_at >= shift_start,
            Order.delivered_at.isnot(None),
        )
        .order_by(Order.delivered_at)
    )
    orders = orders_result.all()

    date_groups = defaultdict(lambda: {'cash': 0, 'card': 0, 'payme': 0, 'cnt': 0})
    for o in orders:
        dt = o.delivered_at
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        local_date = dt.astimezone(_tz_tashkent).date()
        date_groups[local_date]['cash'] += o.cash_amount or 0
        date_groups[local_date]['card'] += o.card_amount or 0
        date_groups[local_date]['payme'] += o.payme_amount or 0
        date_groups[local_date]['cnt'] += 1

    sorted_dates = sorted(date_groups.keys())

    if not sorted_dates:
        today_dt = datetime.now(_tz_tashkent).replace(hour=0, minute=0, second=0, microsecond=0)
        db.add(CourierCashCollection(
            tenant_id=courier.tenant_id, courier_id=courier.id, collected_by_id=user.id,
            cash_amount=data.actual_cash, card_amount=data.actual_card, payme_amount=data.actual_payme,
            total_amount=data.actual_cash + data.actual_card + data.actual_payme,
            full_containers_returned=data.actual_full_containers,
            empty_containers_returned=data.actual_empty_containers,
            orders_completed=0, note=data.note, collection_date=today_dt,
        ))
    else:
        for i, d in enumerate(sorted_dates):
            is_last = (i == len(sorted_dates) - 1)
            grp = date_groups[d]
            col_dt = datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=_tz_tashkent)
            db.add(CourierCashCollection(
                tenant_id=courier.tenant_id, courier_id=courier.id, collected_by_id=user.id,
                cash_amount=grp['cash'], card_amount=grp['card'], payme_amount=grp['payme'],
                total_amount=grp['cash'] + grp['card'] + grp['payme'],
                full_containers_returned=data.actual_full_containers if is_last else 0,
                empty_containers_returned=data.actual_empty_containers if is_last else 0,
                orders_completed=grp['cnt'], note=data.note, collection_date=col_dt,
            ))

    # Reset courier balances to zero after shift close
    courier.cash_balance = 0
    courier.card_balance = 0
    courier.payme_balance = 0
    if data.return_goods:
        courier.full_containers = 0
        courier.empty_containers = 0
    else:
        courier.full_containers = data.actual_full_containers
        courier.empty_containers = data.actual_empty_containers

    await db.flush()
    return {
        "status": "ok",
        "discrepancy": has_discrepancy,
        "cash_diff": cash_diff,
        "card_diff": card_diff,
        "payme_diff": payme_diff,
    }


@router.post("/{courier_id}/shift/open")
async def open_courier_shift_by_boshliq(
    courier_id: UUID,
    data: ShiftOpen,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    """Boshliq opens a courier's shift from the web panel."""
    result = await db.execute(
        select(Courier).where(Courier.id == courier_id, Courier.tenant_id == user.tenant_id).with_for_update()
    )
    courier = result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")

    if courier.shift_status == ShiftStatus.OPEN:
        raise HTTPException(status_code=400, detail="Shift already open")

    from datetime import datetime, timezone
    if data.full_containers > 0:
        from app.models.warehouse import WarehouseItem, WarehouseStock, WarehouseTransaction, WarehouseTransactionType
        from app.models.product import Product

        prod_result = await db.execute(
            select(Product)
            .where(Product.tenant_id == courier.tenant_id, Product.is_returnable_container == True)
            .limit(1)
        )
        water_product = prod_result.scalar_one_or_none()
        if not water_product:
            raise HTTPException(status_code=400, detail="Qaytariladigan mahsulot topilmadi")

        wi_result = await db.execute(
            select(WarehouseItem)
            .where(WarehouseItem.product_id == water_product.id, WarehouseItem.tenant_id == courier.tenant_id)
        )
        wi = wi_result.scalar_one_or_none()
        if not wi:
            raise HTTPException(status_code=400, detail="Omborda mahsulot topilmadi")

        ws_result = await db.execute(
            select(WarehouseStock).where(WarehouseStock.item_id == wi.id).with_for_update()
        )
        ws = ws_result.scalar_one_or_none()
        if not ws or ws.quantity < data.full_containers:
            available = ws.quantity if ws else 0
            raise HTTPException(status_code=400, detail=f"Omborda yetarli mahsulot yo'q. Mavjud: {available}")

        balance_before = ws.quantity
        ws.quantity -= data.full_containers
        db.add(WarehouseTransaction(
            tenant_id=courier.tenant_id, item_id=wi.id,
            transaction_type=WarehouseTransactionType.CHIQIM,
            quantity=data.full_containers, balance_before=balance_before, balance_after=ws.quantity,
            note=f"Kuryerga berildi (smena ochish, web) - {courier_id}",
            created_by_id=user.id,
        ))

        from app.models.courier import CourierInventory
        inv_result = await db.execute(
            select(CourierInventory).where(
                CourierInventory.courier_id == courier.id,
                CourierInventory.product_id == water_product.id,
            ).with_for_update()
        )
        inv = inv_result.scalar_one_or_none()
        if inv:
            inv.quantity += data.full_containers
        else:
            db.add(CourierInventory(
                courier_id=courier.id, product_id=water_product.id,
                tenant_id=courier.tenant_id, quantity=data.full_containers,
            ))

    courier.shift_status = ShiftStatus.OPEN
    courier.shift_started_at = datetime.now(timezone.utc)
    # Do NOT reset balances here — shift_close already zeroed them.
    # Any balance present now is from deliveries made after the last close
    # (inter-shift period) and belongs to the courier.
    if data.full_containers > 0:
        courier.full_containers = data.full_containers

    from app.models.courier import CourierBalanceLog
    db.add(CourierBalanceLog(
        courier_id=courier.id,
        tenant_id=courier.tenant_id,
        operation="shift_open",
        note=f"Smena ochildi (web). Boshlang'ich balans: naqd={courier.cash_balance}, karta={courier.card_balance}",
    ))

    await db.flush()
    return {"status": "ok", "message": "Smena ochildi"}


@router.post("/{courier_id}/shift/close")
async def close_courier_shift_by_operator(
    courier_id: UUID,
    data: ShiftClose,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    """Boshliq closes courier's shift"""
    result = await db.execute(
        select(Courier).where(
            Courier.id == courier_id,
            Courier.tenant_id == user.tenant_id
        ).with_for_update()
    )
    courier = result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")

    if courier.shift_status == ShiftStatus.CLOSED:
        raise HTTPException(status_code=400, detail="Shift already closed")

    if data.actual_cash > courier.cash_balance:
        raise HTTPException(status_code=400, detail=f"Naqd summasi balansdan oshib ketdi: balans {courier.cash_balance} so'm, kiritilgan {data.actual_cash} so'm")
    if data.actual_card > courier.card_balance:
        raise HTTPException(status_code=400, detail=f"Karta summasi balansdan oshib ketdi: balans {courier.card_balance} so'm, kiritilgan {data.actual_card} so'm")
    if data.actual_payme > courier.payme_balance:
        raise HTTPException(status_code=400, detail=f"Payme summasi balansdan oshib ketdi: balans {courier.payme_balance} so'm, kiritilgan {data.actual_payme} so'm")

    # Check for discrepancies
    cash_diff = data.actual_cash - courier.cash_balance
    card_diff = data.actual_card - courier.card_balance
    payme_diff = data.actual_payme - courier.payme_balance

    has_discrepancy = any(d != 0 for d in [cash_diff, card_diff, payme_diff])

    courier.shift_status = ShiftStatus.CLOSED

    from app.models.courier import CourierBalanceLog
    log = CourierBalanceLog(
        courier_id=courier.id,
        tenant_id=courier.tenant_id,
        operation="shift_close_by_operator",
        note=data.note or f"Operator tomonidan yopildi. Farq: naqd={cash_diff}, karta={card_diff}, payme={payme_diff}",
    )
    db.add(log)

    if has_discrepancy:
        # Notify boshliq via task queue
        from app.tasks.notifications import notify_shift_discrepancy
        notify_shift_discrepancy.delay(str(courier.id), cash_diff, card_diff, payme_diff)

    # Return unsold full containers to warehouse (only if return_goods=True)
    if data.actual_full_containers > 0 and data.return_goods:
        from app.models.warehouse import WarehouseItem, WarehouseStock, WarehouseTransaction, WarehouseTransactionType
        from app.models.product import Product

        prod_result = await db.execute(
            select(Product)
            .where(Product.tenant_id == courier.tenant_id, Product.is_returnable_container == True)
            .limit(1)
        )
        water_product = prod_result.scalar_one_or_none()

        if water_product:
            wi_result = await db.execute(
                select(WarehouseItem)
                .where(WarehouseItem.product_id == water_product.id, WarehouseItem.tenant_id == courier.tenant_id)
            )
            wi = wi_result.scalar_one_or_none()

            if wi:
                ws_result = await db.execute(
                    select(WarehouseStock).where(WarehouseStock.item_id == wi.id).with_for_update()
                )
                ws = ws_result.scalar_one_or_none()

                if ws:
                    ws.quantity += data.actual_full_containers
                    db.add(WarehouseTransaction(
                        tenant_id=courier.tenant_id,
                        item_id=wi.id,
                        transaction_type=WarehouseTransactionType.KIRIM,
                        quantity=data.actual_full_containers,
                        balance_before=ws.quantity - data.actual_full_containers,
                        balance_after=ws.quantity,
                        note=f"Kuryer smena yopdi (operator) - sotilmagan mahsulot qaytarildi",
                        created_by_id=user.id,
                    ))

    # Record cash collection by delivery date using actual per-day order amounts
    from app.models.finance import CourierCashCollection
    from collections import defaultdict

    _tz_tashkent = timezone(timedelta(hours=5))
    shift_start = courier.shift_started_at or datetime(2000, 1, 1, tzinfo=timezone.utc)

    # Portable query: fetch orders and group by Tashkent date in Python
    orders_result = await db.execute(
        select(
            Order.delivered_at,
            Order.cash_amount,
            Order.card_amount,
            Order.payme_amount,
        )
        .where(
            Order.courier_id == courier.id,
            Order.status == OrderStatus.YETKAZILDI,
            Order.delivered_at >= shift_start,
            Order.delivered_at.isnot(None),
        )
        .order_by(Order.delivered_at)
    )
    orders = orders_result.all()

    date_groups = defaultdict(lambda: {'cash': 0, 'card': 0, 'payme': 0, 'cnt': 0})
    for o in orders:
        dt = o.delivered_at
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        local_date = dt.astimezone(_tz_tashkent).date()
        date_groups[local_date]['cash'] += o.cash_amount or 0
        date_groups[local_date]['card'] += o.card_amount or 0
        date_groups[local_date]['payme'] += o.payme_amount or 0
        date_groups[local_date]['cnt'] += 1

    sorted_dates = sorted(date_groups.keys())

    if not sorted_dates:
        today_dt = datetime.now(_tz_tashkent).replace(hour=0, minute=0, second=0, microsecond=0)
        db.add(CourierCashCollection(
            tenant_id=courier.tenant_id, courier_id=courier.id, collected_by_id=user.id,
            cash_amount=data.actual_cash, card_amount=data.actual_card, payme_amount=data.actual_payme,
            total_amount=data.actual_cash + data.actual_card + data.actual_payme,
            full_containers_returned=data.actual_full_containers,
            empty_containers_returned=data.actual_empty_containers,
            orders_completed=0, note=data.note, collection_date=today_dt,
        ))
    else:
        for i, d in enumerate(sorted_dates):
            is_last = (i == len(sorted_dates) - 1)
            grp = date_groups[d]
            col_dt = datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=_tz_tashkent)
            db.add(CourierCashCollection(
                tenant_id=courier.tenant_id, courier_id=courier.id, collected_by_id=user.id,
                cash_amount=grp['cash'], card_amount=grp['card'], payme_amount=grp['payme'],
                total_amount=grp['cash'] + grp['card'] + grp['payme'],
                full_containers_returned=data.actual_full_containers if is_last else 0,
                empty_containers_returned=data.actual_empty_containers if is_last else 0,
                orders_completed=grp['cnt'], note=data.note, collection_date=col_dt,
            ))

    # Reset courier balances to zero after shift close
    courier.cash_balance = 0
    courier.card_balance = 0
    courier.payme_balance = 0
    if data.return_goods:
        courier.full_containers = 0
        courier.empty_containers = 0
    else:
        courier.full_containers = data.actual_full_containers
        courier.empty_containers = data.actual_empty_containers

    await db.flush()
    return {
        "status": "ok",
        "discrepancy": has_discrepancy,
        "cash_diff": cash_diff,
        "card_diff": card_diff,
        "payme_diff": payme_diff,
    }


# ==================== COURIER INVENTORY MANAGEMENT ====================

@router.get("/{courier_id}/inventory")
async def get_courier_inventory(
    courier_id: UUID,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Get current inventory of a courier."""
    courier_result = await db.execute(
        select(Courier).where(Courier.id == courier_id, Courier.tenant_id == user.tenant_id)
    )
    courier = courier_result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")

    inventory_result = await db.execute(
        select(CourierInventory).where(CourierInventory.courier_id == courier_id)
    )
    inventory_items = inventory_result.scalars().all()

    product_ids = [item.product_id for item in inventory_items]
    if product_ids:
        products_result = await db.execute(select(Product).where(Product.id.in_(product_ids)))
        products = {p.id: p for p in products_result.scalars().all()}
    else:
        products = {}

    return {
        "items": [
            {
                "product_id": str(item.product_id),
                "product_name": products.get(item.product_id).name if item.product_id in products else "Unknown",
                "quantity": item.quantity,
                "updated_at": item.updated_at.isoformat(),
            }
            for item in inventory_items
        ]
    }


@router.post("/{courier_id}/issue-products")
async def issue_products_to_courier(
    courier_id: UUID,
    data: IssueProductsRequest,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Issue products from warehouse to courier."""
    courier_result = await db.execute(
        select(Courier).where(Courier.id == courier_id, Courier.tenant_id == user.tenant_id)
    )
    courier = courier_result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")

    for item in data.items:
        if item.quantity <= 0:
            raise HTTPException(status_code=400, detail=f"Quantity must be positive")

        warehouse_item_result = await db.execute(
            select(WarehouseItem).where(
                WarehouseItem.product_id == item.product_id,
                WarehouseItem.tenant_id == user.tenant_id
            )
        )
        warehouse_item = warehouse_item_result.scalar_one_or_none()
        if not warehouse_item:
            raise HTTPException(status_code=404, detail=f"Product not found in warehouse")

        stock_result = await db.execute(
            select(WarehouseStock).where(WarehouseStock.item_id == warehouse_item.id).with_for_update()
        )
        stock = stock_result.scalar_one_or_none()
        if not stock or stock.quantity < item.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock. Available: {stock.quantity if stock else 0}"
            )

        balance_before = stock.quantity
        stock.quantity -= item.quantity

        from app.models.warehouse import WarehouseTransaction, WarehouseTransactionType
        db.add(WarehouseTransaction(
            tenant_id=user.tenant_id,
            item_id=warehouse_item.id,
            courier_id=courier_id,
            created_by_id=user.id,
            transaction_type=WarehouseTransactionType.CHIQIM,
            quantity=item.quantity,
            balance_before=balance_before,
            balance_after=stock.quantity,
            note=f"Kuryerga berildi (qo'shimcha chiqim)",
        ))

        courier_inv_result = await db.execute(
            select(CourierInventory).where(
                CourierInventory.courier_id == courier_id,
                CourierInventory.product_id == item.product_id
            ).with_for_update()
        )
        courier_inv = courier_inv_result.scalar_one_or_none()

        if courier_inv:
            courier_inv.quantity += item.quantity
        else:
            courier_inv = CourierInventory(
                tenant_id=user.tenant_id,
                courier_id=courier_id,
                product_id=item.product_id,
                quantity=item.quantity
            )
            db.add(courier_inv)

    await db.flush()
    return {"status": "ok", "message": "Products issued successfully"}


@router.post("/{courier_id}/return-products")
async def return_products_from_courier(
    courier_id: UUID,
    data: ReturnProductsRequest,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Return products from courier back to warehouse."""
    courier_result = await db.execute(
        select(Courier).where(Courier.id == courier_id, Courier.tenant_id == user.tenant_id)
    )
    courier = courier_result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")

    for item in data.items:
        courier_inv_result = await db.execute(
            select(CourierInventory).where(
                CourierInventory.courier_id == courier_id,
                CourierInventory.product_id == item.product_id
            )
        )
        courier_inv = courier_inv_result.scalar_one_or_none()
        if not courier_inv or courier_inv.quantity < item.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough product. Available: {courier_inv.quantity if courier_inv else 0}"
            )

        courier_inv.quantity -= item.quantity
        if courier_inv.quantity == 0:
            await db.delete(courier_inv)

        warehouse_item_result = await db.execute(
            select(WarehouseItem).where(
                WarehouseItem.product_id == item.product_id,
                WarehouseItem.tenant_id == user.tenant_id
            )
        )
        warehouse_item = warehouse_item_result.scalar_one_or_none()
        if not warehouse_item:
            raise HTTPException(status_code=404, detail=f"Product not found in warehouse")

        stock_result = await db.execute(
            select(WarehouseStock).where(WarehouseStock.item_id == warehouse_item.id)
        )
        stock = stock_result.scalar_one_or_none()
        if stock:
            balance_before = stock.quantity
            stock.quantity += item.quantity
        else:
            balance_before = 0
            stock = WarehouseStock(item_id=warehouse_item.id, quantity=item.quantity, empty_quantity=0)
            db.add(stock)

        from app.models.warehouse import WarehouseTransaction, WarehouseTransactionType
        db.add(WarehouseTransaction(
            tenant_id=user.tenant_id,
            item_id=warehouse_item.id,
            courier_id=courier_id,
            created_by_id=user.id,
            transaction_type=WarehouseTransactionType.KIRIM,
            quantity=item.quantity,
            balance_before=balance_before,
            balance_after=balance_before + item.quantity,
            note=f"Kuryer qaytardi (qo'shimcha kirim)",
        ))

    await db.flush()
    return {"status": "ok", "message": "Products returned successfully"}


@router.get("/{courier_id}/daily-summary")
async def get_courier_daily_summary(
    courier_id: UUID,
    days: int = Query(default=30, ge=1, le=90),
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    TASHKENT = timezone(timedelta(hours=5))
    today = datetime.now(TASHKENT).date()
    since = today - timedelta(days=days - 1)
    since_dt = datetime(since.year, since.month, since.day, tzinfo=TASHKENT)

    courier_result = await db.execute(
        select(Courier).where(Courier.id == courier_id, Courier.tenant_id == user.tenant_id)
    )
    if not courier_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Courier not found")

    day_expr = cast(
        Order.delivered_at.op("AT TIME ZONE")("Asia/Tashkent"),
        SQLDate
    ).label("day")

    # Subquery: total delivered quantity per order from order_items
    # (containers_delivered only tracks returnable 18.9L gallons;
    #  this covers all product types including non-returnable 5L/10L)
    item_agg = (
        select(
            OrderItem.order_id,
            func.sum(OrderItem.delivered_quantity).label("total_qty"),
        )
        .group_by(OrderItem.order_id)
        .subquery()
    )

    rows = (await db.execute(
        select(
            day_expr,
            func.count(Order.id).label("orders_count"),
            func.coalesce(func.sum(item_agg.c.total_qty), 0).label("total_delivered"),
            func.coalesce(func.sum(Order.containers_returned), 0).label("total_returned"),
            func.coalesce(func.sum(Order.paid_amount - Order.advance_used), 0).label("total_income"),
            func.coalesce(func.sum(Order.cash_amount), 0).label("cash_income"),
            func.coalesce(func.sum(Order.card_amount), 0).label("card_income"),
            func.coalesce(func.sum(Order.payme_amount), 0).label("payme_income"),
            func.coalesce(func.sum(Order.advance_used), 0).label("advance_income"),
        )
        .outerjoin(item_agg, item_agg.c.order_id == Order.id)
        .where(
            Order.courier_id == courier_id,
            Order.tenant_id == user.tenant_id,
            Order.is_deleted == False,
            Order.status == OrderStatus.YETKAZILDI,
            Order.delivered_at >= since_dt,
        )
        .group_by(text("day"))
        .order_by(text("day desc"))
    )).all()

    return [
        {
            "date": str(row.day),
            "orders_count": row.orders_count,
            "total_delivered": row.total_delivered,
            "total_returned": row.total_returned,
            "total_income": row.total_income,
            "cash_income": row.cash_income,
            "card_income": row.card_income,
            "payme_income": row.payme_income,
            "advance_income": row.advance_income,
        }
        for row in rows
    ]


@router.get("/{courier_id}/orders-by-date")
async def get_courier_orders_by_date(
    courier_id: UUID,
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    from app.models.client import Client, ClientAddress
    from app.models.order import OrderItem

    TASHKENT = timezone(timedelta(hours=5))
    from datetime import date as date_type
    d = date_type.fromisoformat(date)
    day_start = datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=TASHKENT)
    day_end = datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=TASHKENT)

    courier_result = await db.execute(
        select(Courier).where(Courier.id == courier_id, Courier.tenant_id == user.tenant_id)
    )
    if not courier_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Courier not found")

    orders_result = await db.execute(
        select(Order)
        .where(
            Order.courier_id == courier_id,
            Order.tenant_id == user.tenant_id,
            Order.is_deleted == False,
            Order.status == OrderStatus.YETKAZILDI,
            Order.delivered_at >= day_start,
            Order.delivered_at <= day_end,
        )
        .order_by(Order.delivered_at.asc())
    )
    orders = orders_result.scalars().all()

    result = []
    for order in orders:
        # Resolve delivery address
        delivery_address = None
        if order.walkin_address:
            delivery_address = order.walkin_address
        elif order.address_id:
            addr_result = await db.execute(
                select(ClientAddress).where(ClientAddress.id == order.address_id)
            )
            addr = addr_result.scalar_one_or_none()
            if addr:
                delivery_address = addr.address_text

        # Client name as fallback label
        client_name = None
        if order.client_id:
            client_result = await db.execute(
                select(Client).where(Client.id == order.client_id)
            )
            client = client_result.scalar_one_or_none()
            if client:
                parts = [p for p in [client.first_name, client.last_name] if p and p.strip() and p.strip() not in ('-', '')]
                name = ' '.join(parts).strip()
                if name:
                    client_name = name
        elif order.is_walkin:
            client_name = "Tez sotuv"

        items_result = await db.execute(
            select(OrderItem, Product)
            .join(Product, Product.id == OrderItem.product_id)
            .where(OrderItem.order_id == order.id)
        )
        items = [
            {
                "product_name": prod.name,
                "quantity": oi.quantity,
                "delivered_quantity": oi.delivered_quantity,
                "price": oi.price_at_order,
                "total": oi.total,
            }
            for oi, prod in items_result.all()
        ]

        total_delivered_qty = sum(item["delivered_quantity"] for item in items)
        result.append({
            "id": order.id,
            "client_name": client_name,
            "delivery_address": delivery_address,
            "containers_delivered": total_delivered_qty,
            "containers_returned": order.containers_returned,
            "paid_amount": order.paid_amount,
            "cash_amount": order.cash_amount,
            "card_amount": order.card_amount,
            "payme_amount": order.payme_amount,
            "advance_used": order.advance_used,
            "debt_amount": order.debt_amount,
            "payment_method": order.payment_method.value if order.payment_method else None,
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "items": items,
        })

    return result


# ── Courier debt history ──────────────────────────────────────────────────────

@router.get("/{courier_id}/debt-summary")
async def get_courier_debt_summary(
    courier_id: UUID,
    days: int = Query(default=30, ge=1, le=90),
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Daily debt summary for a courier: debts given + payments collected per day."""
    from app.models.finance import Debt, DebtTransaction, DebtTransactionType
    from app.models.client import Client, ClientAddress

    TASHKENT = timezone(timedelta(hours=5))
    today = datetime.now(TASHKENT).date()
    since = today - timedelta(days=days - 1)
    since_dt = datetime(since.year, since.month, since.day, tzinfo=TASHKENT)

    courier_result = await db.execute(
        select(Courier).where(Courier.id == courier_id, Courier.tenant_id == user.tenant_id)
    )
    courier = courier_result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")

    pay_day_expr = cast(
        DebtTransaction.created_at.op("AT TIME ZONE")("Asia/Tashkent"),
        SQLDate
    ).label("day")

    debt_day_expr = cast(
        Debt.created_at.op("AT TIME ZONE")("Asia/Tashkent"),
        SQLDate
    ).label("day")

    # Debts given via courier's delivered orders (Debt table, created at delivery time)
    debt_rows = (await db.execute(
        select(
            debt_day_expr,
            func.count(Debt.id).label("count"),
            func.sum(Debt.original_amount).label("total"),
        )
        .join(Order, Order.id == Debt.order_id)
        .where(
            Debt.tenant_id == user.tenant_id,
            Debt.created_at >= since_dt,
            Order.courier_id == courier_id,
        )
        .group_by(text("day"))
    )).all()

    # PAYMENT transactions collected by this courier (created_by = courier's user)
    payment_rows = (await db.execute(
        select(
            pay_day_expr,
            func.count(DebtTransaction.id).label("count"),
            func.sum(DebtTransaction.amount).label("total"),
        )
        .where(
            DebtTransaction.tenant_id == user.tenant_id,
            DebtTransaction.transaction_type == DebtTransactionType.PAYMENT,
            DebtTransaction.created_at >= since_dt,
            DebtTransaction.created_by_id == courier.user_id,
        )
        .group_by(text("day"))
    )).all()

    debt_by_day = {str(r.day): {"count": r.count, "total": int(r.total or 0)} for r in debt_rows}
    pay_by_day  = {str(r.day): {"count": r.count, "total": int(r.total or 0)} for r in payment_rows}
    all_days = sorted(set(debt_by_day) | set(pay_by_day), reverse=True)

    return [
        {
            "date": d,
            "debt_count":    debt_by_day.get(d, {}).get("count", 0),
            "debt_total":    debt_by_day.get(d, {}).get("total", 0),
            "payment_count": pay_by_day.get(d, {}).get("count", 0),
            "payment_total": pay_by_day.get(d, {}).get("total", 0),
        }
        for d in all_days
    ]


@router.get("/{courier_id}/debts-by-date")
async def get_courier_debts_by_date(
    courier_id: UUID,
    date: str = Query(..., description="YYYY-MM-DD"),
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Debt transactions detail for a courier on a specific date."""
    from app.models.finance import Debt, DebtTransaction, DebtTransactionType
    from app.models.client import Client, ClientAddress
    from datetime import date as date_type

    TASHKENT = timezone(timedelta(hours=5))
    d = date_type.fromisoformat(date)
    day_start = datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=TASHKENT)
    day_end   = datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=TASHKENT)

    courier_result = await db.execute(
        select(Courier).where(Courier.id == courier_id, Courier.tenant_id == user.tenant_id)
    )
    courier = courier_result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")

    addr_subq = (
        select(ClientAddress.address_text)
        .where(ClientAddress.client_id == Client.id, ClientAddress.is_primary == True)
        .limit(1)
        .correlate(Client)
        .scalar_subquery()
    )

    # Debts given — via courier's delivered orders (Debt table)
    debt_result = await db.execute(
        select(Debt, Client.phone, addr_subq.label("addr"))
        .join(Client, Client.id == Debt.client_id)
        .join(Order, Order.id == Debt.order_id)
        .where(
            Debt.tenant_id == user.tenant_id,
            Debt.created_at >= day_start,
            Debt.created_at <= day_end,
            Order.courier_id == courier_id,
        )
        .order_by(Debt.created_at.asc())
    )

    # Payments collected by courier
    pay_result = await db.execute(
        select(DebtTransaction, Client.phone, addr_subq.label("addr"))
        .join(Client, Client.id == DebtTransaction.client_id)
        .where(
            DebtTransaction.tenant_id == user.tenant_id,
            DebtTransaction.transaction_type == DebtTransactionType.PAYMENT,
            DebtTransaction.created_at >= day_start,
            DebtTransaction.created_at <= day_end,
            DebtTransaction.created_by_id == courier.user_id,
        )
        .order_by(DebtTransaction.created_at.asc())
    )

    def _fmt_debt(row_tuple):
        debt, phone, addr = row_tuple
        return {
            "id": str(debt.id),
            "type": "debt",
            "client_name": addr or phone or "—",
            "amount": debt.original_amount,
            "payment_method": None,
            "created_at": debt.created_at.isoformat(),
        }

    def _fmt_payment(row_tuple):
        tx, phone, addr = row_tuple
        return {
            "id": str(tx.id),
            "type": "payment",
            "client_name": addr or phone or "—",
            "amount": tx.amount,
            "payment_method": tx.payment_method.value if tx.payment_method else None,
            "created_at": tx.created_at.isoformat(),
        }

    return {
        "debts":    [_fmt_debt(r) for r in debt_result.all()],
        "payments": [_fmt_payment(r) for r in pay_result.all()],
    }


# ── Courier client search (for walkin Eski mijoz mode) ────────────────────────

@router.get("/me/clients/search")
async def search_clients_for_courier(
    q: str = Query(..., min_length=1),
    user: User = Depends(get_current_courier),
    db: AsyncSession = Depends(get_db),
):
    """Lightweight client search for walkin quick sale (Eski mijoz)."""
    from sqlalchemy import or_
    safe = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{safe}%"

    result = await db.execute(
        select(Client)
        .outerjoin(ClientAddress, (ClientAddress.client_id == Client.id) & (ClientAddress.is_primary == True))
        .where(
            Client.tenant_id == user.tenant_id,
            Client.is_deleted == False,
            Client.is_blocked == False,
            or_(
                Client.first_name.ilike(pattern),
                Client.last_name.ilike(pattern),
                Client.phone.ilike(pattern),
                ClientAddress.address_text.ilike(pattern),
            ),
        )
        .order_by(Client.first_name)
        .limit(15)
    )
    clients = result.scalars().all()

    client_ids = [c.id for c in clients]
    addr_map: dict = {}
    if client_ids:
        addr_r = await db.execute(
            select(ClientAddress).where(
                ClientAddress.client_id.in_(client_ids),
                ClientAddress.is_primary == True,
            )
        )
        addr_map = {a.client_id: a for a in addr_r.scalars().all()}

    return [
        {
            "id": str(c.id),
            "name": c.full_name,
            "phone": c.phone,
            "debt_amount": c.debt_amount,
            "container_balance": c.container_balance,
            "primary_address": addr_map[c.id].address_text if c.id in addr_map else None,
        }
        for c in clients
    ]


@router.get("/me/clients/{client_id}/addresses")
async def get_client_addresses_for_courier(
    client_id: UUID,
    user: User = Depends(get_current_courier),
    db: AsyncSession = Depends(get_db),
):
    """Get a client's addresses for walkin quick sale address selection."""
    client_r = await db.execute(
        select(Client).where(
            Client.id == client_id,
            Client.tenant_id == user.tenant_id,
            Client.is_deleted == False,
        )
    )
    if not client_r.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Mijoz topilmadi")

    result = await db.execute(
        select(ClientAddress)
        .where(ClientAddress.client_id == client_id)
        .order_by(ClientAddress.is_primary.desc(), ClientAddress.created_at.desc())
    )
    addresses = result.scalars().all()
    return [
        {
            "id": str(a.id),
            "address_text": a.address_text,
            "is_primary": a.is_primary,
        }
        for a in addresses
    ]


# ── Courier Expenses ────────────────────────────────────────────────────────

class ExpenseCreate(BaseModel):
    title: str
    amount: int
    payment_method: str = "naqd"  # naqd | karta


# /me routes MUST come before /{courier_id} to avoid FastAPI matching "me" as UUID

@router.get("/me/expenses")
async def list_my_expenses(
    page: int = Query(1, ge=1),
    per_page: int = Query(20),
    user: User = Depends(get_current_courier),
    db: AsyncSession = Depends(get_db),
):
    from app.models.courier import CourierExpense
    courier_result = await db.execute(select(Courier).where(Courier.user_id == user.id))
    courier = courier_result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")

    query = (
        select(CourierExpense)
        .where(CourierExpense.courier_id == courier.id, CourierExpense.tenant_id == user.tenant_id)
        .order_by(CourierExpense.created_at.desc())
    )
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (await db.execute(query.offset((page - 1) * per_page).limit(per_page))).scalars().all()
    return {
        "items": [
            {"id": str(e.id), "title": e.title, "amount": e.amount, "payment_method": e.payment_method, "created_at": e.created_at.isoformat()}
            for e in rows
        ],
        "total": total,
    }


@router.post("/me/expenses", status_code=201)
async def create_my_expense(
    data: ExpenseCreate,
    user: User = Depends(get_current_courier),
    db: AsyncSession = Depends(get_db),
):
    from app.models.courier import CourierExpense
    if data.payment_method not in ("naqd", "karta"):
        raise HTTPException(status_code=400, detail="payment_method must be 'naqd' or 'karta'")

    courier_result = await db.execute(select(Courier).where(Courier.user_id == user.id).with_for_update())
    courier = courier_result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")

    if data.payment_method == "naqd":
        if courier.cash_balance < data.amount:
            raise HTTPException(status_code=400, detail=f"Yetarli naqd mablag' yo'q: {courier.cash_balance} so'm mavjud")
        courier.cash_balance -= data.amount
    else:
        if courier.card_balance < data.amount:
            raise HTTPException(status_code=400, detail=f"Yetarli karta mablag' yo'q: {courier.card_balance} so'm mavjud")
        courier.card_balance -= data.amount

    expense = CourierExpense(
        tenant_id=user.tenant_id,
        courier_id=courier.id,
        title=data.title,
        amount=data.amount,
        payment_method=data.payment_method,
    )
    db.add(expense)
    await db.flush()
    return {
        "id": str(expense.id),
        "title": expense.title,
        "amount": expense.amount,
        "payment_method": expense.payment_method,
        "cash_balance": courier.cash_balance,
        "card_balance": courier.card_balance,
    }



@router.get("/{courier_id}/expenses")
async def list_expenses(
    courier_id: UUID,
    page: int = Query(1, ge=1),
    per_page: int = Query(20),
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    from app.models.courier import CourierExpense
    query = (
        select(CourierExpense)
        .where(CourierExpense.courier_id == courier_id, CourierExpense.tenant_id == user.tenant_id)
        .order_by(CourierExpense.created_at.desc())
    )
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (await db.execute(query.offset((page - 1) * per_page).limit(per_page))).scalars().all()
    return {
        "items": [
            {"id": str(e.id), "title": e.title, "amount": e.amount, "payment_method": e.payment_method, "created_at": e.created_at.isoformat()}
            for e in rows
        ],
        "total": total,
        "page": page,
    }


@router.post("/{courier_id}/expenses", status_code=201)
async def create_expense(
    courier_id: UUID,
    data: ExpenseCreate,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    from app.models.courier import CourierExpense
    courier_result = await db.execute(
        select(Courier).where(Courier.id == courier_id, Courier.tenant_id == user.tenant_id).with_for_update()
    )
    courier = courier_result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")

    if data.payment_method == "naqd":
        if courier.cash_balance < data.amount:
            raise HTTPException(status_code=400, detail=f"Yetarli naqd mablag' yo'q: {courier.cash_balance} so'm mavjud")
        courier.cash_balance -= data.amount
    else:
        if courier.card_balance < data.amount:
            raise HTTPException(status_code=400, detail=f"Yetarli karta mablag' yo'q: {courier.card_balance} so'm mavjud")
        courier.card_balance -= data.amount

    expense = CourierExpense(
        tenant_id=user.tenant_id,
        courier_id=courier_id,
        title=data.title,
        amount=data.amount,
        payment_method=data.payment_method,
    )
    db.add(expense)
    await db.flush()
    return {"id": str(expense.id), "title": expense.title, "amount": expense.amount,
            "cash_balance": courier.cash_balance, "card_balance": courier.card_balance}


@router.delete("/{courier_id}", status_code=204)
async def delete_courier(
    courier_id: UUID,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    """Deactivate a courier (soft delete, history preserved). Blocked if shift open or active orders exist."""
    result = await db.execute(
        select(Courier).where(Courier.id == courier_id, Courier.tenant_id == user.tenant_id)
    )
    courier = result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Kuryer topilmadi")

    if courier.shift_status == ShiftStatus.OPEN:
        raise HTTPException(status_code=400, detail="Smenani avval yoping")

    if courier.cash_balance != 0 or courier.card_balance != 0 or courier.payme_balance != 0:
        raise HTTPException(status_code=400, detail="Kassani avval nolga tushuzing")

    if courier.full_containers != 0 or courier.empty_containers != 0:
        raise HTTPException(status_code=400, detail="Tarani avval qaytaring")

    active_statuses = [
        OrderStatus.YANGI, OrderStatus.QABUL_QILINDI,
        OrderStatus.TAYINLANDI, OrderStatus.YOLDA,
    ]
    active_count = (await db.execute(
        select(func.count(Order.id)).where(
            Order.courier_id == courier_id,
            Order.status.in_(active_statuses),
            Order.is_deleted == False,
        )
    )).scalar_one()
    if active_count > 0:
        raise HTTPException(status_code=400, detail=f"Kuryerda {active_count} ta faol buyurtma bor")

    courier.is_active = False

    user_result = await db.execute(select(User).where(User.id == courier.user_id))
    courier_user = user_result.scalar_one_or_none()
    if courier_user:
        if courier_user.role == UserRole.COURIER:
            courier_user.role = UserRole.OPERATOR
        courier_user.secondary_role = None

    await db.flush()


@router.delete("/{courier_id}/expenses/{expense_id}", status_code=204)
async def delete_expense(
    courier_id: UUID,
    expense_id: UUID,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    from app.models.courier import CourierExpense
    result = await db.execute(
        select(CourierExpense).where(
            CourierExpense.id == expense_id,
            CourierExpense.courier_id == courier_id,
            CourierExpense.tenant_id == user.tenant_id,
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    courier_result = await db.execute(select(Courier).where(Courier.id == courier_id).with_for_update())
    courier = courier_result.scalar_one_or_none()
    if courier:
        if courier.shift_status == ShiftStatus.OPEN:
            # Shift is still open — return money back to courier balance
            if expense.payment_method == "naqd":
                courier.cash_balance += expense.amount
            else:
                courier.card_balance += expense.amount
        else:
            # Shift is closed — money was already collected; record as additional cash collection
            from app.models.finance import CourierCashCollection
            is_card = expense.payment_method == "karta"
            db.add(CourierCashCollection(
                tenant_id=expense.tenant_id,
                courier_id=courier.id,
                collected_by_id=user.id,
                cash_amount=0 if is_card else expense.amount,
                card_amount=expense.amount if is_card else 0,
                payme_amount=0,
                total_amount=expense.amount,
                orders_completed=0,
                note=f"Xarajat bekor qilindi: {expense.title} ({expense.amount:,} so'm)",
                collection_date=datetime.now(timezone.utc),
            ))

    await db.delete(expense)
    await db.flush()


class SetPasswordRequest(BaseModel):
    password: str = Field(..., min_length=4)


@router.post("/{courier_id}/set-password", status_code=200)
async def set_courier_password(
    courier_id: UUID,
    data: SetPasswordRequest,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Set or reset password for a courier (web login)."""
    from app.core.security import hash_password

    result = await db.execute(
        select(Courier).where(Courier.id == courier_id, Courier.tenant_id == user.tenant_id)
    )
    courier = result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")

    user_result = await db.execute(select(User).where(User.id == courier.user_id).with_for_update())
    courier_user = user_result.scalar_one_or_none()
    if not courier_user:
        raise HTTPException(status_code=404, detail="Courier user not found")

    courier_user.hashed_password = hash_password(data.password)
    await db.flush()
    return {"ok": True, "message": "Parol muvaffaqiyatli o'rnatildi"}

    await db.delete(expense)
    await db.flush()
