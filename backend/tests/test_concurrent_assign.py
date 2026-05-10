"""
Tests: concurrent order assignment — SELECT FOR UPDATE prevents double-assign.
This test verifies 19.2 from TASKS.md.
"""
import uuid
import asyncio
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order, OrderStatus
from sqlalchemy import select
from tests.conftest import auth_headers, TENANT_ID


@pytest.mark.asyncio
async def test_concurrent_assign_only_one_succeeds(
    client: AsyncClient,
    db: AsyncSession,
    operator_user,
    client_user,
    courier_user,
    product,
    tenant,
):
    """
    Two operators try to assign the same order simultaneously.
    Only one should succeed; the other should get an error.
    """
    from app.models.client import ClientAddress

    _, cli = client_user
    courier_u, courier = courier_user

    # Create second courier
    from app.models.user import User, UserRole
    from app.models.courier import Courier
    courier2_user = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Courier2",
        phone="998901234590",
        role=UserRole.COURIER,
    )
    db.add(courier2_user)
    await db.flush()
    courier2 = Courier(id=uuid.uuid4(), tenant_id=tenant.id, user_id=courier2_user.id)
    db.add(courier2)
    await db.flush()

    # Create address
    addr = ClientAddress(
        id=uuid.uuid4(),
        client_id=cli.id,
        tenant_id=tenant.id,
        label="Uy",
        address_text="Test",
        latitude=41.0,
        longitude=69.0,
    )
    db.add(addr)
    await db.flush()

    # Create order
    order_resp = await client.post("/api/v1/orders/", json={
        "client_id": str(cli.id),
        "address_id": str(addr.id),
        "items": [{"product_id": str(product.id), "quantity": 1}],
    }, headers=auth_headers(operator_user))
    order_id = order_resp.json()["id"]

    # Attempt concurrent assignment
    async def assign(courier_id: str):
        return await client.post(f"/api/v1/orders/{order_id}/assign", json={
            "courier_id": courier_id,
        }, headers=auth_headers(operator_user))

    results = await asyncio.gather(
        assign(str(courier.id)),
        assign(str(courier2.id)),
        return_exceptions=True,
    )

    statuses = [r.status_code if hasattr(r, 'status_code') else 500 for r in results]

    # Exactly one should succeed (200) and one fail (400/409)
    success_count = sum(1 for s in statuses if s == 200)
    assert success_count == 1, f"Expected 1 success, got {success_count}. Statuses: {statuses}"

    # Verify order has exactly one courier
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one()
    assert order.status == OrderStatus.TAYINLANDI
    assert order.courier_id in (courier.id, courier2.id)
