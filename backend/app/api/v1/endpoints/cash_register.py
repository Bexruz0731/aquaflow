from datetime import datetime, date
from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import joinedload

from app.db.base import get_db
from app.core.deps import get_current_user, require_boshliq
from app.models.user import User
from app.models.finance import CourierCashCollection
from app.models.courier import Courier
from app.schemas.cash_register import CourierCashCollectionResponse

router = APIRouter()


@router.get("/collections", response_model=List[CourierCashCollectionResponse])
async def get_cash_collections(
    start_date: date | None = Query(None, description="Filter from this date"),
    end_date: date | None = Query(None, description="Filter to this date"),
    courier_id: UUID | None = Query(None, description="Filter by courier"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    """Get list of cash collections from couriers."""
    query = select(CourierCashCollection).where(
        CourierCashCollection.tenant_id == user.tenant_id
    )

    if start_date:
        start_datetime = datetime.combine(start_date, datetime.min.time())
        query = query.where(CourierCashCollection.collection_date >= start_datetime)

    if end_date:
        end_datetime = datetime.combine(end_date, datetime.max.time())
        query = query.where(CourierCashCollection.collection_date <= end_datetime)

    if courier_id:
        query = query.where(CourierCashCollection.courier_id == courier_id)

    query = query.order_by(desc(CourierCashCollection.collection_date))
    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(query)
    collections = result.scalars().all()

    # Load courier names
    courier_ids = [c.courier_id for c in collections]
    if courier_ids:
        courier_result = await db.execute(
            select(Courier).options(joinedload(Courier.user)).where(Courier.id.in_(courier_ids))
        )
        couriers = {c.id: c for c in courier_result.scalars().all()}
    else:
        couriers = {}

    # Load collected_by names
    collected_by_ids = [c.collected_by_id for c in collections if c.collected_by_id]
    if collected_by_ids:
        from app.models.user import User as UserModel
        user_result = await db.execute(
            select(UserModel).where(UserModel.id.in_(collected_by_ids))
        )
        users = {u.id: u for u in user_result.scalars().all()}
    else:
        users = {}

    response = []
    for collection in collections:
        courier = couriers.get(collection.courier_id)
        courier_name = None
        if courier and courier.user:
            courier_name = f"{courier.user.first_name} {courier.user.last_name or ''}".strip()

        collected_by_user = users.get(collection.collected_by_id) if collection.collected_by_id else None
        collected_by_name = None
        if collected_by_user:
            collected_by_name = f"{collected_by_user.first_name} {collected_by_user.last_name or ''}".strip()

        response.append(
            CourierCashCollectionResponse(
                id=collection.id,
                tenant_id=collection.tenant_id,
                courier_id=collection.courier_id,
                collected_by_id=collection.collected_by_id,
                cash_amount=collection.cash_amount,
                card_amount=collection.card_amount,
                total_amount=collection.total_amount,
                full_containers_returned=collection.full_containers_returned,
                empty_containers_returned=collection.empty_containers_returned,
                orders_completed=collection.orders_completed,
                note=collection.note,
                collection_date=collection.collection_date,
                courier_name=courier_name,
                collected_by_name=collected_by_name,
            )
        )

    return response


@router.get("/collections/summary")
async def get_cash_summary(
    start_date: date | None = Query(None, description="Filter from this date"),
    end_date: date | None = Query(None, description="Filter to this date"),
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    """Get summary of cash collections."""
    from sqlalchemy import func

    query = select(
        func.sum(CourierCashCollection.cash_amount).label("total_cash"),
        func.sum(CourierCashCollection.card_amount).label("total_card"),
        func.sum(CourierCashCollection.total_amount).label("total_all"),
        func.count(CourierCashCollection.id).label("collection_count"),
        func.sum(CourierCashCollection.orders_completed).label("total_orders"),
    ).where(CourierCashCollection.tenant_id == user.tenant_id)

    if start_date:
        start_datetime = datetime.combine(start_date, datetime.min.time())
        query = query.where(CourierCashCollection.collection_date >= start_datetime)

    if end_date:
        end_datetime = datetime.combine(end_date, datetime.max.time())
        query = query.where(CourierCashCollection.collection_date <= end_datetime)

    result = await db.execute(query)
    row = result.one()

    return {
        "total_cash": row.total_cash or 0,
        "total_card": row.total_card or 0,
        "total_all": row.total_all or 0,
        "collection_count": row.collection_count or 0,
        "total_orders": row.total_orders or 0,
    }
