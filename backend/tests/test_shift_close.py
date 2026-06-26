"""
Tests: shift close splits actual_cash correctly across dates.

Correct algorithm:
- Earlier days get their actual order cash amount (capped by remaining actual_cash)
- Last day gets the remainder of actual_cash
- Total of all collections always equals actual_cash

Old bug: proportional distribution gave non-meaningful fractions like 89,536 / 357,464
         instead of meaningful splits like 132,000 / 315,000.
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
async def test_shift_close_splits_actual_cash_by_order_amounts(
    client: AsyncClient,
    db: AsyncSession,
    boshliq_user,
    courier_user,
    client_user,
    product,
    tenant,
):
    """
    Shift spans two Tashkent dates:
      - Day 1 orders: cash = 100,000
      - Day 2 orders: cash = 200,000

    actual_cash = 250,000 (total collected, less than orders total of 300,000).

    Expected split:
      - Day 1: min(100,000, remaining=250,000) = 100,000  (full order amount)
      - Day 2: remainder = 250,000 - 100,000 = 150,000

    Old proportional bug would give:
      - Day 1: round(250,000 * 100,000 / 300,000) = 83,333
      - Day 2: 250,000 - 83,333 = 166,667
    """
    _, courier = courier_user
    _, cli = client_user

    # Shift started 3 days ago
    shift_start = datetime.now(timezone.utc) - timedelta(days=3)
    courier.shift_status = ShiftStatus.OPEN
    courier.shift_started_at = shift_start
    courier.cash_balance = 250_000   # actual collected (orders generated 300k, balance reduced by expenses etc.)
    courier.card_balance = 0
    courier.payme_balance = 0
    await db.flush()

    # Day 1 orders: two days ago (different Tashkent calendar date from tomorrow)
    day1_utc = datetime.now(timezone.utc) - timedelta(days=2, hours=6)  # 2 days ago 06:00 UTC = 11:00 Tashkent
    for _ in range(2):
        db.add(Order(
            tenant_id=tenant.id, client_id=cli.id, courier_id=courier.id,
            status=OrderStatus.YETKAZILDI, payment_status=PaymentStatus.TOLANGAN,
            total_amount=50_000, cash_amount=50_000, card_amount=0, payme_amount=0,
            debt_amount=0, delivered_at=day1_utc,
        ))

    # Day 2 orders: yesterday (different Tashkent date)
    day2_utc = datetime.now(timezone.utc) - timedelta(days=1, hours=6)  # yesterday 06:00 UTC = 11:00 Tashkent
    for _ in range(4):
        db.add(Order(
            tenant_id=tenant.id, client_id=cli.id, courier_id=courier.id,
            status=OrderStatus.YETKAZILDI, payment_status=PaymentStatus.TOLANGAN,
            total_amount=50_000, cash_amount=50_000, card_amount=0, payme_amount=0,
            debt_amount=0, delivered_at=day2_utc,
        ))
    await db.flush()

    # Close shift: hand over 250,000 (matches cash_balance, no discrepancy → no Celery)
    resp = await client.post(
        f"/api/v1/couriers/{courier.id}/shift/close",
        json={
            "actual_cash": 250_000,
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
        select(CourierCashCollection)
        .where(CourierCashCollection.courier_id == courier.id)
        .order_by(CourierCashCollection.collection_date)
    )
    collections = result.scalars().all()

    assert len(collections) == 2

    total_recorded = sum(c.cash_amount for c in collections)
    assert total_recorded == 250_000, f"Total must equal actual_cash (250,000), got {total_recorded}"

    day1_col, day2_col = collections[0], collections[1]
    assert day1_col.cash_amount == 100_000, (
        f"Day 1 must get full order amount (100,000), got {day1_col.cash_amount}"
    )
    assert day2_col.cash_amount == 150_000, (
        f"Day 2 must get remainder (150,000), got {day2_col.cash_amount}"
    )
