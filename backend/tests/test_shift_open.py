"""
Tests: shift open by boshliq preserves inter-shift cash balance.

Bug: opening a shift resets cash_balance to 0, wiping money from deliveries
made after the previous shift close but before the new shift opens.
"""
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.courier import Courier, ShiftStatus
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_shift_open_preserves_intershift_balance(
    client: AsyncClient,
    db: AsyncSession,
    boshliq_user,
    courier_user,
):
    """
    Courier has cash from a delivery made after shift close (inter-shift).
    Opening a new shift must NOT wipe that cash.
    """
    _, courier = courier_user

    # Simulate state after inter-shift delivery: shift closed, balance > 0
    courier.shift_status = ShiftStatus.CLOSED
    courier.cash_balance = 49_000
    courier.card_balance = 0
    await db.flush()

    resp = await client.post(
        f"/api/v1/couriers/{courier.id}/shift/open",
        json={"full_containers": 0},
        headers=auth_headers(boshliq_user),
    )
    assert resp.status_code == 200

    await db.refresh(courier)
    assert courier.cash_balance == 49_000, (
        f"Inter-shift cash must be preserved, got {courier.cash_balance}"
    )


@pytest.mark.asyncio
async def test_shift_open_from_zero_balance_stays_zero(
    client: AsyncClient,
    db: AsyncSession,
    boshliq_user,
    courier_user,
):
    """Normal case: shift opens with no inter-shift deliveries — balance stays 0."""
    _, courier = courier_user

    courier.shift_status = ShiftStatus.CLOSED
    courier.cash_balance = 0
    courier.card_balance = 0
    await db.flush()

    resp = await client.post(
        f"/api/v1/couriers/{courier.id}/shift/open",
        json={"full_containers": 0},
        headers=auth_headers(boshliq_user),
    )
    assert resp.status_code == 200

    await db.refresh(courier)
    assert courier.cash_balance == 0
    assert courier.card_balance == 0
