from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.db.base import get_db
from app.core.deps import require_operator, require_agent
from app.models.user import User
from app.models.warehouse import WarehouseItem, WarehouseStock, WarehouseTransaction, WarehouseTransactionType

router = APIRouter()


class WarehouseTransactionCreate(BaseModel):
    item_id: UUID
    transaction_type: WarehouseTransactionType
    quantity: int
    courier_id: Optional[UUID] = None
    note: Optional[str] = None


class StockByProductRequest(BaseModel):
    product_id: UUID
    quantity: int
    transaction_type: WarehouseTransactionType = WarehouseTransactionType.KIRIM
    courier_id: Optional[UUID] = None
    note: Optional[str] = None

class EmptyContainerRequest(BaseModel):
    product_id: UUID
    quantity: int
    transaction_type: WarehouseTransactionType = WarehouseTransactionType.KIRIM
    note: Optional[str] = None


@router.get("/stock")
async def get_stock(
    user: User = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
):
    """Current warehouse stock with status indicators."""
    from app.models.product import Product
    from app.models.order import Order

    result = await db.execute(
        select(WarehouseItem, WarehouseStock, Product)
        .join(WarehouseStock, WarehouseStock.item_id == WarehouseItem.id)
        .outerjoin(Product, Product.id == WarehouseItem.product_id)
        .where(
            WarehouseItem.tenant_id == user.tenant_id,
            (Product.is_deleted == False) | (WarehouseItem.product_id == None),
        )
        .order_by(WarehouseItem.name)
    )
    rows = result.all()

    from app.models.client import Client
    from app.models.order import OrderItem
    from app.models.courier import CourierInventory, Courier

    # Total containers at clients (global — not per product in DB)
    total_client_containers: int = (await db.execute(
        select(func.coalesce(func.sum(Client.container_balance), 0))
        .where(Client.tenant_id == user.tenant_id)
    )).scalar_one()

    # Primary returnable product (most orders) — assign all client containers to it
    primary_returnable_id = (await db.execute(
        select(Product.id)
        .join(OrderItem, OrderItem.product_id == Product.id)
        .where(Product.tenant_id == user.tenant_id, Product.is_returnable_container == True)
        .group_by(Product.id)
        .order_by(func.count(OrderItem.id).desc())
        .limit(1)
    )).scalar_one_or_none()

    # Per-product courier inventory
    courier_inv_rows = (await db.execute(
        select(CourierInventory.product_id, func.sum(CourierInventory.quantity).label("total"))
        .join(Courier, Courier.id == CourierInventory.courier_id)
        .where(CourierInventory.tenant_id == user.tenant_id, Courier.is_active == True)
        .group_by(CourierInventory.product_id)
    )).all()
    courier_by_product: dict = {str(r.product_id): int(r.total) for r in courier_inv_rows}

    items = []
    for item, stock, product in rows:
        if stock.quantity <= item.out_threshold:
            status = "out"
        elif stock.quantity <= item.low_threshold:
            status = "low"
        else:
            status = "ok"

        is_returnable = product.is_returnable_container if product else False
        is_primary = item.product_id and str(item.product_id) == str(primary_returnable_id)
        at_clients = total_client_containers if is_primary else 0
        with_couriers = courier_by_product.get(str(item.product_id), 0) if item.product_id else 0

        item_data = {
            "item_id": str(item.id),
            "product_id": str(item.product_id) if item.product_id else None,
            "name": item.name,
            "unit": item.unit,
            "quantity": stock.quantity,
            "empty_quantity": stock.empty_quantity,
            "client_containers": at_clients,
            "with_couriers": with_couriers,
            "total": stock.quantity + stock.empty_quantity + at_clients + with_couriers if is_returnable else stock.quantity + with_couriers,
            "low_threshold": item.low_threshold,
            "out_threshold": item.out_threshold,
            "status": status,
            "is_container": item.is_container,
            "is_returnable": is_returnable,
        }
        items.append(item_data)

    return items


async def _get_or_create_warehouse_item(product_id: UUID, tenant_id: UUID, db: AsyncSession) -> tuple:
    """Get existing warehouse item for product, or create one. Returns (item, stock)."""
    from app.models.product import Product

    result = await db.execute(
        select(WarehouseItem, WarehouseStock)
        .join(WarehouseStock, WarehouseStock.item_id == WarehouseItem.id)
        .where(WarehouseItem.product_id == product_id, WarehouseItem.tenant_id == tenant_id)
        .with_for_update()
    )
    row = result.first()
    if row:
        return row[0], row[1]

    # Create new warehouse item from product
    prod_r = await db.execute(select(Product).where(Product.id == product_id, Product.tenant_id == tenant_id))
    product = prod_r.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    item = WarehouseItem(
        tenant_id=tenant_id,
        product_id=product_id,
        name=product.name,
        unit="ta",
        is_container=product.is_returnable_container,
    )
    db.add(item)
    await db.flush()

    stock = WarehouseStock(tenant_id=tenant_id, item_id=item.id, quantity=0)
    db.add(stock)
    await db.flush()

    return item, stock


@router.post("/transactions/by-product", status_code=201)
async def create_transaction_by_product(
    data: StockByProductRequest,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Add or remove stock using product_id — auto-creates warehouse item if needed."""
    from app.models.product import Product

    # Get product to check if it's returnable
    prod_result = await db.execute(
        select(Product).where(Product.id == data.product_id, Product.tenant_id == user.tenant_id)
    )
    product = prod_result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    item, stock = await _get_or_create_warehouse_item(data.product_id, user.tenant_id, db)

    # Capture balance before any mutation (fix: was undefined in returnable branch)
    balance_before = stock.quantity

    # For returnable products, validate empty containers when adding finished product
    if data.transaction_type == WarehouseTransactionType.KIRIM and product.is_returnable_container:
        containers_needed = data.quantity * product.containers_per_unit

        if stock.empty_quantity < containers_needed:
            raise HTTPException(
                status_code=400,
                detail=f"Yetarli tara yo'q. Kerak: {containers_needed} ta, Mavjud: {stock.empty_quantity} ta"
            )

        # Deduct empty containers and add finished products
        stock.empty_quantity -= containers_needed
        stock.quantity += data.quantity
    else:
        # Regular product without container tracking
        if data.transaction_type == WarehouseTransactionType.KIRIM:
            stock.quantity += data.quantity
        else:
            if stock.quantity < data.quantity:
                raise HTTPException(status_code=400, detail=f"Yetarli zaxira yo'q: {stock.quantity} ta mavjud")
            stock.quantity -= data.quantity

    tx = WarehouseTransaction(
        tenant_id=user.tenant_id,
        item_id=item.id,
        courier_id=data.courier_id,
        created_by_id=user.id,
        transaction_type=data.transaction_type,
        quantity=data.quantity,
        balance_before=balance_before,
        balance_after=stock.quantity,
        note=data.note,
    )
    db.add(tx)
    await db.flush()

    return {
        "transaction_id": str(tx.id),
        "item_id": str(item.id),
        "balance_before": balance_before,
        "balance_after": stock.quantity,
    }


@router.post("/transactions", status_code=201)
async def create_transaction(
    data: WarehouseTransactionCreate,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    from app.models.product import Product

    result = await db.execute(
        select(WarehouseStock, WarehouseItem)
        .join(WarehouseItem, WarehouseItem.id == WarehouseStock.item_id)
        .where(WarehouseStock.item_id == data.item_id, WarehouseStock.tenant_id == user.tenant_id)
        .with_for_update()
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Stock record not found for this item")

    stock, item = row

    # Check if this is a returnable product
    product = None
    if item.product_id:
        prod_result = await db.execute(
            select(Product).where(Product.id == item.product_id, Product.tenant_id == user.tenant_id)
        )
        product = prod_result.scalar_one_or_none()

    balance_before = stock.quantity

    # Production logic for returnable containers
    if data.transaction_type == WarehouseTransactionType.KIRIM and product and product.is_returnable_container:
        containers_needed = data.quantity * product.containers_per_unit

        if stock.empty_quantity < containers_needed:
            raise HTTPException(
                status_code=400,
                detail=f"Yetarli bo'sh tara yo'q! Kerak: {containers_needed} ta, Mavjud: {stock.empty_quantity} ta"
            )

        # Deduct empty containers and add finished products
        stock.empty_quantity -= containers_needed
        stock.quantity += data.quantity
    elif data.transaction_type == WarehouseTransactionType.KIRIM:
        stock.quantity += data.quantity
    else:
        if stock.quantity < data.quantity:
            raise HTTPException(status_code=400, detail=f"Yetarli mahsulot yo'q: {stock.quantity} ta mavjud")
        stock.quantity -= data.quantity

    tx = WarehouseTransaction(
        tenant_id=user.tenant_id,
        item_id=data.item_id,
        courier_id=data.courier_id,
        created_by_id=user.id,
        transaction_type=data.transaction_type,
        quantity=data.quantity,
        balance_before=balance_before,
        balance_after=stock.quantity,
        note=data.note,
    )
    db.add(tx)
    await db.flush()

    if item and stock.quantity <= item.low_threshold:
        from app.tasks.notifications import notify_low_stock
        notify_low_stock.delay(str(user.tenant_id), item.name, stock.quantity)

    return {"transaction_id": str(tx.id), "balance_before": balance_before, "balance_after": stock.quantity}


@router.post("/empty-containers", status_code=201)
async def manage_empty_containers(
    data: EmptyContainerRequest,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Add or remove empty containers for returnable products."""
    from app.models.product import Product

    # Get product and verify it's returnable
    prod_result = await db.execute(
        select(Product).where(Product.id == data.product_id, Product.tenant_id == user.tenant_id)
    )
    product = prod_result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if not product.is_returnable_container:
        raise HTTPException(status_code=400, detail="This product is not returnable")

    item, stock = await _get_or_create_warehouse_item(data.product_id, user.tenant_id, db)

    empty_before = stock.empty_quantity
    if data.transaction_type == WarehouseTransactionType.KIRIM:
        stock.empty_quantity += data.quantity
    else:
        if stock.empty_quantity < data.quantity:
            raise HTTPException(status_code=400, detail=f"Yetarli bo'sh tara yo'q: {stock.empty_quantity} ta mavjud")
        stock.empty_quantity -= data.quantity

    tx = WarehouseTransaction(
        tenant_id=user.tenant_id,
        item_id=item.id,
        created_by_id=user.id,
        transaction_type=data.transaction_type,
        quantity=data.quantity,
        balance_before=empty_before,
        balance_after=stock.empty_quantity,
        note=data.note or f"Bo'sh tara {data.transaction_type.value}",
    )
    db.add(tx)
    await db.flush()

    return {
        "transaction_id": str(tx.id),
        "empty_balance_before": empty_before,
        "empty_balance_after": stock.empty_quantity,
    }


@router.get("/container-summary")
async def container_summary(
    user: User = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
):
    """Global container accounting: warehouse full + empty, at clients, with couriers."""
    from app.models.product import Product
    from app.models.client import Client
    from app.models.courier import Courier

    # Full containers in warehouse (returnable products only)
    full_wh = (await db.execute(
        select(func.coalesce(func.sum(WarehouseStock.quantity), 0))
        .join(WarehouseItem, WarehouseItem.id == WarehouseStock.item_id)
        .join(Product, Product.id == WarehouseItem.product_id)
        .where(
            WarehouseItem.tenant_id == user.tenant_id,
            Product.is_returnable_container == True,
            Product.is_deleted == False,
        )
    )).scalar_one()

    # Empty containers in warehouse
    empty_wh = (await db.execute(
        select(func.coalesce(func.sum(WarehouseStock.empty_quantity), 0))
        .join(WarehouseItem, WarehouseItem.id == WarehouseStock.item_id)
        .join(Product, Product.id == WarehouseItem.product_id)
        .where(
            WarehouseItem.tenant_id == user.tenant_id,
            Product.is_returnable_container == True,
            Product.is_deleted == False,
        )
    )).scalar_one()

    # Containers at clients
    at_clients = (await db.execute(
        select(func.coalesce(func.sum(Client.container_balance), 0))
        .where(Client.tenant_id == user.tenant_id, Client.container_balance > 0)
    )).scalar_one()

    # Full containers with active couriers
    with_couriers = (await db.execute(
        select(func.coalesce(func.sum(Courier.full_containers), 0))
        .where(Courier.tenant_id == user.tenant_id, Courier.is_active == True)
    )).scalar_one()

    return {
        "full_warehouse": int(full_wh),
        "empty_warehouse": int(empty_wh),
        "at_clients": int(at_clients),
        "with_couriers": int(with_couriers),
        "total": int(full_wh) + int(empty_wh) + int(at_clients) + int(with_couriers),
    }


@router.get("/transactions")
async def list_transactions(
    item_id: Optional[UUID] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20),
    user: User = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
):
    query = select(WarehouseTransaction).where(WarehouseTransaction.tenant_id == user.tenant_id)
    if item_id:
        query = query.where(WarehouseTransaction.item_id == item_id)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    result = await db.execute(
        query.order_by(WarehouseTransaction.created_at.desc())
        .offset((page - 1) * per_page).limit(per_page)
    )
    return {"items": result.scalars().all(), "total": total, "page": page}
