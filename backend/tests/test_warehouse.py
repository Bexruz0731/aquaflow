"""Tests: warehouse stock management."""
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.warehouse import WarehouseItem, WarehouseStock, WarehouseTransaction
from tests.conftest import auth_headers


async def _create_warehouse_item(db: AsyncSession, tenant_id, product_id, name: str):
    item = WarehouseItem(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        product_id=product_id,
        name=name,
        unit="ta",
        low_threshold=10,
        out_threshold=3,
    )
    db.add(item)
    await db.flush()

    stock = WarehouseStock(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        item_id=item.id,
        quantity=100,
        empty_quantity=100,
    )
    db.add(stock)
    await db.flush()
    return item, stock


@pytest.mark.asyncio
async def test_get_warehouse_stock(client: AsyncClient, operator_user, product, tenant, db):
    await _create_warehouse_item(db, tenant.id, product.id, "Suv 18.9L (to'la)")

    resp = await client.get("/api/v1/warehouse/stock", headers=auth_headers(operator_user))
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_warehouse_kirim(client: AsyncClient, operator_user, product, tenant, db):
    item, stock = await _create_warehouse_item(db, tenant.id, product.id, "Suv 18.9L (bo'sh)")
    initial_qty = stock.quantity

    resp = await client.post("/api/v1/warehouse/transactions", json={
        "item_id": str(item.id),
        "transaction_type": "kirim",
        "quantity": 50,
        "note": "Zavoddan tushirildi",
    }, headers=auth_headers(operator_user))

    assert resp.status_code in (200, 201)

    await db.refresh(stock)
    assert stock.quantity == initial_qty + 50


@pytest.mark.asyncio
async def test_warehouse_chiqim(client: AsyncClient, operator_user, product, tenant, db):
    item, stock = await _create_warehouse_item(db, tenant.id, product.id, "Suv 5L")
    initial_qty = stock.quantity

    resp = await client.post("/api/v1/warehouse/transactions", json={
        "item_id": str(item.id),
        "transaction_type": "chiqim",
        "quantity": 20,
        "note": "Kuryer uchun",
    }, headers=auth_headers(operator_user))

    assert resp.status_code in (200, 201)

    await db.refresh(stock)
    assert stock.quantity == initial_qty - 20


@pytest.mark.asyncio
async def test_warehouse_chiqim_insufficient(client: AsyncClient, operator_user, product, tenant, db):
    """Cannot take more than available stock."""
    item, stock = await _create_warehouse_item(db, tenant.id, product.id, "Suv 10L")

    resp = await client.post("/api/v1/warehouse/transactions", json={
        "item_id": str(item.id),
        "transaction_type": "chiqim",
        "quantity": stock.quantity + 9999,
        "note": "Too much",
    }, headers=auth_headers(operator_user))

    assert resp.status_code in (400, 422)
