import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.base import AsyncSessionLocal
from app.models.product import Product
from app.models.warehouse import WarehouseItem, WarehouseStock

async def sync():
    async with AsyncSessionLocal() as session:
        # Get all products
        result = await session.execute(select(Product))
        products = result.scalars().all()
        
        count = 0
        for p in products:
            # Check if warehouse item exists
            item_r = await session.execute(
                select(WarehouseItem).where(
                    WarehouseItem.product_id == p.id,
                    WarehouseItem.tenant_id == p.tenant_id
                )
            )
            item = item_r.scalar_one_or_none()
            
            if not item:
                # Create it
                item = WarehouseItem(
                    tenant_id=p.tenant_id,
                    product_id=p.id,
                    name=p.name,
                    unit="ta",
                    is_container=p.is_returnable_container,
                )
                session.add(item)
                await session.flush()
                
                stock = WarehouseStock(
                    tenant_id=p.tenant_id,
                    item_id=item.id,
                    quantity=0,
                    empty_quantity=0,
                )
                session.add(stock)
                await session.flush()
                count += 1
                
        await session.commit()
        print(f"Successfully synced {count} missing products into warehouse.")

if __name__ == "__main__":
    asyncio.run(sync())
