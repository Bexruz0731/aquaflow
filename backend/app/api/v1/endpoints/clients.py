from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.db.base import get_db
from app.core.deps import get_current_user, require_operator, require_agent, require_boshliq
from app.models.user import User, UserRole
from app.models.client import Client, ClientAddress
from app.models.order import Order
from app.models.order import OrderItem
from app.models.product import Product
from app.schemas.client import (
    ClientCreate, ClientUpdate, ClientSelfUpdate, ClientResponse,
    ClientAddressCreate, ClientAddressResponse, ClientRegisterRequest,
)

from fastapi import Request
from app.core.limiter import limiter

router = APIRouter()


@router.post("/register", response_model=ClientResponse, status_code=201)
@limiter.limit("3/minute")
async def register_client(request: Request, data: ClientRegisterRequest, db: AsyncSession = Depends(get_db)):
    """Called by the Telegram bot when a new client registers."""
    # Check existing non-deleted client by phone
    result = await db.execute(
        select(Client).where(
            Client.phone == data.phone,
            Client.tenant_id == data.tenant_id,
            Client.is_deleted == False,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        # Client exists (e.g. imported from Excel) — link telegram account if not yet linked
        if existing.user_id is None and data.telegram_id:
            linked_user = User(
                telegram_id=data.telegram_id,
                telegram_username=data.telegram_username,
                first_name=existing.first_name,
                last_name=existing.last_name,
                phone=existing.phone,
                role=UserRole.CLIENT,
                is_phone_verified=True,
                language=data.language,
                tenant_id=existing.tenant_id,
            )
            db.add(linked_user)
            await db.flush()
            existing.user_id = linked_user.id
            await db.flush()
        elif existing.user_id is not None and data.telegram_id:
            # User record exists but telegram_id might be missing (e.g. manual web registration)
            user_result = await db.execute(select(User).where(User.id == existing.user_id))
            linked_user = user_result.scalar_one_or_none()
            if linked_user and not linked_user.telegram_id:
                linked_user.telegram_id = data.telegram_id
                linked_user.telegram_username = data.telegram_username
                await db.flush()
        await db.refresh(existing)
        return existing

    # Create user record
    user = User(
        telegram_id=data.telegram_id,
        telegram_username=data.telegram_username,
        first_name=data.first_name,
        last_name=data.last_name,
        phone=data.phone,
        role=UserRole.CLIENT,
        is_phone_verified=True,
        language=data.language,
        tenant_id=data.tenant_id,
    )
    db.add(user)
    await db.flush()

    # Create client record
    client = Client(
        tenant_id=data.tenant_id,
        user_id=user.id,
        first_name=data.first_name,
        last_name=data.last_name,
        phone=data.phone,
        is_verified=True,
    )
    db.add(client)
    await db.flush()

    # Save bot registration location as primary address
    if data.latitude is not None and data.longitude is not None:
        address = ClientAddress(
            client_id=client.id,
            tenant_id=data.tenant_id,
            label="Uy",
            address_text=data.address_text or f"{data.latitude:.5f}, {data.longitude:.5f}",
            latitude=data.latitude,
            longitude=data.longitude,
            is_primary=True,
        )
        db.add(address)
        await db.flush()
    elif data.address_text:
        address = ClientAddress(
            client_id=client.id,
            tenant_id=data.tenant_id,
            label="Uy",
            address_text=data.address_text,
            is_primary=True,
        )
        db.add(address)
        await db.flush()

    await db.refresh(client)
    return client


def _build_client_response(client: Client, user: User, addresses: list) -> ClientResponse:
    data = ClientResponse.model_validate(client)
    data.language = user.language or "uz"
    data.addresses = [ClientAddressResponse.model_validate(a) for a in addresses]
    return data


async def _get_client_with_addresses(user: User, db: AsyncSession):
    result = await db.execute(select(Client).where(Client.user_id == user.id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client profile not found")
    addr_result = await db.execute(
        select(ClientAddress).where(ClientAddress.client_id == client.id)
        .order_by(ClientAddress.is_primary.desc())
    )
    return client, addr_result.scalars().all()


@router.get("/me", response_model=ClientResponse)
async def get_my_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client, addresses = await _get_client_with_addresses(user, db)
    return _build_client_response(client, user, addresses)


@router.patch("/me", response_model=ClientResponse)
async def update_my_profile(
    data: ClientSelfUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client, addresses = await _get_client_with_addresses(user, db)
    update = data.model_dump(exclude_unset=True)
    language = update.pop("language", None)
    for field, value in update.items():
        setattr(client, field, value)
    if language is not None:
        user.language = language
    await db.flush()
    return _build_client_response(client, user, addresses)


@router.delete("/me/addresses/{address_id}", status_code=204)
async def delete_my_address(
    address_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Client).where(Client.user_id == user.id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client profile not found")
    addr_result = await db.execute(
        select(ClientAddress).where(ClientAddress.id == address_id, ClientAddress.client_id == client.id)
    )
    address = addr_result.scalar_one_or_none()
    if not address:
        raise HTTPException(status_code=404, detail="Address not found")
    await db.delete(address)
    await db.flush()


@router.post("/me/addresses", response_model=ClientAddressResponse, status_code=201)
async def add_my_address(
    data: ClientAddressCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Client).where(Client.user_id == user.id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client profile not found")
    if data.is_primary:
        await db.execute(
            ClientAddress.__table__.update()
            .where(ClientAddress.client_id == client.id)
            .values(is_primary=False)
        )
        await db.flush()  # flush before inserting new primary to avoid race condition
    address = ClientAddress(client_id=client.id, tenant_id=client.tenant_id, **data.model_dump())
    db.add(address)
    await db.flush()
    await db.refresh(address)
    return address


@router.get("/", response_model=dict)
async def list_clients(
    search: Optional[str] = Query(None),
    is_blocked: Optional[bool] = Query(None),
    is_active: Optional[bool] = Query(None),
    top30: Optional[int] = Query(None),
    inactive_days: Optional[int] = Query(None),
    has_orders: Optional[bool] = Query(None),  # True = only clients with ≥1 order; False = only never-ordered
    sort_by: Optional[str] = Query(None),  # "address" for alphabetical by address
    group_id: Optional[UUID] = Query(None),
    ungrouped: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=5000),
    user: User = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
):
    if top30:
        # Top clients: subquery for total_spent and orders_count, sort by total_spent DESC then orders_count DESC
        from sqlalchemy import case, literal
        stats_sq = (
            select(
                Order.client_id,
                func.coalesce(func.sum(Order.total_amount), 0).label("total_spent"),
                func.count(Order.id).label("orders_count"),
            )
            .where(Order.tenant_id == user.tenant_id, Order.is_deleted == False)
            .group_by(Order.client_id)
            .subquery()
        )
        query = (
            select(Client, stats_sq.c.total_spent, stats_sq.c.orders_count)
            .outerjoin(stats_sq, stats_sq.c.client_id == Client.id)
            .where(Client.tenant_id == user.tenant_id, Client.is_deleted == False)
            .order_by(
                func.coalesce(stats_sq.c.total_spent, 0).desc(),
                func.coalesce(stats_sq.c.orders_count, 0).desc(),
            )
            .limit(30)
        )
        result = await db.execute(query)
        rows = result.all()
        client_ids = [row[0].id for row in rows]
        addr_result = await db.execute(
            select(ClientAddress)
            .where(ClientAddress.client_id.in_(client_ids))
            .order_by(ClientAddress.is_primary.desc(), ClientAddress.created_at)
        ) if client_ids else None
        from collections import defaultdict
        addr_map = defaultdict(list)
        for addr in (addr_result.scalars().all() if addr_result else []):
            addr_map[addr.client_id].append(addr)

        items = []
        for row in rows:
            c, total_spent, orders_count = row
            r = ClientResponse.model_validate(c)
            r.orders_count = orders_count or 0
            r.total_spent = total_spent or 0
            addrs = [ClientAddressResponse.model_validate(a) for a in addr_map.get(c.id, [])]
            r.addresses = addrs
            primary = next((a for a in addrs if a.is_primary), addrs[0] if addrs else None)
            r.display_name = primary.address_text if (primary and primary.address_text) else c.phone
            items.append(r)
        return {"items": items, "total": len(items), "page": 1, "per_page": 30, "pages": 1}

    query = select(Client).where(Client.tenant_id == user.tenant_id, Client.is_deleted == False)
    if search:
        from sqlalchemy import exists as sa_exists
        # Escape SQL wildcard chars to prevent broken search patterns
        safe_search = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        addr_subq = (
            select(ClientAddress.client_id)
            .where(
                ClientAddress.address_text.ilike(f"%{safe_search}%"),
                ClientAddress.client_id == Client.id,
            )
            .correlate(Client)
        )
        query = query.where(
            or_(
                Client.first_name.ilike(f"%{safe_search}%"),
                Client.last_name.ilike(f"%{safe_search}%"),
                Client.phone.ilike(f"%{safe_search}%"),
                sa_exists(addr_subq),
            )
        )
    if is_blocked is not None:
        query = query.where(Client.is_blocked == is_blocked)
    if is_active is not None:
        query = query.where(Client.is_active == is_active)
    if group_id is not None:
        query = query.where(Client.group_id == group_id)
    if ungrouped:
        query = query.where(Client.group_id == None)

    if inactive_days is not None:
        from datetime import datetime, timedelta, timezone
        cutoff = datetime.now(timezone.utc) - timedelta(days=inactive_days)
        last_order_sq = (
            select(Order.client_id, func.max(Order.created_at).label("last_order"))
            .where(Order.tenant_id == user.tenant_id, Order.is_deleted == False)
            .group_by(Order.client_id)
            .subquery()
        )
        query = (
            query
            .outerjoin(last_order_sq, last_order_sq.c.client_id == Client.id)
            .where(
                and_(
                    last_order_sq.c.last_order != None,   # has at least one order
                    last_order_sq.c.last_order < cutoff,  # but not recently
                )
            )
        )

    if has_orders is True:
        order_exists_sq = (
            select(Order.client_id)
            .where(Order.tenant_id == user.tenant_id, Order.is_deleted == False, Order.client_id == Client.id)
            .correlate(Client)
            .exists()
        )
        query = query.where(order_exists_sq)
    elif has_orders is False:
        order_exists_sq = (
            select(Order.client_id)
            .where(Order.tenant_id == user.tenant_id, Order.is_deleted == False, Order.client_id == Client.id)
            .correlate(Client)
            .exists()
        )
        query = query.where(~order_exists_sq)

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar_one()

    if sort_by == "address":
        primary_addr_sq = (
            select(ClientAddress.client_id, ClientAddress.address_text)
            .where(ClientAddress.is_primary == True)
            .subquery()
        )
        query = (
            query
            .outerjoin(primary_addr_sq, primary_addr_sq.c.client_id == Client.id)
            .order_by(primary_addr_sq.c.address_text.asc().nullslast())
        )
    else:
        query = query.order_by(Client.created_at.desc())

    query = query.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    clients = result.scalars().all()

    # Bulk fetch order counts for all clients on this page
    client_ids = [c.id for c in clients]

    # Bulk fetch order stats + last order date
    counts_result = await db.execute(
        select(Order.client_id, func.count(Order.id), func.coalesce(func.sum(Order.total_amount), 0), func.max(Order.created_at))
        .where(Order.client_id.in_(client_ids), Order.is_deleted == False)
        .group_by(Order.client_id)
    ) if client_ids else None
    order_stats = {row[0]: (row[1], row[2], row[3]) for row in (counts_result.all() if counts_result else [])}

    # Bulk fetch all addresses
    addr_result = await db.execute(
        select(ClientAddress)
        .where(ClientAddress.client_id.in_(client_ids))
        .order_by(ClientAddress.is_primary.desc(), ClientAddress.created_at)
    ) if client_ids else None
    from collections import defaultdict
    addr_map = defaultdict(list)
    for addr in (addr_result.scalars().all() if addr_result else []):
        addr_map[addr.client_id].append(addr)

    items = []
    for c in clients:
        r = ClientResponse.model_validate(c)
        stats = order_stats.get(c.id)
        r.orders_count = stats[0] if stats else 0
        r.total_spent = stats[1] if stats else 0
        r.last_order_at = stats[2] if stats else None
        addrs = [ClientAddressResponse.model_validate(a) for a in addr_map.get(c.id, [])]
        r.addresses = addrs
        primary = next((a for a in addrs if a.is_primary), addrs[0] if addrs else None)
        r.display_name = primary.address_text if primary else c.phone
        items.append(r)

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    }


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(
    client_id: UUID,
    user: User = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Client)
        .options(selectinload(Client.addresses))
        .where(Client.id == client_id, Client.tenant_id == user.tenant_id)
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # orders stats
    stats = await db.execute(
        select(func.count(Order.id), func.coalesce(func.sum(Order.total_amount), 0))
        .where(Order.client_id == client_id, Order.tenant_id == user.tenant_id, Order.is_deleted == False)
    )
    orders_count, total_spent = stats.one()

    # telegram info + role info from linked user
    telegram_id, telegram_username = None, None
    user_role, user_secondary_role, linked_user_id = None, None, None
    if client.user_id:
        u = await db.execute(select(User).where(User.id == client.user_id))
        linked = u.scalar_one_or_none()
        if linked:
            telegram_id = linked.telegram_id
            telegram_username = linked.telegram_username
            linked_user_id = linked.id
            user_role = linked.role.value
            user_secondary_role = linked.secondary_role

    # container product: find the returnable product from the client's most recent order
    container_product_id, container_product_name = None, None
    cp_r = await db.execute(
        select(Product.id, Product.name)
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
    cp_row = cp_r.first()
    if cp_row:
        container_product_id, container_product_name = cp_row
    else:
        # fall back to first active returnable product for this tenant
        fp_r = await db.execute(
            select(Product.id, Product.name)
            .where(
                Product.tenant_id == user.tenant_id,
                Product.is_returnable_container == True,
                Product.is_active == True,
            )
            .limit(1)
        )
        fp_row = fp_r.first()
        if fp_row:
            container_product_id, container_product_name = fp_row

    resp = ClientResponse.model_validate(client)
    resp.orders_count = orders_count
    resp.total_spent = total_spent
    resp.telegram_id = telegram_id
    resp.telegram_username = telegram_username
    resp.user_role = user_role
    resp.user_secondary_role = user_secondary_role
    resp.linked_user_id = linked_user_id
    resp.container_product_id = container_product_id
    resp.container_product_name = container_product_name
    primary_addr = next((a for a in resp.addresses if a.is_primary), resp.addresses[0] if resp.addresses else None)
    resp.display_name = primary_addr.address_text if primary_addr else client.phone
    return resp


@router.post("/", response_model=ClientResponse, status_code=201)
async def create_client(
    data: ClientCreate,
    user: User = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(Client).where(Client.phone == data.phone, Client.tenant_id == user.tenant_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Client with this phone already exists")

    client_data = data.model_dump(exclude={'initial_debt'})
    client = Client(tenant_id=user.tenant_id, **client_data)
    if data.initial_debt > 0:
        client.debt_amount = data.initial_debt
    db.add(client)
    await db.flush()
    await db.refresh(client)
    return client


@router.patch("/{client_id}", response_model=ClientResponse)
async def update_client(
    client_id: UUID,
    data: ClientUpdate,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == user.tenant_id)
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(client, field, value)

    await db.flush()
    await db.refresh(client)
    return client


# ── Addresses ──────────────────────────────────────────────────────────────

@router.post("/{client_id}/addresses", response_model=ClientAddressResponse, status_code=201)
async def add_address(
    client_id: UUID,
    data: ClientAddressCreate,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    client_check = await db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == user.tenant_id)
    )
    if not client_check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Client not found")

    if data.is_primary:
        await db.execute(
            ClientAddress.__table__.update()
            .where(ClientAddress.client_id == client_id)
            .values(is_primary=False)
        )
        await db.flush()  # flush before inserting new primary to avoid race condition

    address = ClientAddress(client_id=client_id, tenant_id=user.tenant_id, **data.model_dump())
    db.add(address)
    await db.flush()
    await db.refresh(address)
    return address


@router.get("/{client_id}/addresses")
async def list_addresses(client_id: UUID, user: User = Depends(require_operator), db: AsyncSession = Depends(get_db)):
    client_check = await db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == user.tenant_id)
    )
    if not client_check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Client not found")

    result = await db.execute(
        select(ClientAddress).where(ClientAddress.client_id == client_id).order_by(ClientAddress.is_primary.desc())
    )
    return result.scalars().all()


@router.patch("/{client_id}/addresses/{address_id}", response_model=ClientAddressResponse)
async def update_address(
    client_id: UUID,
    address_id: UUID,
    data: ClientAddressCreate,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    client_check = await db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == user.tenant_id)
    )
    if not client_check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Client not found")

    result = await db.execute(
        select(ClientAddress).where(ClientAddress.id == address_id, ClientAddress.client_id == client_id)
    )
    address = result.scalar_one_or_none()
    if not address:
        raise HTTPException(status_code=404, detail="Address not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(address, field, value)

    await db.flush()
    await db.refresh(address)
    return address


@router.delete("/{client_id}/addresses/{address_id}", status_code=204)
async def delete_address(client_id: UUID, address_id: UUID, user: User = Depends(require_operator), db: AsyncSession = Depends(get_db)):
    client_check = await db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == user.tenant_id)
    )
    if not client_check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Client not found")

    result = await db.execute(
        select(ClientAddress).where(ClientAddress.id == address_id, ClientAddress.client_id == client_id)
    )
    address = result.scalar_one_or_none()
    if not address:
        raise HTTPException(status_code=404, detail="Address not found")
    await db.delete(address)
    await db.flush()


class RoleChangeRequest(BaseModel):
    role: UserRole
    car_number: Optional[str] = None  # required when changing to COURIER


@router.post("/{client_id}/change-role")
async def change_user_role(
    client_id: UUID,
    data: RoleChangeRequest,
    operator: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    """Change the role of a user linked to a client record."""
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == operator.tenant_id)
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if not client.user_id:
        raise HTTPException(status_code=400, detail="Bu mijoz Telegram orqali ro'yxatdan o'tmagan")

    user_result = await db.execute(select(User).where(User.id == client.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_role = user.role
    user.role = data.role

    # If promoting to COURIER — create Courier profile if not exists, or reactivate existing
    if data.role == UserRole.COURIER:
        from app.models.courier import Courier
        existing_courier_result = await db.execute(
            select(Courier).where(Courier.user_id == user.id).with_for_update()
        )
        existing_courier = existing_courier_result.scalar_one_or_none()
        if not existing_courier:
            courier = Courier(
                user_id=user.id,
                tenant_id=operator.tenant_id,
                car_number=data.car_number,
            )
            db.add(courier)
        else:
            existing_courier.is_active = True

    # If demoting from COURIER back to CLIENT — deactivate courier profile
    if old_role == UserRole.COURIER and data.role == UserRole.CLIENT:
        from app.models.courier import Courier
        c_result = await db.execute(select(Courier).where(Courier.user_id == user.id))
        courier = c_result.scalar_one_or_none()
        if courier:
            courier.is_active = False

    # Clear secondary role when demoting to client
    if data.role == UserRole.CLIENT:
        user.secondary_role = None

    await db.flush()
    return {"ok": True, "new_role": data.role.value}


@router.delete("/{client_id}", status_code=204)
async def delete_client(
    client_id: UUID,
    operator: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a client. All orders remain intact. Telegram link is severed so the user can re-register fresh."""
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == operator.tenant_id, Client.is_deleted == False)
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Soft delete
    client.is_deleted = True
    client.is_active = False

    # Sever Telegram link so the user can register a fresh profile via bot
    if client.user_id:
        user_result = await db.execute(select(User).where(User.id == client.user_id))
        linked_user = user_result.scalar_one_or_none()
        if linked_user:
            linked_user.telegram_id = None
            linked_user.is_active = False

    await db.flush()


class MakeOperatorRequest(BaseModel):
    password: str
    phone: Optional[str] = None  # override phone for web login if needed


@router.post("/{client_id}/make-operator", status_code=200)
async def make_client_operator(
    client_id: UUID,
    data: MakeOperatorRequest,
    boss: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    """Give a client web panel access with operator role and a password."""
    from app.core.security import hash_password

    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == boss.tenant_id).with_for_update()
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if client.user_id:
        # Already has a linked user — just update role + password
        user_result = await db.execute(select(User).where(User.id == client.user_id).with_for_update())
        user = user_result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="Linked user not found")
    else:
        # Web-created client with no user record — create one now
        phone = data.phone or client.phone
        user = User(
            tenant_id=boss.tenant_id,
            first_name=client.first_name,
            last_name=client.last_name,
            phone=phone,
            role=UserRole.OPERATOR,
            is_active=True,
        )
        db.add(user)
        await db.flush()
        client.user_id = user.id

    user.role = UserRole.OPERATOR
    user.hashed_password = hash_password(data.password)
    if data.phone:
        user.phone = data.phone
    user.is_active = True

    await db.flush()
    return {"ok": True, "user_id": str(user.id), "phone": user.phone}


@router.post("/{client_id}/make-agent", status_code=200)
async def make_client_agent(
    client_id: UUID,
    data: MakeOperatorRequest,
    boss: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    """Give a client web panel access with agent role and a password."""
    from app.core.security import hash_password

    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == boss.tenant_id).with_for_update()
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if client.user_id:
        user_result = await db.execute(select(User).where(User.id == client.user_id).with_for_update())
        user = user_result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="Linked user not found")
    else:
        phone = data.phone or client.phone
        user = User(
            tenant_id=boss.tenant_id,
            first_name=client.first_name,
            last_name=client.last_name,
            phone=phone,
            role=UserRole.AGENT,
            is_active=True,
        )
        db.add(user)
        await db.flush()
        client.user_id = user.id

    user.role = UserRole.AGENT
    user.hashed_password = hash_password(data.password)
    if data.phone:
        user.phone = data.phone
    user.is_active = True

    await db.flush()
    return {"ok": True, "user_id": str(user.id), "phone": user.phone}


# ── Advance management (boshliq only) ────────────────────────────────────────

class AdvanceAddRequest(BaseModel):
    amount: int
    payment_method: str  # NAQD / KARTA / PAYME
    note: Optional[str] = None


@router.post("/{client_id}/add-advance", status_code=201)
async def add_client_advance(
    client_id: UUID,
    data: AdvanceAddRequest,
    boss: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    """Manually add advance to a client and record it in the treasury."""
    from app.models.finance import (
        DebtTransaction, DebtTransactionType,
        TreasuryTransaction, TreasuryTransactionType, TreasuryCategory,
    )
    from app.models.order import PaymentMethod

    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Summa musbat bo'lishi kerak")

    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == boss.tenant_id).with_for_update()
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    client.advance_amount += data.amount

    try:
        pm = PaymentMethod(data.payment_method.upper())
    except ValueError:
        pm = PaymentMethod.NAQD

    db.add(DebtTransaction(
        tenant_id=boss.tenant_id,
        client_id=client.id,
        transaction_type=DebtTransactionType.ADVANCE,
        amount=data.amount,
        payment_method=pm,
        description=data.note or f"Qo'lda avans kiritildi",
        created_by_id=boss.id,
    ))
    db.add(TreasuryTransaction(
        tenant_id=boss.tenant_id,
        transaction_type=TreasuryTransactionType.KIRIM,
        category=TreasuryCategory.AVANS,
        amount=data.amount,
        payment_method=pm,
        description=f"Avans: {client.first_name} {client.last_name or ''} — {data.note or ''}".strip(" —"),
        created_by_id=boss.id,
    ))

    await db.flush()
    return {"ok": True, "advance_amount": client.advance_amount}


# ── Debt adjustment (boshliq only) ───────────────────────────────────────────

class DebtAdjustRequest(BaseModel):
    delta: int  # positive = add debt, negative = reduce/forgive
    note: Optional[str] = None


@router.post("/{client_id}/adjust-debt", status_code=200)
async def adjust_client_debt(
    client_id: UUID,
    data: DebtAdjustRequest,
    boss: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    """Add or reduce a client's debt manually (boss only)."""
    from app.models.finance import Debt, DebtTransaction, DebtTransactionType

    if data.delta == 0:
        raise HTTPException(status_code=400, detail="Delta 0 bo'lishi mumkin emas")

    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == boss.tenant_id).with_for_update()
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if data.delta > 0:
        # Adding debt — create a Debt record so it appears in debtors list
        # Use a sentinel order_id workaround: store without order by making order_id nullable
        # We update client.debt_amount and add a DebtTransaction
        client.debt_amount += data.delta
        db.add(DebtTransaction(
            tenant_id=boss.tenant_id,
            client_id=client.id,
            transaction_type=DebtTransactionType.DEBT,
            amount=data.delta,
            description=data.note or "Qo'lda qarz kiritildi",
            created_by_id=boss.id,
        ))
    else:
        # Reducing debt — clamp to 0
        reduction = min(abs(data.delta), client.debt_amount)
        client.debt_amount = max(0, client.debt_amount + data.delta)
        db.add(DebtTransaction(
            tenant_id=boss.tenant_id,
            client_id=client.id,
            transaction_type=DebtTransactionType.ADJUSTMENT,
            amount=-reduction,
            description=data.note or "Qarz tuzatildi",
            created_by_id=boss.id,
        ))

    await db.flush()
    return {"ok": True, "debt_amount": client.debt_amount}


# ── Advance adjustment (boshliq only) ────────────────────────────────────────

class AdvanceAdjustRequest(BaseModel):
    delta: int  # positive = add advance, negative = reduce/remove
    note: Optional[str] = None


@router.post("/{client_id}/adjust-advance", status_code=200)
async def adjust_client_advance(
    client_id: UUID,
    data: AdvanceAdjustRequest,
    boss: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    """Add or reduce a client's advance manually (boss only).
    Adding advance → KIRIM in treasury.
    Reducing advance → CHIQIM from treasury (cancels previously received money).
    """
    from app.models.finance import (
        DebtTransaction, DebtTransactionType,
        TreasuryTransaction, TreasuryTransactionType, TreasuryCategory,
    )
    from app.models.order import PaymentMethod

    if data.delta == 0:
        raise HTTPException(status_code=400, detail="Delta 0 bo'lishi mumkin emas")

    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == boss.tenant_id).with_for_update()
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    addr_label = client.phone or str(client_id)[:8]

    if data.delta > 0:
        client.advance_amount += data.delta
        db.add(DebtTransaction(
            tenant_id=boss.tenant_id,
            client_id=client.id,
            transaction_type=DebtTransactionType.ADVANCE,
            amount=data.delta,
            description=data.note or "Avans qo'lda qo'shildi",
            created_by_id=boss.id,
        ))
        db.add(TreasuryTransaction(
            tenant_id=boss.tenant_id,
            transaction_type=TreasuryTransactionType.KIRIM,
            category=TreasuryCategory.AVANS,
            amount=data.delta,
            payment_method=PaymentMethod.NAQD,
            description=f"Avans tuzatish (+): {addr_label}" + (f" — {data.note}" if data.note else ""),
            created_by_id=boss.id,
        ))
    else:
        reduction = min(abs(data.delta), client.advance_amount)
        client.advance_amount = max(0, client.advance_amount + data.delta)
        db.add(DebtTransaction(
            tenant_id=boss.tenant_id,
            client_id=client.id,
            transaction_type=DebtTransactionType.ADJUSTMENT,
            amount=-reduction,
            description=data.note or "Avans tuzatildi",
            created_by_id=boss.id,
        ))
        if reduction > 0:
            db.add(TreasuryTransaction(
                tenant_id=boss.tenant_id,
                transaction_type=TreasuryTransactionType.CHIQIM,
                category=TreasuryCategory.AVANS,
                amount=reduction,
                payment_method=PaymentMethod.NAQD,
                description=f"Avans tuzatish (−): {addr_label}" + (f" — {data.note}" if data.note else ""),
                created_by_id=boss.id,
            ))

    await db.flush()
    return {"ok": True, "advance_amount": client.advance_amount}
