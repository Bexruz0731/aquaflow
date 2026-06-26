from typing import Optional, List
from uuid import UUID
from datetime import datetime, timezone, timedelta, date

from pydantic import BaseModel, Field as PydanticField
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, update, case
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import selectinload

from app.db.base import get_db
from app.core.deps import get_current_user, require_operator, require_agent, require_courier, get_current_courier, require_boshliq, require_staff
from app.core.limiter import limiter
from app.models.user import User, UserRole
from app.models.order import Order, OrderItem, OrderStatusHistory, OrderStatus, PaymentStatus, PaymentMethod
from app.models.client import Client, ClientAddress, ClientGroup
from app.models.product import Product
from app.models.courier import Courier, CourierInventory, ShiftStatus
from app.models.finance import ContainerClientBalance, ContainerTransaction, Debt
from app.models.warehouse import WarehouseItem, WarehouseStock, WarehouseTransaction, WarehouseTransactionType
from app.schemas.order import (
    OrderCreate, OrderResponse, AssignCourierRequest,
    CompleteOrderRequest, ProblemRequest, CancelRequest, StatusChangeResponse,
)
from app.utils.push import send_order_push

router = APIRouter()


async def _get_client_push_token(order: Order, db: AsyncSession) -> str | None:
    """Return the Expo push token for the client who placed the order, or None."""
    if not order.client_id:
        return None
    row = await db.execute(
        select(User.fcm_token)
        .join(Client, Client.user_id == User.id)
        .where(Client.id == order.client_id)
    )
    return row.scalar_one_or_none()


async def _enrich_order(order: Order, db: AsyncSession) -> dict:
    """Build a courier-facing dict with joined client/address/product data."""
    d = {
        "id": order.id,
        "order_number": order.id,
        "status": order.status.value if hasattr(order.status, 'value') else str(order.status),
        "payment_status": order.payment_status.value if hasattr(order.payment_status, 'value') else str(order.payment_status),
        "total_amount": order.total_amount,
        "discount_amount": order.discount_amount,
        "paid_amount": order.paid_amount,
        "cash_amount": order.cash_amount,
        "card_amount": order.card_amount,
        "payme_amount": order.payme_amount,
        "advance_used": order.advance_used if hasattr(order, 'advance_used') else 0,
        "debt_amount": order.debt_amount,
        "comment": order.comment,
        "contact_phone": order.contact_phone,
        "created_at": order.created_at.isoformat(),
        "completed_at": order.delivered_at.isoformat() if order.delivered_at else None,
        "containers_returned": order.containers_returned,
        "containers_delivered": order.containers_delivered,
        "is_walkin": order.is_walkin,
        "walkin_phone": order.walkin_phone,
        "walkin_address": order.walkin_address,
        "walkin_store": order.walkin_store,
        "client_name": None,
        "client_phone": None,
        "client_debt": 0,
        "client_advance": 0,
        "client_container_balance": 0,
        "address_text": None,
        "latitude": None,
        "longitude": None,
        "items": [],
    }

    # Client
    if order.client_id:
        client_r = await db.execute(select(Client).where(Client.id == order.client_id))
        client = client_r.scalar_one_or_none()
        if client:
            d["client_phone"] = client.phone
            d["client_debt"] = client.debt_amount
            d["client_advance"] = client.advance_amount
            d["client_container_balance"] = client.container_balance

    # Address — prefer FK address, fallback to walkin_address (used after edit)
    if order.address_id:
        addr_r = await db.execute(select(ClientAddress).where(ClientAddress.id == order.address_id))
        addr = addr_r.scalar_one_or_none()
        if addr:
            d["address_text"] = addr.address_text
            d["latitude"] = addr.latitude
            d["longitude"] = addr.longitude
    if not d["address_text"] and order.walkin_address:
        d["address_text"] = order.walkin_address
    # client_name = address (primary identifier in this system)
    if d["address_text"]:
        d["client_name"] = d["address_text"]
    elif d["client_phone"]:
        d["client_name"] = d["client_phone"]

    # Items
    items_r = await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))
    items = items_r.scalars().all()
    enriched_items = []
    for item in items:
        prod_r = await db.execute(select(Product).where(Product.id == item.product_id))
        prod = prod_r.scalar_one_or_none()
        enriched_items.append({
            "id": str(item.id),
            "product_id": str(item.product_id),
            "product_name": prod.name if prod else None,
            "quantity": item.quantity,
            "price_at_order": item.price_at_order,
            "total": item.total,
            "volume_liters": prod.volume_liters if prod else None,
            "is_returnable": prod.is_returnable_container if prod else False,
        })
    d["items"] = enriched_items
    return d


async def _record_status(db, order_id: int, tenant_id, status: OrderStatus, user_id=None, note=None):
    entry = OrderStatusHistory(
        order_id=order_id,
        tenant_id=tenant_id,
        status=status,
        changed_by_id=user_id,
        note=note,
    )
    db.add(entry)


# ── Create ────────────────────────────────────────────────────────────────

@router.post("/", response_model=OrderResponse, status_code=201)
@limiter.limit("60/minute")
async def create_order(
    request: Request,
    data: OrderCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Walkin orders skip client lookup entirely
    if data.is_walkin:
        client_id = None
    else:
        # Auto-resolve client_id for client role (mini-app doesn't pass it)
        client_id = data.client_id
        if client_id is None:
            from app.models.client import Client as ClientModel
            client_result = await db.execute(
                select(ClientModel).where(ClientModel.user_id == user.id, ClientModel.tenant_id == user.tenant_id)
            )
            client_obj = client_result.scalar_one_or_none()
            if not client_obj:
                raise HTTPException(status_code=404, detail="Client profile not found")
            client_id = client_obj.id

    # Fetch products and fix prices at order time
    total = 0
    items_data = []
    for item in data.items:
        result = await db.execute(
            select(Product).where(Product.id == item.product_id, Product.tenant_id == user.tenant_id, Product.is_active == True)
        )
        product = result.scalar_one_or_none()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
        item_total = product.price * item.quantity
        total += item_total
        items_data.append({"product": product, "quantity": item.quantity, "price": product.price, "total": item_total})

    # Determine initial status
    initial_status = OrderStatus.YANGI
    if data.status == "yetkazildi" and user.role in [UserRole.OPERATOR, UserRole.BOSHLIQ]:
        initial_status = OrderStatus.YETKAZILDI

    address_id = data.address_id
    if not address_id and getattr(data, "delivery_address", None):
        delivery_text = data.delivery_address.strip()
        from app.models.client import ClientAddress
        existing_addr = await db.execute(
            select(ClientAddress).where(
                ClientAddress.client_id == client_id,
                ClientAddress.address_text == delivery_text
            )
        )
        addr_obj = existing_addr.scalar_one_or_none()
        if addr_obj:
            address_id = addr_obj.id
        else:
            new_addr = ClientAddress(
                client_id=client_id,
                tenant_id=user.tenant_id,
                label="Boshqa",
                address_text=delivery_text,
                is_primary=False
            )
            db.add(new_addr)
            await db.flush()
            address_id = new_addr.id

    order = Order(
        tenant_id=user.tenant_id,
        client_id=client_id,
        address_id=address_id,
        courier_id=data.courier_id,
        status=initial_status,
        total_amount=total,
        comment=data.comment,
        contact_phone=data.contact_phone,
        is_phone_order=data.is_phone_order,
        is_walkin=data.is_walkin,
        walkin_phone=data.walkin_phone,
        walkin_address=data.walkin_address,
        walkin_store=data.walkin_store,
    )

    if data.courier_id:
        order.status = OrderStatus.TAYINLANDI

    db.add(order)
    await db.flush()

    for item_d in items_data:
        db.add(OrderItem(
            order_id=order.id,
            product_id=item_d["product"].id,
            tenant_id=user.tenant_id,
            quantity=item_d["quantity"],
            delivered_quantity=item_d["quantity"],  # Default: all items will be delivered
            price_at_order=item_d["price"],
            total=item_d["total"],
        ))

    await _record_status(db, order.id, user.tenant_id, order.status, user.id)
    await db.flush()

    # Reload order with items for response
    result = await db.execute(
        select(Order).where(Order.id == order.id).options(selectinload(Order.items))
    )
    order = result.scalar_one()

    return order


# ── List ──────────────────────────────────────────────────────────────────

@router.get("/")
async def list_orders(
    status: Optional[str] = Query(None),
    courier_id: Optional[UUID] = Query(None),
    client_id: Optional[UUID] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    search: Optional[str] = Query(None),
    today_only: bool = Query(False),
    is_walkin: Optional[bool] = Query(None),
    volume_filter: Optional[str] = Query(None),  # "small" (5,10L) or "large" (18.9L)
    include_deleted: bool = Query(False),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: User = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
):
    query = select(Order).where(Order.tenant_id == user.tenant_id)
    # Only boshliq/super_admin can view deleted orders
    is_boss = user.role in (UserRole.BOSHLIQ, UserRole.SUPER_ADMIN)
    if not include_deleted or not is_boss:
        query = query.where(Order.is_deleted == False)

    if is_walkin is not None:
        query = query.where(Order.is_walkin == is_walkin)
    if volume_filter == "small":
        small_order_ids = select(OrderItem.order_id).join(
            Product, Product.id == OrderItem.product_id
        ).where(Product.volume.in_([5, 10])).distinct()
        query = query.where(Order.id.in_(small_order_ids))
    elif volume_filter == "large":
        large_order_ids = select(OrderItem.order_id).join(
            Product, Product.id == OrderItem.product_id
        ).where(Product.volume == 18).distinct()
        query = query.where(Order.id.in_(large_order_ids))
    if status:
        try:
            query = query.where(Order.status == OrderStatus(status))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}. Valid values: {[s.value for s in OrderStatus]}")
    if courier_id:
        query = query.where(Order.courier_id == courier_id)
    if client_id:
        query = query.where(Order.client_id == client_id)
    if search:
        from sqlalchemy import or_
        s = f"%{search}%"
        client_ids_sub = select(Client.id).where(Client.tenant_id == user.tenant_id, Client.phone.ilike(s))
        addr_order_ids_sub = (
            select(Order.id)
            .join(ClientAddress, Order.address_id == ClientAddress.id)
            .where(Order.tenant_id == user.tenant_id, ClientAddress.address_text.ilike(s))
        )
        conditions = [
            Order.walkin_address.ilike(s),
            Order.walkin_phone.ilike(s),
            Order.walkin_store.ilike(s),
            Order.client_id.in_(client_ids_sub),
            Order.id.in_(addr_order_ids_sub),
        ]
        if search.lstrip('#').isdigit():
            conditions.append(Order.id == int(search.lstrip('#')))
        query = query.where(or_(*conditions))
    if today_only:
        from datetime import timedelta
        TASHKENT = timezone(timedelta(hours=5))
        today = datetime.now(TASHKENT).date()
        today_start = datetime(today.year, today.month, today.day, tzinfo=TASHKENT)
        today_end = datetime(today.year, today.month, today.day, 23, 59, 59, tzinfo=TASHKENT)
        query = query.where(Order.created_at >= today_start, Order.created_at <= today_end)
    if date_from:
        query = query.where(Order.created_at >= datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc))
    if date_to:
        query = query.where(Order.created_at <= datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=timezone.utc))

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    unassigned_first = case(
        (Order.status.in_([OrderStatus.YANGI, OrderStatus.QABUL_QILINDI]), 0),
        else_=1,
    )
    query = query.order_by(unassigned_first, Order.created_at.desc()).offset((page - 1) * per_page).limit(per_page).options(
        selectinload(Order.items).selectinload(OrderItem.product),
        selectinload(Order.address),
        selectinload(Order.client),
        selectinload(Order.courier).selectinload(Courier.user),
    )
    result = await db.execute(query)
    orders = result.scalars().all()

    def _enrich_list_order(o: Order) -> dict:
        d = OrderResponse.model_validate(o).model_dump()
        if o.address:
            d["address_text"] = o.address.address_text
        if not d.get("address_text") and o.walkin_address:
            d["address_text"] = o.walkin_address
        if o.client:
            d["client_phone"] = o.client.phone
            d["client_debt"] = o.client.debt_amount
        d["client_name"] = d.get("address_text") or d.get("client_phone") or d.get("walkin_phone") or "—"
        if o.courier and o.courier.user:
            d["courier_name"] = f"{o.courier.user.first_name} {o.courier.user.last_name or ''}".strip()
        # Enrich items with product names
        enriched_items = []
        for item in o.items:
            item_d = {
                "id": str(item.id),
                "product_id": str(item.product_id),
                "product_name": item.product.name if item.product else None,
                "quantity": item.quantity,
                "price_at_order": item.price_at_order,
                "total": item.total,
            }
            enriched_items.append(item_d)
        d["items"] = enriched_items
        return d

    return {
        "items": [_enrich_list_order(o) for o in orders],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    }


@router.get("/my")
async def get_my_orders(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Client's own order history."""
    from app.models.client import Client
    client_result = await db.execute(select(Client).where(Client.user_id == user.id, Client.tenant_id == user.tenant_id))
    client = client_result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    result = await db.execute(
        select(Order).where(
            Order.client_id == client.id,
            Order.tenant_id == user.tenant_id,
        ).order_by(Order.created_at.desc()).limit(50)
    )
    orders = result.scalars().all()
    return [await _enrich_order(o, db) for o in orders]


@router.get("/courier/active")
async def get_courier_active_orders(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Courier's active orders (tayinlandi + yolda) with today's stats."""
    courier_result = await db.execute(select(Courier).where(Courier.user_id == user.id))
    courier = courier_result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")

    active_result = await db.execute(
        select(Order).where(
            Order.courier_id == courier.id,
            Order.status.in_([OrderStatus.TAYINLANDI, OrderStatus.YOLDA]),
            Order.is_deleted == False,
        ).order_by(Order.created_at)
    )
    active_orders = active_result.scalars().all()
    enriched_orders = [await _enrich_order(o, db) for o in active_orders]

    _TASHKENT = timezone(timedelta(hours=5))
    _today = datetime.now(_TASHKENT).date()
    today_start_dt = datetime(_today.year, _today.month, _today.day, tzinfo=_TASHKENT)
    today_end_dt = datetime(_today.year, _today.month, _today.day, 23, 59, 59, tzinfo=_TASHKENT)

    today_result = await db.execute(
        select(func.count()).where(
            Order.courier_id == courier.id,
            Order.created_at >= today_start_dt,
            Order.created_at <= today_end_dt,
        )
    )
    today_total = today_result.scalar_one() or 0

    delivered_result = await db.execute(
        select(func.count()).where(
            Order.courier_id == courier.id,
            Order.status == OrderStatus.YETKAZILDI,
            Order.delivered_at >= today_start_dt,
            Order.delivered_at <= today_end_dt,
        )
    )
    today_delivered = delivered_result.scalar_one() or 0

    return {
        "orders": enriched_orders,
        "today_total": today_total,
        "today_delivered": today_delivered,
    }


@router.get("/courier/history")
async def get_courier_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Courier's completed orders."""
    courier_result = await db.execute(select(Courier).where(Courier.user_id == user.id))
    courier = courier_result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")

    result = await db.execute(
        select(Order).where(
            Order.courier_id == courier.id,
            Order.status.in_([OrderStatus.YETKAZILDI, OrderStatus.YOPILDI]),
        ).order_by(Order.created_at.desc()).limit(100)
    )
    orders = result.scalars().all()
    return [await _enrich_order(o, db) for o in orders]


@router.get("/courier/walkin-history")
async def get_courier_walkin_history(
    user: User = Depends(require_courier),
    db: AsyncSession = Depends(get_db),
):
    """Courier's walkin (quick sale) order history."""
    courier_result = await db.execute(select(Courier).where(Courier.user_id == user.id))
    courier = courier_result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")

    result = await db.execute(
        select(Order).where(
            Order.courier_id == courier.id,
            Order.is_walkin == True,
        ).order_by(Order.created_at.desc()).limit(50)
    )
    orders = result.scalars().all()

    # Batch-load clients
    client_ids = [o.client_id for o in orders if o.client_id]
    clients_map: dict = {}
    if client_ids:
        clients_r = await db.execute(select(Client).where(Client.id.in_(client_ids)))
        clients_map = {c.id: c for c in clients_r.scalars().all()}

    enriched = []
    for order in orders:
        items_r = await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))
        items = items_r.scalars().all()
        items_list = []
        for item in items:
            prod_r = await db.execute(select(Product).where(Product.id == item.product_id))
            prod = prod_r.scalar_one_or_none()
            items_list.append({
                "product_name": prod.name if prod else None,
                "quantity": item.quantity,
                "price_at_order": item.price_at_order,
                "total": item.total,
            })
        client = clients_map.get(order.client_id) if order.client_id else None
        _addr = order.walkin_address or (client.phone if client else None)
        enriched.append({
            "id": order.id,
            "client_id": str(order.client_id) if order.client_id else None,
            "client_name": _addr,
            "client_phone": client.phone if client else None,
            "walkin_phone": order.walkin_phone,
            "walkin_address": order.walkin_address,
            "walkin_store": order.walkin_store,
            "total_amount": order.total_amount,
            "discount_amount": order.discount_amount,
            "debt_amount": order.debt_amount,
            "comment": order.comment,
            "payment_method": order.payment_method,
            "cash_amount": order.cash_amount,
            "card_amount": order.card_amount,
            "payme_amount": order.payme_amount,
            "created_at": order.created_at.isoformat(),
            "items": items_list,
        })
    return enriched


@router.post("/walkin", status_code=201)
@limiter.limit("60/minute")
async def create_walkin_order(
    request: Request,
    data: OrderCreate,
    user: User = Depends(require_courier),
    db: AsyncSession = Depends(get_db),
):
    """Courier creates and immediately completes a walkin (quick) sale."""
    from app.models.finance import Debt

    # ── 1. Get courier ────────────────────────────────────────────────────
    courier_result = await db.execute(select(Courier).where(Courier.user_id == user.id))
    courier = courier_result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")

    # ── 2. Validate products ──────────────────────────────────────────────
    total = 0
    items_data = []
    for item in data.items:
        result = await db.execute(
            select(Product).where(
                Product.id == item.product_id,
                Product.tenant_id == user.tenant_id,
                Product.is_active == True,
            )
        )
        product = result.scalar_one_or_none()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
        item_total = product.price * item.quantity
        total += item_total
        items_data.append({"product": product, "quantity": item.quantity, "price": product.price, "total": item_total})

    # ── 3. Resolve client ─────────────────────────────────────────────────
    client = None

    if data.client_id:
        # Eski mijoz — verify exists, not blocked, same tenant
        client_r = await db.execute(
            select(Client).where(
                Client.id == data.client_id,
                Client.tenant_id == user.tenant_id,
                Client.is_deleted == False,
            )
        )
        client = client_r.scalar_one_or_none()
        if not client:
            raise HTTPException(status_code=404, detail="Mijoz topilmadi")
        if client.is_blocked:
            raise HTTPException(status_code=400, detail="Bu mijoz bloklangan, sotuv amalga oshirib bo'lmaydi")
    else:
        # Yangi mijoz — phone required
        if not data.walkin_phone or not data.walkin_phone.strip():
            raise HTTPException(status_code=400, detail="Telefon raqam kiritilishi shart")
        # Check phone uniqueness within this tenant
        phone_check = await db.execute(
            select(Client).where(
                Client.phone == data.walkin_phone.strip(),
                Client.tenant_id == user.tenant_id,
                Client.is_deleted == False,
            )
        )
        existing_by_phone = phone_check.scalar_one_or_none()
        if existing_by_phone:
            # fetch primary address for display
            ep_addr_r = await db.execute(
                select(ClientAddress.address_text)
                .where(ClientAddress.client_id == existing_by_phone.id, ClientAddress.is_primary == True)
                .limit(1)
            )
            ep_addr = ep_addr_r.scalar_one_or_none()
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "PHONE_EXISTS",
                    "client": {
                        "id": str(existing_by_phone.id),
                        "name": ep_addr or existing_by_phone.phone,
                        "phone": existing_by_phone.phone,
                        "debt_amount": existing_by_phone.debt_amount,
                    },
                },
            )

        # Create new client — use address as display identifier (first_name='-')
        # Auto-assign to "Ako 5, 10L" group and store company name
        AKO_5_10L_GROUP_NAME = "Ako 5, 10L"
        group_result = await db.execute(
            select(ClientGroup).where(
                ClientGroup.tenant_id == user.tenant_id,
                ClientGroup.name == AKO_5_10L_GROUP_NAME,
            ).limit(1)
        )
        ako_group = group_result.scalar_one_or_none()

        client = Client(
            tenant_id=user.tenant_id,
            first_name='-',
            last_name=None,
            phone=data.walkin_phone.strip(),
            is_active=True,
            is_blocked=False,
            company_name=data.walkin_company_name.strip() if data.walkin_company_name else None,
            group_id=ako_group.id if ako_group else None,
        )
        db.add(client)
        await db.flush()  # get client.id

        # Save address as primary ClientAddress if provided
        if data.walkin_address and data.walkin_address.strip():
            db.add(ClientAddress(
                tenant_id=user.tenant_id,
                client_id=client.id,
                address_text=data.walkin_address.strip(),
                label="Asosiy",
                is_primary=True,
            ))

    # ── 4. Validate discount & payment amounts ────────────────────────────
    discount = max(0, min(data.discount_amount, total))
    payable = total - discount

    cash_amt = data.walkin_cash_amount or 0
    card_amt = data.walkin_card_amount or 0
    payme_amt = data.walkin_payme_amount or 0
    debt_amt = data.walkin_debt_amount or 0

    any_specified = (
        data.walkin_cash_amount is not None
        or data.walkin_card_amount is not None
        or data.walkin_payme_amount is not None
        or data.walkin_debt_amount is not None
    )

    if any_specified:
        if cash_amt + card_amt + payme_amt + debt_amt != payable:
            raise HTTPException(
                status_code=400,
                detail=f"Naqd + karta + payme + qarz ({cash_amt + card_amt + payme_amt + debt_amt}) to'lov summasi ({payable}) ga teng emas",
            )
    else:
        # Default: full cash, no debt
        cash_amt = payable
        card_amt = 0
        payme_amt = 0
        debt_amt = 0

    # ── 5. Determine payment method & status ──────────────────────────────
    paid_methods = sum([cash_amt > 0, card_amt > 0, payme_amt > 0])
    if debt_amt > 0 and paid_methods == 0:
        pay_method = PaymentMethod.QARZ
        pay_status = PaymentStatus.TOLANMAGAN
    elif debt_amt > 0:
        pay_method = PaymentMethod.NAQD
        pay_status = PaymentStatus.QISMAN
    elif paid_methods > 1:
        pay_method = PaymentMethod.NAQD  # mixed
        pay_status = PaymentStatus.TOLANGAN
    elif card_amt > 0:
        pay_method = PaymentMethod.KARTA
        pay_status = PaymentStatus.TOLANGAN
    elif payme_amt > 0:
        pay_method = PaymentMethod.PAYME
        pay_status = PaymentStatus.TOLANGAN
    else:
        pay_method = PaymentMethod.NAQD
        pay_status = PaymentStatus.TOLANGAN

    # ── 6. Create order ───────────────────────────────────────────────────
    order = Order(
        tenant_id=user.tenant_id,
        client_id=client.id,
        address_id=None,
        courier_id=courier.id,
        status=OrderStatus.YOLDA,
        total_amount=total,
        is_walkin=True,
        walkin_phone=data.walkin_phone,
        walkin_address=data.walkin_address,
        walkin_store=data.walkin_store,
        comment=data.comment,
    )
    db.add(order)
    await db.flush()

    for item_d in items_data:
        db.add(OrderItem(
            order_id=order.id,
            product_id=item_d["product"].id,
            tenant_id=user.tenant_id,
            quantity=item_d["quantity"],
            delivered_quantity=item_d["quantity"],
            price_at_order=item_d["price"],
            total=item_d["total"],
        ))

    await _record_status(db, order.id, user.tenant_id, OrderStatus.YOLDA, user.id)
    await db.flush()

    # ── 7. Deduct from courier inventory ──────────────────────────────────
    for item_d in items_data:
        courier_inv_result = await db.execute(
            select(CourierInventory).where(
                CourierInventory.courier_id == courier.id,
                CourierInventory.product_id == item_d["product"].id,
            ).with_for_update()
        )
        courier_inv = courier_inv_result.scalar_one_or_none()
        if not courier_inv or courier_inv.quantity < item_d["quantity"]:
            available = courier_inv.quantity if courier_inv else 0
            raise HTTPException(
                status_code=400,
                detail=f"Kuryer inventarida yetarli '{item_d['product'].name}' yo'q. Mavjud: {available}, kerak: {item_d['quantity']}",
            )
        courier_inv.quantity -= item_d["quantity"]
        if courier_inv.quantity == 0:
            await db.delete(courier_inv)

    # ── 8. Complete order ─────────────────────────────────────────────────
    order.status = OrderStatus.YETKAZILDI
    order.delivered_at = datetime.now(timezone.utc)
    order.discount_amount = discount
    order.paid_amount = cash_amt + card_amt + payme_amt
    order.cash_amount = cash_amt
    order.card_amount = card_amt
    order.payme_amount = payme_amt
    order.debt_amount = debt_amt
    order.payment_status = pay_status
    order.payment_method = pay_method

    # ── 9. Handle returnable containers ──────────────────────────────────
    from app.models.finance import ContainerTransaction, ContainerClientBalance
    from app.models.warehouse import WarehouseItem, WarehouseStock, WarehouseTransaction, WarehouseTransactionType

    walkin_containers_returned = data.walkin_containers_returned or 0

    returnable_delivered = (await db.execute(
        select(func.coalesce(func.sum(OrderItem.delivered_quantity), 0))
        .join(Product, Product.id == OrderItem.product_id)
        .where(OrderItem.order_id == order.id, Product.is_returnable_container == True)
    )).scalar_one()

    if walkin_containers_returned > 0 and returnable_delivered == 0:
        raise HTTPException(status_code=400, detail="Qaytariladigan idishsiz sotuvda pust tara qaytarib bo'lmaydi")

    if returnable_delivered > 0 or walkin_containers_returned > 0:
        cb_result = await db.execute(
            select(ContainerClientBalance).where(ContainerClientBalance.client_id == client.id).with_for_update()
        )
        cb = cb_result.scalar_one_or_none()
        if not cb:
            seed = client.container_balance if client else 0
            cb = ContainerClientBalance(tenant_id=user.tenant_id, client_id=client.id, balance=seed)
            db.add(cb)
            await db.flush()

        # Bug fix: prevent negative container balance
        max_returnable = returnable_delivered + cb.balance
        if walkin_containers_returned > max_returnable:
            raise HTTPException(
                status_code=400,
                detail=f"Qaytarilgan tara ({walkin_containers_returned} ta) ko'p: yetkaziladi {returnable_delivered} ta + balans {cb.balance} ta",
            )

        old_balance = cb.balance
        cb.balance = cb.balance + returnable_delivered - walkin_containers_returned
        order.containers_delivered = returnable_delivered
        order.containers_returned = walkin_containers_returned

        client_locked_r = await db.execute(select(Client).where(Client.id == client.id).with_for_update())
        client_locked = client_locked_r.scalar_one_or_none()
        if client_locked:
            client_locked.container_balance = cb.balance

        if returnable_delivered > 0:
            db.add(ContainerTransaction(
                tenant_id=user.tenant_id, client_id=client.id, order_id=order.id,
                transaction_type="delivered", quantity=returnable_delivered,
                balance_before=old_balance, balance_after=old_balance + returnable_delivered,
            ))
        if walkin_containers_returned > 0:
            db.add(ContainerTransaction(
                tenant_id=user.tenant_id, client_id=client.id, order_id=order.id,
                transaction_type="returned", quantity=walkin_containers_returned,
                balance_before=old_balance + returnable_delivered,
                balance_after=cb.balance,
            ))

        # Return empty containers to warehouse
        returnable_product = next((d["product"] for d in items_data if d["product"].is_returnable_container), None)
        if walkin_containers_returned > 0 and returnable_product:
            wi_result = await db.execute(
                select(WarehouseItem).where(
                    WarehouseItem.product_id == returnable_product.id,
                    WarehouseItem.tenant_id == user.tenant_id,
                ).with_for_update()
            )
            wi = wi_result.scalar_one_or_none()
            # Bug fix: auto-create WarehouseItem+Stock if missing so containers aren't silently lost
            if wi is None:
                wi = WarehouseItem(
                    tenant_id=user.tenant_id,
                    product_id=returnable_product.id,
                    name=returnable_product.name,
                    unit="ta",
                    is_container=True,
                )
                db.add(wi)
                await db.flush()
                db.add(WarehouseStock(tenant_id=user.tenant_id, item_id=wi.id, quantity=0, empty_quantity=0))
                await db.flush()

            ws_result = await db.execute(
                select(WarehouseStock).where(WarehouseStock.item_id == wi.id).with_for_update()
            )
            ws = ws_result.scalar_one_or_none()
            if ws:
                empty_before = ws.empty_quantity
                ws.empty_quantity += walkin_containers_returned
                db.add(WarehouseTransaction(
                    tenant_id=user.tenant_id,
                    item_id=wi.id,
                    order_id=order.id,
                    transaction_type=WarehouseTransactionType.KIRIM,
                    quantity=walkin_containers_returned,
                    balance_before=empty_before,
                    balance_after=ws.empty_quantity,
                    note=f"Tez sotuv #{order.id} - mijoz pust tara qaytardi",
                ))

    # ── 10. Handle debt — apply client advance first ──────────────────────
    if debt_amt > 0:
        from app.models.finance import DebtTransaction, DebtTransactionType
        client_upd = await db.execute(
            select(Client).where(Client.id == client.id).with_for_update()
        )
        client_locked = client_upd.scalar_one_or_none()
        if client_locked and client_locked.advance_amount > 0:
            advance_apply = min(client_locked.advance_amount, debt_amt)
            client_locked.advance_amount -= advance_apply
            debt_amt -= advance_apply
            order.advance_used = advance_apply
            order.paid_amount += advance_apply
            order.debt_amount = debt_amt
            if debt_amt == 0:
                order.payment_status = PaymentStatus.TOLANGAN
                if order.payment_method == PaymentMethod.QARZ:
                    order.payment_method = PaymentMethod.NAQD
            else:
                order.payment_status = PaymentStatus.QISMAN
            db.add(DebtTransaction(
                tenant_id=user.tenant_id,
                client_id=client.id,
                order_id=order.id,
                transaction_type=DebtTransactionType.ADVANCE_USED,
                amount=-advance_apply,
                description=f"Avans ishlatildi — tez sotuv #{order.id}",
            ))
        if debt_amt > 0:
            if client_locked:
                client_locked.debt_amount += debt_amt
            db.add(Debt(
                tenant_id=user.tenant_id,
                client_id=client.id,
                order_id=order.id,
                original_amount=debt_amt,
                remaining_amount=debt_amt,
                is_paid=False,
            ))

    # ── 11. Update courier balances ───────────────────────────────────────
    courier_upd_result = await db.execute(
        select(Courier).where(Courier.id == courier.id).with_for_update()
    )
    courier_upd = courier_upd_result.scalar_one_or_none()
    if courier_upd:
        if cash_amt > 0:
            courier_upd.cash_balance += cash_amt
        if card_amt > 0:
            courier_upd.card_balance += card_amt
        if payme_amt > 0:
            courier_upd.payme_balance += payme_amt
        if returnable_delivered > 0:
            courier_upd.full_containers = max(0, courier_upd.full_containers - returnable_delivered)
        if walkin_containers_returned > 0:
            courier_upd.empty_containers += walkin_containers_returned

    await _record_status(db, order.id, user.tenant_id, OrderStatus.YETKAZILDI, user.id, "Tez sotuv - avtomatik yakunlandi")
    await db.flush()

    return {
        "id": order.id,
        "total_amount": order.total_amount,
        "debt_amount": debt_amt,
        "client_id": str(client.id),
        "client_name": order.walkin_address or order.walkin_store or client.phone,
        "message": "Tez sotuv muvaffaqiyatli amalga oshirildi!",
    }


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(order_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order).where(Order.id == order_id, Order.tenant_id == user.tenant_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


# ── Assign courier ────────────────────────────────────────────────────────

@router.post("/{order_id}/assign", response_model=StatusChangeResponse)
async def assign_courier(
    order_id: int,
    data: AssignCourierRequest,
    user: User = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
):
    """Assign courier to order with SELECT FOR UPDATE to prevent double-assignment."""
    # Lock the row
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id, Order.tenant_id == user.tenant_id)
        .with_for_update()
    )
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.courier_id is not None and order.status == OrderStatus.TAYINLANDI:
        raise HTTPException(status_code=409, detail="Allaqachon tayinlangan")

    if order.status not in [OrderStatus.YANGI, OrderStatus.QABUL_QILINDI]:
        raise HTTPException(status_code=400, detail=f"Cannot assign courier to order with status {order.status}")

    # Verify courier belongs to tenant
    courier_result = await db.execute(
        select(Courier).where(Courier.id == data.courier_id, Courier.tenant_id == user.tenant_id)
    )
    courier = courier_result.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")

    order.courier_id = data.courier_id
    order.status = OrderStatus.TAYINLANDI

    await _record_status(db, order.id, user.tenant_id, OrderStatus.TAYINLANDI, user.id)
    push_token = await _get_client_push_token(order, db)
    await db.flush()
    await send_order_push(push_token, order_id, "tayinlandi")

    return StatusChangeResponse(order_id=order_id, status=OrderStatus.TAYINLANDI, message="Yetkazib beruvchi tayinlandi")


# ── Status transitions ────────────────────────────────────────────────────

@router.patch("/{order_id}/status")
async def change_status(
    order_id: int,
    new_status: str = Query(...),
    note: Optional[str] = Query(None),
    user: User = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.tenant_id == user.tenant_id).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    try:
        status_enum = OrderStatus(new_status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}")

    order.status = status_enum
    push_token = None
    if status_enum == OrderStatus.YOLDA:
        push_token = await _get_client_push_token(order, db)

    await _record_status(db, order.id, user.tenant_id, status_enum, user.id, note)
    await db.flush()
    if push_token:
        await send_order_push(push_token, order_id, "yolda")
    return {"order_id": order_id, "status": new_status}


# ── Complete delivery ─────────────────────────────────────────────────────

@router.post("/{order_id}/complete", response_model=StatusChangeResponse)
@limiter.limit("60/minute")
async def complete_order(
    request: Request,
    order_id: int,
    data: CompleteOrderRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Courier completes delivery: set payment, containers, update debts."""
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.tenant_id == user.tenant_id)
        .with_for_update()
        .options(selectinload(Order.items).selectinload(OrderItem.product))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status not in [OrderStatus.TAYINLANDI, OrderStatus.YOLDA]:
        raise HTTPException(status_code=400, detail="Order cannot be completed in current status")

    order.status = OrderStatus.YETKAZILDI
    order.containers_returned = data.containers_returned
    order.delivered_at = datetime.now(timezone.utc)

    # ── Update delivered quantities and recalculate total ──────────────
    if data.delivered_quantities:
        # Create a mapping of product_id to delivered_quantity
        delivered_map = {dq.product_id: dq.delivered_quantity for dq in data.delivered_quantities}

        new_total = 0
        for item in order.items:
            if item.product_id in delivered_map:
                delivered_qty = delivered_map[item.product_id]
                item.delivered_quantity = delivered_qty
                item.total = delivered_qty * item.price_at_order
            else:
                # Item not mentioned in partial delivery → treat as not delivered
                item.delivered_quantity = 0
                item.total = 0
            new_total += item.total

        # Update order total amount
        order.total_amount = new_total

    # ── Apply discount ────────────────────────────────────────────────
    discount = max(0, min(data.discount_amount, order.total_amount))
    order.discount_amount = discount
    payable_amount = order.total_amount - discount  # what client actually needs to pay

    # ── Load client early for advance logic ──────────────────────────
    _client: "Client | None" = None
    if order.client_id:
        _cr = await db.execute(select(Client).where(Client.id == order.client_id).with_for_update())
        _client = _cr.scalar_one_or_none()

    # ── Apply client advance ─────────────────────────────────────────
    advance_used = 0
    if _client and _client.advance_amount > 0 and not order.is_walkin:
        advance_used = min(_client.advance_amount, payable_amount)
        _client.advance_amount -= advance_used

    order.advance_used = advance_used
    payable_after_advance = payable_amount - advance_used  # what client must pay in cash/card/payme

    # ── Split payment logic ──────────────────────────────────────────
    if data.cash_amount > 0 or data.card_amount > 0 or data.payme_amount > 0:
        order.cash_amount = data.cash_amount
        order.card_amount = data.card_amount
        order.payme_amount = data.payme_amount
        effective_paid = data.cash_amount + data.card_amount + data.payme_amount
    else:
        # Legacy: use paid_amount directly
        effective_paid = data.paid_amount if data.payment_type in ('paid', 'partial') else 0
        order.cash_amount = effective_paid if data.payment_method != 'KARTA' else 0
        order.card_amount = effective_paid if data.payment_method == 'KARTA' else 0
        order.payme_amount = 0
        if data.payment_type == 'unpaid':
            effective_paid = 0

    order.paid_amount = effective_paid + advance_used  # total covered = physical + advance

    # Determine primary payment method
    methods_used = sum([order.cash_amount > 0, order.card_amount > 0, order.payme_amount > 0])
    if methods_used > 1:
        order.payment_method = PaymentMethod.NAQD  # mixed — default to cash
    elif order.card_amount > 0:
        order.payment_method = PaymentMethod.KARTA
    elif order.payme_amount > 0:
        order.payment_method = PaymentMethod.PAYME
    elif order.cash_amount > 0:
        order.payment_method = PaymentMethod.NAQD
    elif advance_used > 0:
        order.payment_method = PaymentMethod.NAQD  # paid fully by advance
    elif effective_paid == 0:
        order.payment_method = PaymentMethod.QARZ
    else:
        order.payment_method = PaymentMethod.NAQD

    # ── Determine debt/overpayment against payable_after_advance ────
    if effective_paid >= payable_after_advance:
        order.payment_status = PaymentStatus.TOLANGAN
        overpayment = effective_paid - payable_after_advance
        order.debt_amount = 0
        if overpayment > 0 and _client:
            _client.advance_amount += overpayment
    elif effective_paid > 0:
        order.payment_status = PaymentStatus.QISMAN
        order.debt_amount = payable_after_advance - effective_paid
    else:
        order.payment_status = PaymentStatus.TOLANMAGAN if payable_after_advance > 0 else PaymentStatus.TOLANGAN
        order.debt_amount = payable_after_advance

    from app.models.finance import Debt, DebtTransaction, DebtTransactionType

    # ── Record advance usage transaction ─────────────────────────────
    if advance_used > 0 and _client:
        db.add(DebtTransaction(
            tenant_id=order.tenant_id,
            client_id=order.client_id,
            order_id=order.id,
            transaction_type=DebtTransactionType.ADVANCE_USED,
            amount=-advance_used,
            description=f"Avans ishlatildi — buyurtma #{order.id}",
        ))

    # ── Update client debt ───────────────────────────────────────────
    if order.debt_amount > 0 and _client:
        _client.debt_amount += order.debt_amount
        debt = Debt(
            tenant_id=order.tenant_id,
            client_id=order.client_id,
            order_id=order.id,
            original_amount=order.debt_amount,
            remaining_amount=order.debt_amount,
        )
        db.add(debt)

    # Update container client balance (18.9L returnable only)
    # Count via DB query after flush to avoid stale in-memory product relationships
    await db.flush()
    from app.models.product import Product as _Product
    returnable_delivered = (await db.execute(
        select(func.coalesce(func.sum(OrderItem.delivered_quantity), 0))
        .join(_Product, _Product.id == OrderItem.product_id)
        .where(OrderItem.order_id == order.id, _Product.is_returnable_container == True)
    )).scalar_one()
    if (returnable_delivered > 0 or data.containers_returned > 0) and order.client_id:
        from app.models.finance import ContainerTransaction, ContainerClientBalance
        from sqlalchemy import select as sa_select

        client = _client  # already loaded above

        cb_result = await db.execute(
            sa_select(ContainerClientBalance).where(ContainerClientBalance.client_id == order.client_id)
        )
        cb = cb_result.scalar_one_or_none()
        if not cb:
            # Seed from client.container_balance (e.g. set during Excel import)
            seed = client.container_balance if client else 0
            cb = ContainerClientBalance(tenant_id=order.tenant_id, client_id=order.client_id, balance=seed)
            db.add(cb)
            await db.flush()

        # Bug fix: prevent negative container balance
        max_returnable = returnable_delivered + cb.balance
        if data.containers_returned > max_returnable:
            raise HTTPException(
                status_code=400,
                detail=f"Qaytarilgan tara ({data.containers_returned} ta) ko'p: yetkaziladi {returnable_delivered} ta + balans {cb.balance} ta",
            )

        old_balance = cb.balance
        cb.balance = cb.balance + returnable_delivered - data.containers_returned
        order.containers_delivered = returnable_delivered

        if client:
            client.container_balance = cb.balance

        if returnable_delivered > 0:
            db.add(ContainerTransaction(
                tenant_id=order.tenant_id, client_id=order.client_id, order_id=order.id,
                transaction_type="delivered", quantity=returnable_delivered,
                balance_before=old_balance, balance_after=old_balance + returnable_delivered,
            ))
        if data.containers_returned > 0:
            db.add(ContainerTransaction(
                tenant_id=order.tenant_id, client_id=order.client_id, order_id=order.id,
                transaction_type="returned", quantity=data.containers_returned,
                balance_before=old_balance + returnable_delivered,
                balance_after=cb.balance,
            ))

    # Deduct products from courier inventory when order is delivered
    if order.courier_id:
        for item in order.items:
            if not item.product_id:
                continue

            # Find courier inventory for this product
            courier_inv_result = await db.execute(
                select(CourierInventory).where(
                    CourierInventory.courier_id == order.courier_id,
                    CourierInventory.product_id == item.product_id
                ).with_for_update()
            )
            courier_inv = courier_inv_result.scalar_one_or_none()

            if courier_inv:
                # Use delivered_quantity instead of ordered quantity
                delivered_qty = item.delivered_quantity
                if courier_inv.quantity < delivered_qty:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Kuryer inventarida yetarli mahsulot yo'q. Mavjud: {courier_inv.quantity}, kerak: {delivered_qty}"
                    )
                courier_inv.quantity -= delivered_qty
                # Delete if quantity reaches 0
                if courier_inv.quantity == 0:
                    await db.delete(courier_inv)
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Kuryer inventarida bu mahsulot topilmadi"
                )

    # Return empty containers to warehouse when client returns them
    if data.containers_returned > 0:
        # Find which returnable product was delivered
        for item in order.items:
            if not item.product_id:
                continue
            prod_result = await db.execute(
                select(Product).where(Product.id == item.product_id, Product.tenant_id == order.tenant_id)
            )
            product = prod_result.scalar_one_or_none()

            # If this product is returnable, add empty containers back to its empty_quantity
            if product and product.is_returnable_container:
                wi_result = await db.execute(
                    select(WarehouseItem).where(
                        WarehouseItem.product_id == product.id,
                        WarehouseItem.tenant_id == order.tenant_id,
                    ).with_for_update()
                )
                wi = wi_result.scalar_one_or_none()

                # Bug fix: auto-create WarehouseItem+Stock if missing so containers aren't silently lost
                if wi is None:
                    wi = WarehouseItem(
                        tenant_id=order.tenant_id,
                        product_id=product.id,
                        name=product.name,
                        unit="ta",
                        is_container=True,
                    )
                    db.add(wi)
                    await db.flush()
                    db.add(WarehouseStock(tenant_id=order.tenant_id, item_id=wi.id, quantity=0, empty_quantity=0))
                    await db.flush()

                ws_result = await db.execute(
                    select(WarehouseStock).where(WarehouseStock.item_id == wi.id).with_for_update()
                )
                ws = ws_result.scalar_one_or_none()

                if ws:
                    empty_before = ws.empty_quantity
                    ws.empty_quantity += data.containers_returned
                    db.add(WarehouseTransaction(
                        tenant_id=order.tenant_id,
                        item_id=wi.id,
                        order_id=order.id,
                        transaction_type=WarehouseTransactionType.KIRIM,
                        quantity=data.containers_returned,
                        balance_before=empty_before,
                        balance_after=ws.empty_quantity,
                        note=f"Buyurtma #{order.id} - mijoz pust tara qaytardi",
                    ))
                break  # Only process first returnable product

    # Update courier balances when order is delivered
    if order.courier_id and order.paid_amount > 0:
        from app.models.courier import Courier
        courier_result = await db.execute(
            select(Courier).where(Courier.id == order.courier_id).with_for_update()
        )
        courier = courier_result.scalar_one_or_none()
        if courier:
            # Add money to courier balance based on split amounts
            if order.cash_amount > 0:
                courier.cash_balance += order.cash_amount
            if order.card_amount > 0:
                courier.card_balance += order.card_amount
            if order.payme_amount > 0:
                courier.payme_balance += order.payme_amount

            # Update courier container balances
            # Deduct delivered full containers from courier
            if returnable_delivered > 0:
                courier.full_containers = max(0, courier.full_containers - returnable_delivered)
            # Add returned empty containers to courier
            if data.containers_returned > 0:
                courier.empty_containers += data.containers_returned

    push_token = await _get_client_push_token(order, db)
    await _record_status(db, order.id, user.tenant_id, OrderStatus.YETKAZILDI, user.id, data.note)
    await db.flush()
    await send_order_push(push_token, order_id, "yetkazildi")

    return StatusChangeResponse(order_id=order_id, status=OrderStatus.YETKAZILDI, message="Buyurtma muvaffaqiyatli yetkazildi!")


# ── Problem ───────────────────────────────────────────────────────────────

@router.post("/{order_id}/problem", response_model=StatusChangeResponse)
async def report_problem(
    order_id: int,
    data: ProblemRequest,
    user: User = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.tenant_id == user.tenant_id).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order.status = OrderStatus.MUAMMO
    order.problem_reason = data.reason
    await _record_status(db, order.id, user.tenant_id, OrderStatus.MUAMMO, user.id, data.reason)
    await db.flush()

    return StatusChangeResponse(order_id=order_id, status=OrderStatus.MUAMMO, message="Muammo qayd etildi. Operator xabardor qilindi.")


# ── Cancel ────────────────────────────────────────────────────────────────

@router.post("/{order_id}/cancel", response_model=StatusChangeResponse)
async def cancel_order(
    order_id: int,
    data: CancelRequest,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.tenant_id == user.tenant_id).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status in [OrderStatus.YETKAZILDI, OrderStatus.YOPILDI]:
        raise HTTPException(status_code=400, detail="Cannot cancel completed order")

    order.status = OrderStatus.BEKOR_QILINDI
    order.cancel_reason = data.reason
    push_token = await _get_client_push_token(order, db)
    await _record_status(db, order.id, user.tenant_id, OrderStatus.BEKOR_QILINDI, user.id, data.reason)
    await db.flush()
    await send_order_push(push_token, order_id, "bekor_qilindi")

    return StatusChangeResponse(order_id=order_id, status=OrderStatus.BEKOR_QILINDI, message="Buyurtma bekor qilindi")


# ── Helper: determine money location ─────────────────────────────────────────

async def _get_money_location(order: Order, db: AsyncSession) -> str:
    """
    Returns where the paid money currently resides:
    - "courier"  : in courier's active shift balance
    - "kassa"    : shift was closed, money deposited to kassa
    - "none"     : no money was collected (debt/unpaid/not delivered)
    """
    physical_paid = order.cash_amount + order.card_amount + order.payme_amount
    if physical_paid == 0 or order.status != OrderStatus.YETKAZILDI:
        return "none"
    if not order.courier_id:
        return "none"
    courier_r = await db.execute(select(Courier).where(Courier.id == order.courier_id))
    courier = courier_r.scalar_one_or_none()
    if not courier:
        return "kassa"
    from app.models.courier import ShiftStatus
    if (courier.shift_status == ShiftStatus.OPEN
            and courier.shift_started_at
            and order.delivered_at
            and order.delivered_at >= courier.shift_started_at):
        return "courier"
    return "kassa"


async def _build_delete_preview(order: Order, db: AsyncSession) -> dict:
    """Build human-readable preview of what will change on delete."""
    loc = await _get_money_location(order, db)
    physical_paid = order.cash_amount + order.card_amount + order.payme_amount
    advance_used = getattr(order, 'advance_used', 0)
    changes = []
    if physical_paid > 0:
        if loc == "courier":
            changes.append({"type": "courier_balance", "delta": -physical_paid,
                            "label": f"Kuryer balansi −{physical_paid:,} so'm"})
        elif loc == "kassa":
            changes.append({"type": "kassa", "delta": -physical_paid,
                            "label": f"Kassa −{physical_paid:,} so'm"})
    if advance_used > 0:
        changes.append({"type": "advance_restore", "delta": advance_used,
                        "label": f"Mijoz avansiga qaytariladi +{advance_used:,} so'm"})
    if order.debt_amount > 0:
        changes.append({"type": "client_debt", "delta": -order.debt_amount,
                        "label": f"Mijoz qarzi −{order.debt_amount:,} so'm"})
    payable = order.total_amount - order.discount_amount
    changes.append({"type": "order", "label": f"Buyurtma #{order.id} o'chiriladi (summa {payable:,} so'm)"})
    return {"order_id": order.id, "money_location": loc, "changes": changes}


async def _reverse_order_money(order: Order, db: AsyncSession, changed_by_id) -> None:
    """Reverse all financial effects of a delivered order."""
    from datetime import datetime, timezone
    loc = await _get_money_location(order, db)
    physical_paid = order.cash_amount + order.card_amount + order.payme_amount
    advance_used = getattr(order, 'advance_used', 0)

    # 1. Reverse courier balance if money is still there
    if loc == "courier" and order.courier_id:
        courier_r = await db.execute(select(Courier).where(Courier.id == order.courier_id).with_for_update())
        courier = courier_r.scalar_one_or_none()
        if courier:
            courier.cash_balance = max(0, courier.cash_balance - order.cash_amount)
            courier.card_balance = max(0, courier.card_balance - order.card_amount)
            courier.payme_balance = max(0, courier.payme_balance - order.payme_amount)

    # 2. Reverse kassa via negative CourierCashCollection (only physical money, not advance)
    if loc == "kassa" and physical_paid > 0:
        from app.models.finance import CourierCashCollection
        reversal = CourierCashCollection(
            tenant_id=order.tenant_id,
            courier_id=order.courier_id,
            cash_amount=-order.cash_amount,
            card_amount=-order.card_amount,
            payme_amount=-order.payme_amount,
            total_amount=-physical_paid,
            orders_completed=0,
            note=f"Buyurtma #{order.id} o'chirilganligi sababli qaytarildi",
            collection_date=datetime.now(timezone.utc),
        )
        db.add(reversal)

    # 3. Restore advance_used back to client
    if advance_used > 0 and order.client_id:
        from app.models.finance import Debt
        client_r = await db.execute(select(Client).where(Client.id == order.client_id).with_for_update())
        client = client_r.scalar_one_or_none()
        if client:
            client.advance_amount += advance_used
            if order.debt_amount > 0:
                client.debt_amount = max(0, client.debt_amount - order.debt_amount)
        # Reduce Debt record remaining
        debt_r = await db.execute(select(Debt).where(Debt.order_id == order.id))
        debt_rec = debt_r.scalar_one_or_none()
        if debt_rec:
            debt_rec.remaining_amount = 0
            debt_rec.is_paid = True
    elif order.debt_amount > 0 and order.client_id:
        # 4. Reduce client debt (only when no advance_used, to avoid double client load)
        from app.models.finance import Debt
        client_r = await db.execute(select(Client).where(Client.id == order.client_id).with_for_update())
        client = client_r.scalar_one_or_none()
        if client:
            client.debt_amount = max(0, client.debt_amount - order.debt_amount)
        # Reduce Debt record remaining
        debt_r = await db.execute(select(Debt).where(Debt.order_id == order.id))
        debt_rec = debt_r.scalar_one_or_none()
        if debt_rec:
            debt_rec.remaining_amount = 0
            debt_rec.is_paid = True


# ── Delete (soft) ─────────────────────────────────────────────────────────────

@router.get("/{order_id}/delete-preview")
async def delete_order_preview(
    order_id: int,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.tenant_id == user.tenant_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.is_deleted:
        raise HTTPException(status_code=400, detail="Order already deleted")
    return await _build_delete_preview(order, db)


@router.delete("/{order_id}")
async def delete_order(
    order_id: int,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.tenant_id == user.tenant_id).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.is_deleted:
        raise HTTPException(status_code=400, detail="Order already deleted")

    await _reverse_order_money(order, db, user.id)

    order.is_deleted = True
    order.deleted_at = datetime.now(timezone.utc)
    order.deleted_by_id = user.id
    await db.flush()
    return {"ok": True, "message": f"Buyurtma #{order_id} o'chirildi"}


# ── Edit ──────────────────────────────────────────────────────────────────────

class OrderEditItem(BaseModel):
    product_id: UUID
    quantity: int = PydanticField(ge=1)


class OrderEditRequest(BaseModel):
    client_id: Optional[UUID] = None
    address_text: Optional[str] = None
    items: Optional[List[OrderEditItem]] = None
    discount_amount: Optional[int] = PydanticField(default=None, ge=0)
    comment: Optional[str] = None



@router.post("/{order_id}/edit-preview")
async def edit_order_preview(
    order_id: int,
    data: OrderEditRequest,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.tenant_id == user.tenant_id)
        .options(selectinload(Order.items))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.is_deleted:
        raise HTTPException(status_code=400, detail="Order is deleted")

    old_payable = order.total_amount - order.discount_amount

    # Calculate new total from new items
    new_total = order.total_amount
    if data.items is not None:
        new_total = 0
        for it in data.items:
            prod_r = await db.execute(select(Product).where(Product.id == it.product_id, Product.tenant_id == user.tenant_id))
            prod = prod_r.scalar_one_or_none()
            if not prod:
                raise HTTPException(status_code=404, detail=f"Product {it.product_id} not found")
            new_total += it.quantity * prod.price

    new_discount = data.discount_amount if data.discount_amount is not None else order.discount_amount
    new_discount = min(new_discount, new_total)
    new_payable = new_total - new_discount
    delta = new_payable - old_payable  # positive = more expensive, negative = cheaper

    loc = await _get_money_location(order, db)
    changes = []

    if delta > 0:
        changes.append({"type": "new_debt", "delta": delta,
                        "label": f"Yangi qarz +{delta:,} so'm (mijoz ko'proq to'lashi kerak)"})
    elif delta < 0:
        refund = -delta
        if order.debt_amount > 0:
            debt_reduce = min(refund, order.debt_amount)
            changes.append({"type": "debt_reduce", "delta": -debt_reduce,
                            "label": f"Qarz kamayadi −{debt_reduce:,} so'm"})
            refund -= debt_reduce
        if refund > 0:
            if loc == "courier":
                changes.append({"type": "courier_balance", "delta": -refund,
                                "label": f"Kuryer balansidan qaytariladi −{refund:,} so'm"})
            elif loc == "kassa":
                changes.append({"type": "kassa", "delta": -refund,
                                "label": f"Kassadan qaytariladi −{refund:,} so'm"})
            else:
                changes.append({"type": "advance", "delta": refund,
                                "label": f"Mijoz avansiga +{refund:,} so'm"})

    changes.append({"type": "summary",
                    "label": f"Jami: {order.total_amount:,} → {new_total:,}, to'lov: {old_payable:,} → {new_payable:,}"})
    return {
        "order_id": order_id,
        "old_total": order.total_amount,
        "new_total": new_total,
        "old_payable": old_payable,
        "new_payable": new_payable,
        "delta": delta,
        "money_location": loc,
        "changes": changes,
    }


@router.patch("/{order_id}/edit")
async def edit_order(
    order_id: int,
    data: OrderEditRequest,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.tenant_id == user.tenant_id).with_for_update()
        .options(selectinload(Order.items))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.is_deleted:
        raise HTTPException(status_code=400, detail="Order is deleted")

    old_payable = order.total_amount - order.discount_amount
    loc = await _get_money_location(order, db)

    # Update client
    if data.client_id is not None:
        client_r = await db.execute(select(Client).where(Client.id == data.client_id, Client.tenant_id == user.tenant_id))
        if not client_r.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Client not found")
        order.client_id = data.client_id

    # Update address: save in walkin_address, clear address_id so list shows new text
    if data.address_text is not None:
        order.walkin_address = data.address_text
        order.address_id = None

    # Update comment
    if data.comment is not None:
        order.comment = data.comment

    # Update items
    if data.items is not None:
        # Delete old items
        for item in list(order.items):
            await db.delete(item)
        await db.flush()

        new_total = 0
        for it in data.items:
            prod_r = await db.execute(select(Product).where(Product.id == it.product_id, Product.tenant_id == user.tenant_id))
            prod = prod_r.scalar_one_or_none()
            if not prod:
                raise HTTPException(status_code=404, detail=f"Product {it.product_id} not found")
            line_total = it.quantity * prod.price
            new_total += line_total
            new_item = OrderItem(
                order_id=order.id,
                product_id=prod.id,
                tenant_id=order.tenant_id,
                quantity=it.quantity,
                delivered_quantity=it.quantity,
                price_at_order=prod.price,
                total=line_total,
            )
            db.add(new_item)
        order.total_amount = new_total
    else:
        new_total = order.total_amount

    # Update discount
    if data.discount_amount is not None:
        order.discount_amount = min(data.discount_amount, new_total)

    new_payable = order.total_amount - order.discount_amount
    delta = new_payable - old_payable

    # Apply financial adjustments
    if delta != 0 and order.status == OrderStatus.YETKAZILDI:
        from app.models.finance import Debt, CourierCashCollection

        if delta > 0:
            # More expensive → new debt for client
            if order.client_id:
                client_r = await db.execute(select(Client).where(Client.id == order.client_id).with_for_update())
                cl = client_r.scalar_one_or_none()
                if cl:
                    cl.debt_amount += delta
            order.debt_amount = order.debt_amount + delta
            # Update Debt record
            debt_r = await db.execute(select(Debt).where(Debt.order_id == order.id))
            debt_rec = debt_r.scalar_one_or_none()
            if debt_rec:
                debt_rec.remaining_amount += delta
                debt_rec.original_amount += delta
            else:
                if order.client_id:
                    db.add(Debt(tenant_id=order.tenant_id, client_id=order.client_id,
                                order_id=order.id, original_amount=delta, remaining_amount=delta))
        else:
            refund = -delta
            # First reduce existing debt
            if order.debt_amount > 0:
                debt_reduce = min(refund, order.debt_amount)
                order.debt_amount = max(0, order.debt_amount - debt_reduce)
                if order.client_id:
                    client_r = await db.execute(select(Client).where(Client.id == order.client_id).with_for_update())
                    cl = client_r.scalar_one_or_none()
                    if cl:
                        cl.debt_amount = max(0, cl.debt_amount - debt_reduce)
                debt_r = await db.execute(select(Debt).where(Debt.order_id == order.id))
                debt_rec = debt_r.scalar_one_or_none()
                if debt_rec:
                    debt_rec.remaining_amount = max(0, debt_rec.remaining_amount - debt_reduce)
                refund -= debt_reduce

            # Then handle remaining refund
            if refund > 0:
                order.paid_amount = max(0, order.paid_amount - refund)
                cash_share = min(refund, order.cash_amount)
                remaining_r = refund - cash_share
                card_share = min(remaining_r, order.card_amount)
                payme_share = remaining_r - card_share
                order.cash_amount = max(0, order.cash_amount - cash_share)
                order.card_amount = max(0, order.card_amount - card_share)
                order.payme_amount = max(0, order.payme_amount - payme_share)

                if loc == "courier" and order.courier_id:
                    courier_r = await db.execute(select(Courier).where(Courier.id == order.courier_id).with_for_update())
                    courier = courier_r.scalar_one_or_none()
                    if courier:
                        courier.cash_balance = max(0, courier.cash_balance - cash_share)
                        courier.card_balance = max(0, courier.card_balance - card_share)
                        courier.payme_balance = max(0, courier.payme_balance - payme_share)
                elif loc == "kassa" and order.courier_id:
                    reversal = CourierCashCollection(
                        tenant_id=order.tenant_id, courier_id=order.courier_id,
                        cash_amount=-cash_share, card_amount=-card_share,
                        payme_amount=-payme_share,
                        total_amount=-refund, orders_completed=0,
                        note=f"Buyurtma #{order.id} tahrirlash — qaytarildi",
                        collection_date=datetime.now(timezone.utc),
                    )
                    db.add(reversal)
                elif loc == "none" and order.client_id:
                    client_r = await db.execute(select(Client).where(Client.id == order.client_id).with_for_update())
                    cl = client_r.scalar_one_or_none()
                    if cl:
                        cl.advance_amount += refund

        # Recalculate payment status
        if order.paid_amount >= new_payable:
            order.payment_status = PaymentStatus.TOLANGAN
            order.debt_amount = 0
        elif order.paid_amount > 0:
            order.payment_status = PaymentStatus.QISMAN
        else:
            order.payment_status = PaymentStatus.TOLANMAGAN

    await _record_status(db, order.id, order.tenant_id, order.status, user.id,
                         f"Buyurtma tahrirlandi ({user.role.value}: {user.first_name})")
    await db.flush()

    result2 = await db.execute(
        select(Order).where(Order.id == order.id).options(selectinload(Order.items).selectinload(OrderItem.product))
    )
    updated = result2.scalar_one()
    return await _enrich_order(updated, db)
