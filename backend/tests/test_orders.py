"""Tests: order lifecycle YANGI → YETKAZILDI."""
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.order import Order, OrderStatus, PaymentStatus
from app.models.client import Client, ClientAddress
from app.models.courier import CourierInventory
from tests.conftest import auth_headers


async def _make_address(db: AsyncSession, client_id, tenant_id) -> ClientAddress:
    addr = ClientAddress(
        id=uuid.uuid4(),
        client_id=client_id,
        tenant_id=tenant_id,
        label="Uy",
        address_text="Toshkent, Yunusobod 6",
        latitude=41.3,
        longitude=69.2,
    )
    db.add(addr)
    await db.flush()
    return addr


async def _give_courier_inventory(db: AsyncSession, courier_id, product_id, tenant_id, qty: int = 10):
    """Seed courier inventory so complete_order doesn't fail with 400."""
    inv = CourierInventory(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        courier_id=courier_id,
        product_id=product_id,
        quantity=qty,
    )
    db.add(inv)
    await db.flush()
    return inv


@pytest.mark.asyncio
async def test_create_order(client: AsyncClient, db: AsyncSession, operator_user, client_user, product, tenant):
    _, cli = client_user
    addr = await _make_address(db, cli.id, tenant.id)

    resp = await client.post("/api/v1/orders/", json={
        "client_id": str(cli.id),
        "address_id": str(addr.id),
        "items": [{"product_id": str(product.id), "quantity": 2}],
    }, headers=auth_headers(operator_user))

    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "yangi"
    assert data["total_amount"] == 24000  # 12000 × 2
    assert len(data["items"]) == 1


@pytest.mark.asyncio
async def test_assign_courier(client: AsyncClient, db: AsyncSession, operator_user, client_user, courier_user, product, tenant):
    _, cli = client_user
    _, courier = courier_user
    addr = await _make_address(db, cli.id, tenant.id)

    order_resp = await client.post("/api/v1/orders/", json={
        "client_id": str(cli.id),
        "address_id": str(addr.id),
        "items": [{"product_id": str(product.id), "quantity": 1}],
    }, headers=auth_headers(operator_user))

    order_id = order_resp.json()["id"]

    assign_resp = await client.post(f"/api/v1/orders/{order_id}/assign", json={
        "courier_id": str(courier.id),
    }, headers=auth_headers(operator_user))

    assert assign_resp.status_code == 200
    assert assign_resp.json()["status"] == "tayinlandi"


@pytest.mark.asyncio
async def test_complete_order_paid(client: AsyncClient, db: AsyncSession, operator_user, client_user, courier_user, product, tenant):
    _, cli = client_user
    courier_u, courier = courier_user
    addr = await _make_address(db, cli.id, tenant.id)

    order_resp = await client.post("/api/v1/orders/", json={
        "client_id": str(cli.id),
        "address_id": str(addr.id),
        "items": [{"product_id": str(product.id), "quantity": 1}],
    }, headers=auth_headers(operator_user))
    order_id = order_resp.json()["id"]

    await client.post(f"/api/v1/orders/{order_id}/assign", json={
        "courier_id": str(courier.id),
    }, headers=auth_headers(operator_user))

    # Give courier inventory so complete_order doesn't reject with 400
    await _give_courier_inventory(db, courier.id, product.id, tenant.id, qty=5)

    complete_resp = await client.post(f"/api/v1/orders/{order_id}/complete", json={
        "payment_type": "paid",
        "paid_amount": 12000,
        "containers_returned": 0,
    }, headers=auth_headers(courier_u))

    assert complete_resp.status_code == 200

    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one()
    assert order.status == OrderStatus.YETKAZILDI
    assert order.payment_status == PaymentStatus.TOLANGAN
    assert order.debt_amount == 0


@pytest.mark.asyncio
async def test_complete_order_unpaid_creates_debt(client: AsyncClient, db: AsyncSession, operator_user, client_user, courier_user, product, tenant):
    _, cli = client_user
    courier_u, courier = courier_user
    addr = await _make_address(db, cli.id, tenant.id)

    initial_debt = cli.debt_amount

    order_resp = await client.post("/api/v1/orders/", json={
        "client_id": str(cli.id),
        "address_id": str(addr.id),
        "items": [{"product_id": str(product.id), "quantity": 2}],
    }, headers=auth_headers(operator_user))
    order_id = order_resp.json()["id"]

    await client.post(f"/api/v1/orders/{order_id}/assign", json={
        "courier_id": str(courier.id),
    }, headers=auth_headers(operator_user))

    await _give_courier_inventory(db, courier.id, product.id, tenant.id, qty=10)

    await client.post(f"/api/v1/orders/{order_id}/complete", json={
        "payment_type": "unpaid",
        "paid_amount": 0,
        "containers_returned": 0,
    }, headers=auth_headers(courier_u))

    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one()
    assert order.payment_status == PaymentStatus.TOLANMAGAN
    assert order.debt_amount == 24000

    await db.refresh(cli)
    assert cli.debt_amount == initial_debt + 24000


@pytest.mark.asyncio
async def test_complete_order_partial_payment(client: AsyncClient, db: AsyncSession, operator_user, client_user, courier_user, product, tenant):
    _, cli = client_user
    courier_u, courier = courier_user
    addr = await _make_address(db, cli.id, tenant.id)

    order_resp = await client.post("/api/v1/orders/", json={
        "client_id": str(cli.id),
        "address_id": str(addr.id),
        "items": [{"product_id": str(product.id), "quantity": 2}],  # 24000 total
    }, headers=auth_headers(operator_user))
    order_id = order_resp.json()["id"]

    await client.post(f"/api/v1/orders/{order_id}/assign", json={
        "courier_id": str(courier.id),
    }, headers=auth_headers(operator_user))

    await _give_courier_inventory(db, courier.id, product.id, tenant.id, qty=10)

    await client.post(f"/api/v1/orders/{order_id}/complete", json={
        "payment_type": "partial",
        "paid_amount": 10000,
        "containers_returned": 0,
    }, headers=auth_headers(courier_u))

    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one()
    assert order.payment_status == PaymentStatus.QISMAN
    assert order.debt_amount == 14000  # 24000 - 10000


@pytest.mark.asyncio
async def test_complete_order_overpayment_creates_advance(client: AsyncClient, db: AsyncSession, operator_user, client_user, courier_user, product, tenant):
    _, cli = client_user
    courier_u, courier = courier_user
    addr = await _make_address(db, cli.id, tenant.id)

    order_resp = await client.post("/api/v1/orders/", json={
        "client_id": str(cli.id),
        "address_id": str(addr.id),
        "items": [{"product_id": str(product.id), "quantity": 1}],  # 12000 total
    }, headers=auth_headers(operator_user))
    order_id = order_resp.json()["id"]

    await client.post(f"/api/v1/orders/{order_id}/assign", json={
        "courier_id": str(courier.id),
    }, headers=auth_headers(operator_user))

    await _give_courier_inventory(db, courier.id, product.id, tenant.id, qty=5)

    await client.post(f"/api/v1/orders/{order_id}/complete", json={
        "payment_type": "paid",
        "paid_amount": 15000,  # overpay by 3000
        "containers_returned": 0,
    }, headers=auth_headers(courier_u))

    await db.refresh(cli)
    assert cli.advance_amount >= 3000


@pytest.mark.asyncio
async def test_cancel_order(client: AsyncClient, db: AsyncSession, operator_user, client_user, product, tenant):
    _, cli = client_user
    addr = await _make_address(db, cli.id, tenant.id)

    order_resp = await client.post("/api/v1/orders/", json={
        "client_id": str(cli.id),
        "address_id": str(addr.id),
        "items": [{"product_id": str(product.id), "quantity": 1}],
    }, headers=auth_headers(operator_user))
    order_id = order_resp.json()["id"]

    cancel_resp = await client.post(f"/api/v1/orders/{order_id}/cancel", json={
        "reason": "Mijoz bekor qildi",
    }, headers=auth_headers(operator_user))

    assert cancel_resp.status_code == 200

    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one()
    assert order.status == OrderStatus.BEKOR_QILINDI


@pytest.mark.asyncio
async def test_problem_report(client: AsyncClient, db: AsyncSession, operator_user, client_user, courier_user, product, tenant):
    _, cli = client_user
    courier_u, courier = courier_user
    addr = await _make_address(db, cli.id, tenant.id)

    order_resp = await client.post("/api/v1/orders/", json={
        "client_id": str(cli.id),
        "address_id": str(addr.id),
        "items": [{"product_id": str(product.id), "quantity": 1}],
    }, headers=auth_headers(operator_user))
    order_id = order_resp.json()["id"]

    await client.post(f"/api/v1/orders/{order_id}/assign", json={
        "courier_id": str(courier.id),
    }, headers=auth_headers(operator_user))

    prob_resp = await client.post(f"/api/v1/orders/{order_id}/problem", json={
        "reason": "Mijoz eshik ochmadi",
    }, headers=auth_headers(courier_u))

    assert prob_resp.status_code == 200

    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one()
    assert order.status == OrderStatus.MUAMMO
