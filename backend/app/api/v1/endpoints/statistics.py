from typing import Optional
from datetime import date, datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.db.base import get_db
from app.core.deps import require_agent as require_operator
from app.models.user import User
from app.models.order import Order, OrderStatus, PaymentMethod
from app.models.client import Client
from app.models.courier import Courier


router = APIRouter()


@router.get("/dashboard")
async def dashboard(
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    TASHKENT = timezone(timedelta(hours=5))
    today = datetime.now(TASHKENT).date()
    today_start = datetime(today.year, today.month, today.day, tzinfo=TASHKENT)
    today_end = datetime(today.year, today.month, today.day, 23, 59, 59, tzinfo=TASHKENT)

    # Today orders (exclude deleted)
    today_orders = (await db.execute(
        select(func.count(Order.id)).where(
            Order.tenant_id == user.tenant_id,
            Order.is_deleted == False,
            Order.created_at >= today_start,
            Order.created_at <= today_end,
        )
    )).scalar_one()

    # Total clients (exclude soft-deleted)
    total_clients = (await db.execute(
        select(func.count(Client.id)).where(
            Client.tenant_id == user.tenant_id,
            Client.is_deleted == False,
        )
    )).scalar_one()

    # Active employees
    from app.models.user import UserRole
    active_staff = (await db.execute(
        select(func.count(User.id)).where(
            User.tenant_id == user.tenant_id,
            User.role.in_([UserRole.OPERATOR, UserRole.COURIER, UserRole.BOSHLIQ]),
            User.is_active == True,
        )
    )).scalar_one()

    # Active clients (ordered in last 30 days, exclude deleted orders, exclude walkin nulls)
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    active_clients_subq = select(Order.client_id).where(
        Order.tenant_id == user.tenant_id,
        Order.is_deleted == False,
        Order.client_id.isnot(None),
        Order.created_at >= thirty_days_ago,
    ).distinct()
    active_clients = (await db.execute(select(func.count()).select_from(active_clients_subq.subquery()))).scalar_one()

    # Last 5 orders (exclude deleted)
    recent_result = await db.execute(
        select(Order)
        .where(Order.tenant_id == user.tenant_id, Order.is_deleted == False)
        .order_by(Order.created_at.desc())
        .limit(5)
    )
    recent_orders = recent_result.scalars().all()

    return {
        "today_orders": today_orders,
        "total_clients": total_clients,
        "active_staff": active_staff,
        "active_clients": active_clients,
        "recent_orders": recent_orders,
    }


@router.get("/weekly")
async def weekly_stats(
    period: str = Query("weekly", pattern="^(weekly|monthly|yearly)$"),
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Revenue data for bar/area chart."""
    TASHKENT = timezone(timedelta(hours=5))
    now = datetime.now(TASHKENT)

    # Only delivered orders count as real revenue
    base_where = and_(
        Order.tenant_id == user.tenant_id,
        Order.is_deleted == False,
        Order.status == OrderStatus.YETKAZILDI,
    )

    # Group by date in Tashkent timezone
    day_expr = func.date(Order.created_at.op("AT TIME ZONE")("Asia/Tashkent"))

    if period == "weekly":
        points = [(now - timedelta(days=i)).date() for i in range(6, -1, -1)]
        since = datetime(points[0].year, points[0].month, points[0].day, tzinfo=TASHKENT)
        result = await db.execute(
            select(
                day_expr.label("day"),
                func.sum(Order.total_amount - Order.discount_amount).label("revenue"),
                func.count(Order.id).label("count"),
            )
            .where(base_where, Order.created_at >= since)
            .group_by(day_expr)
        )
        rows = {str(r.day): {"revenue": r.revenue or 0, "count": r.count} for r in result.all()}
        data = [{"date": str(p), "revenue": rows.get(str(p), {}).get("revenue", 0), "count": rows.get(str(p), {}).get("count", 0)} for p in points]

    elif period == "monthly":
        points = [(now - timedelta(days=i)).date() for i in range(29, -1, -1)]
        since = datetime(points[0].year, points[0].month, points[0].day, tzinfo=TASHKENT)
        result = await db.execute(
            select(
                day_expr.label("day"),
                func.sum(Order.total_amount - Order.discount_amount).label("revenue"),
                func.count(Order.id).label("count"),
            )
            .where(base_where, Order.created_at >= since)
            .group_by(day_expr)
        )
        rows = {str(r.day): {"revenue": r.revenue or 0, "count": r.count} for r in result.all()}
        data = [{"date": str(p), "revenue": rows.get(str(p), {}).get("revenue", 0), "count": rows.get(str(p), {}).get("count", 0)} for p in points]

    elif period == "yearly":
        from datetime import date as date_cls
        points = []
        for i in range(11, -1, -1):
            month = now.month - i
            year = now.year
            while month <= 0:
                month += 12
                year -= 1
            points.append(date_cls(year, month, 1))

        start_point = points[0]
        month_label = func.to_char(Order.created_at.op("AT TIME ZONE")("Asia/Tashkent"), "YYYY-MM")
        result = await db.execute(
            select(
                month_label.label("month"),
                func.sum(Order.total_amount - Order.discount_amount).label("revenue"),
                func.count(Order.id).label("count"),
            )
            .where(base_where, Order.created_at >= datetime(start_point.year, start_point.month, 1, tzinfo=TASHKENT))
            .group_by(month_label)
        )
        rows = {r.month: {"revenue": r.revenue or 0, "count": r.count} for r in result.all()}
        data = [{"date": str(p), "revenue": rows.get(p.strftime("%Y-%m"), {}).get("revenue", 0), "count": rows.get(p.strftime("%Y-%m"), {}).get("count", 0)} for p in points]

    return {"period": period, "data": data}


@router.get("/orders-by-status")
async def orders_by_status(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Data for donut chart."""
    query = select(Order.status, func.count(Order.id)).where(
        Order.tenant_id == user.tenant_id,
        Order.is_deleted == False,
    )
    if date_from:
        query = query.where(Order.created_at >= datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc))
    if date_to:
        query = query.where(Order.created_at <= datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=timezone.utc))

    result = await db.execute(query.group_by(Order.status))
    return [{"status": row[0], "count": row[1]} for row in result.all()]


@router.get("/")
async def statistics(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Report summary stats for the given date range."""
    TASHKENT = timezone(timedelta(hours=5))
    now = datetime.now(TASHKENT)
    today = now.date()

    year_start = datetime(now.year, 1, 1, tzinfo=TASHKENT)
    month_start = datetime(now.year, now.month, 1, tzinfo=TASHKENT)
    week_start = datetime(today.year, today.month, today.day, tzinfo=TASHKENT) - timedelta(days=today.weekday())
    today_start = datetime(today.year, today.month, today.day, tzinfo=TASHKENT)

    start = datetime(date_from.year, date_from.month, date_from.day, tzinfo=TASHKENT) if date_from else year_start
    end = datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=TASHKENT) if date_to else now

    delivered = and_(
        Order.tenant_id == user.tenant_id,
        Order.is_deleted == False,
        Order.status == OrderStatus.YETKAZILDI,
    )

    base = and_(Order.tenant_id == user.tenant_id, Order.is_deleted == False, Order.created_at >= start, Order.created_at <= end)

    def rev_query(start_dt, end_dt=None):
        cond = and_(delivered, Order.created_at >= start_dt)
        if end_dt:
            cond = and_(cond, Order.created_at <= end_dt)
        return select(func.coalesce(func.sum(Order.total_amount - Order.discount_amount), 0)).where(cond)

    revenue_today = (await db.execute(rev_query(today_start))).scalar_one() or 0
    revenue_week  = (await db.execute(rev_query(week_start))).scalar_one() or 0
    revenue_month = (await db.execute(rev_query(month_start))).scalar_one() or 0
    revenue_year  = (await db.execute(rev_query(year_start))).scalar_one() or 0

    total_orders = (await db.execute(select(func.count(Order.id)).where(base))).scalar_one() or 0
    completed_orders = (await db.execute(
        select(func.count(Order.id)).where(base, Order.status == OrderStatus.YETKAZILDI)
    )).scalar_one() or 0
    cancelled_orders = (await db.execute(
        select(func.count(Order.id)).where(base, Order.status == OrderStatus.BEKOR_QILINDI)
    )).scalar_one() or 0
    total_revenue = (await db.execute(
        select(func.coalesce(func.sum(Order.total_amount - Order.discount_amount), 0)).where(base, Order.status == OrderStatus.YETKAZILDI)
    )).scalar_one() or 0
    total_debt = (await db.execute(
        select(func.coalesce(func.sum(Order.debt_amount), 0)).where(base)
    )).scalar_one() or 0
    new_clients = (await db.execute(
        select(func.count(Client.id)).where(
            Client.tenant_id == user.tenant_id,
            Client.created_at >= start,
            Client.created_at <= end,
        )
    )).scalar_one() or 0

    return {
        "revenue_today": revenue_today,
        "revenue_week": revenue_week,
        "revenue_month": revenue_month,
        "revenue_year": revenue_year,
        "total_orders": total_orders,
        "completed_orders": completed_orders,
        "cancelled_orders": cancelled_orders,
        "total_revenue": total_revenue,
        "total_debt": total_debt,
        "new_clients": new_clients,
        "orders_count": total_orders,
        "clients_count": new_clients,
    }


@router.get("/financial-dashboard")
async def financial_dashboard(
    date_from: str | None = None,
    date_to: str | None = None,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Detailed financial information for business owner dashboard."""
    TASHKENT = timezone(timedelta(hours=5))
    today = datetime.now(TASHKENT).date()

    try:
        period_start_date = datetime.strptime(date_from, "%Y-%m-%d").date() if date_from else today
        period_end_date = datetime.strptime(date_to, "%Y-%m-%d").date() if date_to else today
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="date_from/date_to must be YYYY-MM-DD")

    period_start = datetime(period_start_date.year, period_start_date.month, period_start_date.day, tzinfo=TASHKENT)
    period_end = datetime(period_end_date.year, period_end_date.month, period_end_date.day, 23, 59, 59, tzinfo=TASHKENT)
    today_start = datetime(today.year, today.month, today.day, tzinfo=TASHKENT)

    # Base filter reused everywhere (excludes deleted)
    not_deleted = and_(Order.tenant_id == user.tenant_id, Order.is_deleted == False)
    delivered = and_(not_deleted, Order.status == OrderStatus.YETKAZILDI)

    total_revenue = (await db.execute(
        select(func.coalesce(func.sum(Order.total_amount - Order.discount_amount), 0))
        .where(delivered)
    )).scalar_one()

    period_revenue = (await db.execute(
        select(func.coalesce(func.sum(Order.total_amount - Order.discount_amount), 0))
        .where(delivered, Order.created_at >= period_start, Order.created_at <= period_end)
    )).scalar_one()

    today_revenue = (await db.execute(
        select(func.coalesce(func.sum(Order.total_amount - Order.discount_amount), 0))
        .where(delivered, Order.created_at >= today_start)
    )).scalar_one()

    cash_collected = (await db.execute(
        select(func.coalesce(func.sum(Order.cash_amount), 0)).where(delivered)
    )).scalar_one()

    card_collected = (await db.execute(
        select(func.coalesce(func.sum(Order.card_amount), 0)).where(delivered)
    )).scalar_one()

    period_cash = (await db.execute(
        select(func.coalesce(func.sum(Order.cash_amount), 0))
        .where(delivered, Order.created_at >= period_start, Order.created_at <= period_end)
    )).scalar_one()

    period_card = (await db.execute(
        select(func.coalesce(func.sum(Order.card_amount), 0))
        .where(delivered, Order.created_at >= period_start, Order.created_at <= period_end)
    )).scalar_one()

    period_payme = (await db.execute(
        select(func.coalesce(func.sum(Order.payme_amount), 0))
        .where(delivered, Order.created_at >= period_start, Order.created_at <= period_end)
    )).scalar_one()

    period_debts = (await db.execute(
        select(func.coalesce(func.sum(Order.debt_amount), 0))
        .where(not_deleted, Order.created_at >= period_start, Order.created_at <= period_end)
    )).scalar_one()

    today_cash = (await db.execute(
        select(func.coalesce(func.sum(Order.cash_amount), 0))
        .where(delivered, Order.created_at >= today_start)
    )).scalar_one()

    today_card = (await db.execute(
        select(func.coalesce(func.sum(Order.card_amount), 0))
        .where(delivered, Order.created_at >= today_start)
    )).scalar_one()

    payme_collected = (await db.execute(
        select(func.coalesce(func.sum(Order.payme_amount), 0)).where(delivered)
    )).scalar_one()

    today_payme = (await db.execute(
        select(func.coalesce(func.sum(Order.payme_amount), 0))
        .where(delivered, Order.created_at >= today_start)
    )).scalar_one()

    today_debts = (await db.execute(
        select(func.coalesce(func.sum(Order.debt_amount), 0))
        .where(not_deleted, Order.created_at >= today_start)
    )).scalar_one()

    total_debts = (await db.execute(
        select(func.coalesce(func.sum(Client.debt_amount), 0))
        .where(Client.tenant_id == user.tenant_id)
    )).scalar_one()

    # Money at couriers (not yet deposited)
    couriers_result = await db.execute(
        select(Courier, User)
        .join(User, User.id == Courier.user_id)
        .where(Courier.tenant_id == user.tenant_id, Courier.is_active == True)
    )
    courier_rows = couriers_result.all()
    couriers = [row[0] for row in courier_rows]

    courier_cash_total = sum(c.cash_balance for c in couriers)
    courier_card_total = sum(c.card_balance for c in couriers)
    courier_payme_total = sum(c.payme_balance for c in couriers)

    courier_balances = [
        {
            "courier_id": str(c.id),
            "user_id": str(c.user_id),
            "courier_name": f"{u.first_name} {u.last_name or ''}".strip(),
            "cash_balance": c.cash_balance,
            "card_balance": c.card_balance,
            "payme_balance": c.payme_balance,
            "total_balance": c.cash_balance + c.card_balance + c.payme_balance,
        }
        for c, u in courier_rows if (c.cash_balance + c.card_balance + c.payme_balance) > 0
    ]

    # Courier expenses for the period
    from app.models.courier import CourierExpense
    from app.models.finance import AdminExpense, CourierCashCollection

    period_courier_expenses = (await db.execute(
        select(func.coalesce(func.sum(CourierExpense.amount), 0))
        .where(
            CourierExpense.tenant_id == user.tenant_id,
            CourierExpense.created_at >= period_start,
            CourierExpense.created_at <= period_end,
        )
    )).scalar_one()

    period_admin_expenses = (await db.execute(
        select(func.coalesce(func.sum(AdminExpense.amount), 0))
        .where(
            AdminExpense.tenant_id == user.tenant_id,
            AdminExpense.created_at >= period_start,
            AdminExpense.created_at <= period_end,
        )
    )).scalar_one()

    # Kassa — deposited money (CourierCashCollection)
    cash_register_cash = (await db.execute(
        select(func.coalesce(func.sum(CourierCashCollection.cash_amount), 0))
        .where(
            CourierCashCollection.tenant_id == user.tenant_id,
            CourierCashCollection.collection_date >= period_start,
            CourierCashCollection.collection_date <= period_end,
        )
    )).scalar_one()

    cash_register_card = (await db.execute(
        select(func.coalesce(func.sum(CourierCashCollection.card_amount), 0))
        .where(
            CourierCashCollection.tenant_id == user.tenant_id,
            CourierCashCollection.collection_date >= period_start,
            CourierCashCollection.collection_date <= period_end,
        )
    )).scalar_one()

    cash_register_payme = (await db.execute(
        select(func.coalesce(func.sum(CourierCashCollection.payme_amount), 0))
        .where(
            CourierCashCollection.tenant_id == user.tenant_id,
            CourierCashCollection.collection_date >= period_start,
            CourierCashCollection.collection_date <= period_end,
        )
    )).scalar_one()

    period_expenses_total = period_courier_expenses + period_admin_expenses

    return {
        "date_from": period_start_date.isoformat(),
        "date_to": period_end_date.isoformat(),
        "total_revenue": total_revenue,
        "today_revenue": today_revenue,
        "period_revenue": period_revenue,
        "period_cash": period_cash,
        "period_card": period_card,
        "period_payme": period_payme,
        "period_collected": period_cash + period_card + period_payme,
        "period_debts": period_debts,
        "period_courier_expenses": period_courier_expenses,
        "period_admin_expenses": period_admin_expenses,
        "period_expenses": period_expenses_total,
        "cash_collected": cash_collected,
        "card_collected": card_collected,
        "payme_collected": payme_collected,
        "total_collected": cash_collected + card_collected + payme_collected,
        "today_cash": today_cash,
        "today_card": today_card,
        "today_payme": today_payme,
        "today_collected": today_cash + today_card + today_payme,
        "total_debts": total_debts,
        "today_debts": today_debts,
        "courier_cash": courier_cash_total,
        "courier_card": courier_card_total,
        "courier_payme": courier_payme_total,
        "courier_total": courier_cash_total + courier_card_total + courier_payme_total,
        "courier_balances": courier_balances,
        "cash_register_cash": cash_register_cash,
        "cash_register_card": cash_register_card,
        "cash_register_payme": cash_register_payme,
        "cash_register_total": cash_register_cash + cash_register_card + cash_register_payme,
    }
