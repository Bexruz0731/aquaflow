"""
Tests: shift close records actual per-day order amounts, not proportional distribution.

Bug: shift close distributed actual_cash proportionally across dates, producing
figures like 89,536 / 357,464 instead of the real per-day order amounts.
Also: when courier balance includes inter-shift money, old code recorded the full
balance (actual_cash) as the collection amount instead of the shift-only order sum.
"""
import uuid
from datetime import datetime, timezone, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.courier import Courier, ShiftStatus
from app.models.order import Order, OrderStatus, PaymentStatus
from app.models.finance import CourierCashCollection
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_shift_close_records_order_amounts_not_balance(
    client: AsyncClient,
    db: AsyncSession,
    boshliq_user,
    courier_user,
    client_user,
    product,
    tenant,
):
    """
    Courier has 10,000 from inter-shift delivery plus 20,000 from current-shift orders
    = 30,000 total cash_balance.  actual_cash handed over = 30,000 (no discrepancy).

    CourierCashCollection must record the ORDER amount (20,000), not the full balance.

    Old code: d_cash = rem_cash = actual_cash = 30,000  ← wrong (includes inter-shift)
    New code: d_cash = grp['cash'] = 20,000             ← correct (shift orders only)
    """
    _, courier = courier_user
    _, cli = client_user

    shift_start = datetime.now(timezone.utc) - timedelta(hours=2)
    courier.shift_status = ShiftStatus.OPEN
    courier.shift_started_at = shift_start
    # Balance includes 10k from an inter-shift delivery before shift opened
    courier.cash_balance = 30_000
    courier.card_balance = 0
    courier.payme_balance = 0
    await db.flush()

    # Two delivered orders during this shift, each paying 10,000 cash (total 20,000)
    now_utc = datetime.now(timezone.utc)
    for _ in range(2):
        order = Order(
            tenant_id=tenant.id,
            client_id=cli.id,
            courier_id=courier.id,
            status=OrderStatus.YETKAZILDI,
            payment_status=PaymentStatus.TOLANGAN,
            total_amount=10_000,
            cash_amount=10_000,
            card_amount=0,
            payme_amount=0,
            debt_amount=0,
            delivered_at=now_utc,
        )
        db.add(order)
    await db.flush()

    # Close shift: hand over all 30,000 (actual_cash == cash_balance → no discrepancy)
    resp = await client.post(
        f"/api/v1/couriers/{courier.id}/shift/close",
        json={
            "actual_cash": 30_000,
            "actual_card": 0,
            "actual_payme": 0,
            "actual_full_containers": 0,
            "actual_empty_containers": 0,
            "return_goods": False,
        },
        headers=auth_headers(boshliq_user),
    )
    assert resp.status_code == 200, resp.text

    result = await db.execute(
        select(CourierCashCollection).where(
            CourierCashCollection.courier_id == courier.id
        )
    )
    collections = result.scalars().all()

    assert len(collections) == 1
    total_recorded = sum(c.cash_amount for c in collections)
    assert total_recorded == 20_000, (
        f"Collection must equal order amounts (20,000), got {total_recorded}"
    )
