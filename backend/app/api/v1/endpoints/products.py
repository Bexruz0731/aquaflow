import os
import uuid as uuid_lib
from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.db.base import get_db
from app.core.deps import get_current_user, require_boshliq
from app.core.config import settings
from app.models.user import User
from app.models.product import Product, ProductCategory

router = APIRouter()


class CategoryCreate(BaseModel):
    name: str
    icon: Optional[str] = None
    sort_order: int = 0


class ProductCreate(BaseModel):
    name: str
    category_id: Optional[UUID] = None
    price: int
    volume: Optional[int] = None
    volume_unit: Optional[str] = None
    is_returnable_container: bool = False
    containers_per_unit: int = 1
    show_to_clients: bool = True
    description: Optional[str] = None
    sort_order: int = 0

    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    def model_post_init(self, __context) -> None:
        if self.containers_per_unit < 1:
            raise ValueError("containers_per_unit must be >= 1")


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[UUID] = None
    price: Optional[int] = None
    volume: Optional[int] = None
    volume_unit: Optional[str] = None
    is_returnable_container: Optional[bool] = None
    containers_per_unit: Optional[int] = None
    is_active: Optional[bool] = None
    show_to_clients: Optional[bool] = None
    image_url: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    inactive_threshold_days: Optional[int] = None

    def model_post_init(self, __context) -> None:
        if self.containers_per_unit is not None and self.containers_per_unit < 1:
            raise ValueError("containers_per_unit must be >= 1")


# ── Categories ─────────────────────────────────────────────────────────────

@router.get("/categories")
async def list_categories(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ProductCategory)
        .where(ProductCategory.tenant_id == user.tenant_id)
        .order_by(ProductCategory.sort_order)
    )
    return result.scalars().all()


@router.post("/categories", status_code=201)
async def create_category(
    data: CategoryCreate,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    cat = ProductCategory(tenant_id=user.tenant_id, **data.model_dump())
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(
    category_id: UUID,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProductCategory).where(
            ProductCategory.id == category_id,
            ProductCategory.tenant_id == user.tenant_id,
        )
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Kategoriya topilmadi")
    count = (await db.execute(
        select(func.count()).select_from(
            select(Product).where(Product.category_id == category_id, Product.is_deleted == False).subquery()
        )
    )).scalar_one()
    if count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Kategoriyada {count} ta mahsulot bor. Avval mahsulotlarni boshqa kategoriyaga o'tkazing.",
        )
    await db.delete(cat)
    await db.flush()


# ── Products ───────────────────────────────────────────────────────────────

@router.get("/")
async def list_products(
    is_active: Optional[bool] = Query(None),
    category_id: Optional[UUID] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=500),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.user import UserRole
    query = select(Product).where(Product.tenant_id == user.tenant_id, Product.is_deleted == False)
    if is_active is not None:
        query = query.where(Product.is_active == is_active)
    if category_id:
        query = query.where(Product.category_id == category_id)
    # Clients only see products meant for them (supply/internal items hidden)
    if user.role == UserRole.CLIENT:
        query = query.where(Product.show_to_clients == True)
        
    # Count total
    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar_one()
    
    # Paginate
    query = query.order_by(Product.sort_order, Product.name).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    
    return {
        "items": result.scalars().all(),
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page
    }


@router.get("/catalog-ts")
async def get_catalog_version(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Returns the latest product update timestamp. Clients use this to detect catalog changes and invalidate cache."""
    from app.models.user import UserRole
    query = select(func.max(Product.updated_at)).where(
        Product.tenant_id == user.tenant_id,
        Product.is_deleted == False,
    )
    if user.role == UserRole.CLIENT:
        query = query.where(Product.show_to_clients == True)
    ts = (await db.execute(query)).scalar_one_or_none()
    return {"ts": ts.isoformat() if ts else None}


@router.get("/{product_id}")
async def get_product(product_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Product).where(Product.id == product_id, Product.tenant_id == user.tenant_id, Product.is_deleted == False)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.post("/", status_code=201)
async def create_product(
    data: ProductCreate,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    product = Product(tenant_id=user.tenant_id, **data.model_dump())
    db.add(product)
    await db.flush()
    await db.refresh(product)

    # Automatically create the initial warehouse item and stock with 0 quantity
    from app.models.warehouse import WarehouseItem, WarehouseStock
    item = WarehouseItem(
        tenant_id=user.tenant_id,
        product_id=product.id,
        name=product.name,
        unit="ta",
        is_container=product.is_returnable_container,
    )
    db.add(item)
    await db.flush()
    
    stock = WarehouseStock(
        tenant_id=user.tenant_id,
        item_id=item.id,
        quantity=0,
        empty_quantity=0,
    )
    db.add(stock)
    await db.flush()

    return product


@router.delete("/{product_id}/", status_code=204)
async def delete_product(
    product_id: UUID,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import update as sa_update, delete
    from app.models.warehouse import WarehouseItem, WarehouseStock
    from app.models.courier import CourierInventory

    result = await db.execute(
        select(Product).where(Product.id == product_id, Product.tenant_id == user.tenant_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Soft delete — keeps order history intact (orders.product_id = RESTRICT)
    product.is_deleted = True
    product.is_active = False

    # Zero out warehouse stock (keep warehouse_items — referenced by transactions)
    items_result = await db.execute(
        select(WarehouseItem).where(WarehouseItem.product_id == product_id, WarehouseItem.tenant_id == user.tenant_id)
    )
    items = items_result.scalars().all()
    for item in items:
        await db.execute(
            sa_update(WarehouseStock).where(WarehouseStock.item_id == item.id).values(quantity=0, empty_quantity=0)
        )

    # Remove from courier inventories
    await db.execute(
        delete(CourierInventory).where(
            CourierInventory.product_id == product_id,
            CourierInventory.tenant_id == user.tenant_id,
        )
    )

    await db.flush()


@router.patch("/{product_id}/")
async def update_product(
    product_id: UUID,
    data: ProductUpdate,
    user: User = Depends(require_boshliq),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Product).where(Product.id == product_id, Product.tenant_id == user.tenant_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    old_price = product.price
    old_name = product.name
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(product, field, value)

    # Sync warehouse item name when product is renamed
    if data.name is not None and data.name != old_name:
        from app.models.warehouse import WarehouseItem
        from sqlalchemy import update as sa_update
        await db.execute(
            sa_update(WarehouseItem)
            .where(WarehouseItem.product_id == product_id, WarehouseItem.tenant_id == user.tenant_id)
            .values(name=data.name)
        )

    # Record price change in history
    if data.price is not None and data.price != old_price:
        from app.models.product import PriceHistory
        history = PriceHistory(
            product_id=product_id,
            tenant_id=user.tenant_id,
            old_price=old_price,
            new_price=data.price,
            changed_by_id=user.id,
        )
        db.add(history)

    await db.flush()
    await db.refresh(product)
    return product


@router.post("/upload-image/", status_code=200)
async def upload_product_image(
    file: UploadFile = File(...),
    _user: User = Depends(require_boshliq),
):
    """Upload product image, return its URL."""
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPEG/PNG/WEBP/GIF allowed")

    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File too large (max {settings.MAX_UPLOAD_SIZE_MB}MB)")

    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
    filename = f"{uuid_lib.uuid4()}.{ext}"
    upload_path = os.path.join(settings.UPLOAD_DIR, "products")
    os.makedirs(upload_path, exist_ok=True)

    with open(os.path.join(upload_path, filename), "wb") as f:
        f.write(content)

    return {"url": f"/uploads/products/{filename}"}
