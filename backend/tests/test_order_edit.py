"""Tests for PATCH /orders/{id}/courier-edit — open-shift only."""
import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.courier import Courier, ShiftStatus
from app.models.order import Order, OrderStatus, PaymentStatus
from app.models.finance import ContainerClientBalance, ContainerTransaction
from app.models.client import Client
from tests.conftest import auth_headers


async def _make_courier(db: AsyncSession, tenant_id, phone: str, shift_open: bool):
    from app.models.user import User, UserRole
    from app.core.security import hash_password
    user = User(
        tenant_id=tenant_id,
        role=UserRole.COURIER,
        first_name="TestCourier",
        phone=phone,
        hashed_password=hash_password("pass"),
    )
    db.add(user)
    await db.flush()
    courier = Courier(
        tenant_id=tenant_id,
        user_id=user.id,
        shift_status=ShiftStatus.OPEN if shift_open else ShiftStatus.CLOSED,
        shift_started_at=datetime.now(timezone.utc) if shift_open else None,
    )
    db.add(courier)
    await db.flush()
    return user, courier


async def _make_delivered_order(db: AsyncSession, tenant_id, courier_id,
                                 client_id=None,
                                 containers_delivered=5,
                                 containers_returned=2,
                                 total_amount=10000,
                                 paid_amount=10000):
    order = Order(
        tenant_id=tenant_id,
        courier_id=courier_id,
        client_id=client_id,
        status=OrderStatus.YETKAZILDI,
        payment_status=PaymentStatus.TOLANGAN,
        total_amount=total_amount,
        paid_amount=paid_amount,
        cash_amount=paid_amount,
        containers_delivered=containers_delivered,
        containers_returned=containers_returned,
        delivered_at=datetime.now(timezone.utc),
    )
    db.add(order)
    await db.flush()
    return order


@pytest.mark.asyncio
async def test_courier_edit_containers_open_shift(
    client: AsyncClient, db: AsyncSession, boshliq_user
):
    """Courier with open shift can fix containers_returned and containers_delivered."""
    from app.core.security import create_access_token

    tenant_id = boshliq_user.tenant_id
    user, courier = await _make_courier(db, tenant_id, "+998901111001", shift_open=True)
    order = await _make_delivered_order(
        db, tenant_id, courier.id,
        containers_delivered=5, containers_returned=2,
    )
    await db.flush()

    token = create_access_token({"sub": str(user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.patch(
        f"/api/v1/orders/{order.id}/courier-edit",
        json={"containers_returned": 1},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["containers_returned"] == 1
    assert data["containers_delivered"] == 5

    # Verify order row updated
    await db.refresh(order)
    assert order.containers_returned == 1


@pytest.mark.asyncio
async def test_courier_edit_client_balance_updates(
    client: AsyncClient, db: AsyncSession, boshliq_user
):
    """When courier corrects containers, client container_balance updates correctly."""
    from app.core.security import create_access_token

    tenant_id = boshliq_user.tenant_id

    # Create a client
    cl = Client(
        tenant_id=tenant_id,
        first_name="TestClient",
        phone="+998901222001",
        container_balance=3,   # old_delivered(5) - old_returned(2) = 3
    )
    db.add(cl)
    await db.flush()

    # Create ContainerClientBalance matching current state
    cb = ContainerClientBalance(
        tenant_id=tenant_id,
        client_id=cl.id,
        balance=3,
    )
    db.add(cb)
    await db.flush()

    user, courier = await _make_courier(db, tenant_id, "+998901111002", shift_open=True)
    order = await _make_delivered_order(
        db, tenant_id, courier.id,
        client_id=cl.id,
        containers_delivered=5, containers_returned=2,
    )
    await db.flush()

    token = create_access_token({"sub": str(user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    # Courier took 2 but should have taken only 1 → returned_delta = 1-2 = -1
    # client_balance_delta = (5-5) - (1-2) = 0 - (-1) = +1  (client has 1 more bottle now)
    resp = await client.patch(
        f"/api/v1/orders/{order.id}/courier-edit",
        json={"containers_returned": 1},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    await db.refresh(cb)
    await db.refresh(cl)
    assert cb.balance == 4   # 3 + 1
    assert cl.container_balance == 4


@pytest.mark.asyncio
async def test_courier_edit_blocked_when_shift_closed(
    client: AsyncClient, db: AsyncSession, boshliq_user
):
    """Courier cannot edit when shift is closed."""
    from app.core.security import create_access_token

    tenant_id = boshliq_user.tenant_id
    user, courier = await _make_courier(db, tenant_id, "+998901111003", shift_open=False)
    order = await _make_delivered_order(db, tenant_id, courier.id)
    await db.flush()

    token = create_access_token({"sub": str(user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.patch(
        f"/api/v1/orders/{order.id}/courier-edit",
        json={"containers_returned": 1},
        headers=headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_courier_cannot_edit_other_couriers_order(
    client: AsyncClient, db: AsyncSession, boshliq_user
):
    """Courier cannot edit an order assigned to a different courier."""
    from app.core.security import create_access_token

    tenant_id = boshliq_user.tenant_id
    user1, courier1 = await _make_courier(db, tenant_id, "+998901111004", shift_open=True)
    user2, courier2 = await _make_courier(db, tenant_id, "+998901111005", shift_open=True)
    order = await _make_delivered_order(db, tenant_id, courier2.id)  # belongs to courier2
    await db.flush()

    token = create_access_token({"sub": str(user1.id)})  # courier1 tries to edit
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.patch(
        f"/api/v1/orders/{order.id}/courier-edit",
        json={"containers_returned": 1},
        headers=headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_courier_edit_total_amount_updates_debt(
    client: AsyncClient, db: AsyncSession, boshliq_user
):
    """When courier fixes total_amount, debt_amount on order and client recalculate."""
    from app.core.security import create_access_token

    tenant_id = boshliq_user.tenant_id

    cl = Client(
        tenant_id=tenant_id,
        first_name="DebtClient",
        phone="+998901222002",
        debt_amount=2000,
    )
    db.add(cl)
    await db.flush()

    user, courier = await _make_courier(db, tenant_id, "+998901111006", shift_open=True)
    # Order: total 12000, paid 10000 → debt 2000
    order = await _make_delivered_order(
        db, tenant_id, courier.id,
        client_id=cl.id,
        total_amount=12000, paid_amount=10000,
    )
    order.debt_amount = 2000
    await db.flush()
    await db.flush()

    token = create_access_token({"sub": str(user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    # Correct total to 10000 — debt should become 0
    resp = await client.patch(
        f"/api/v1/orders/{order.id}/courier-edit",
        json={"total_amount": 10000},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    await db.refresh(order)
    await db.refresh(cl)
    assert order.total_amount == 10000
    assert order.debt_amount == 0
    assert cl.debt_amount == 0
