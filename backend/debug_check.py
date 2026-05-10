import asyncio
from sqlalchemy import text
from app.db.base import AsyncSessionLocal

async def check():
    async with AsyncSessionLocal() as session:
        rows = await session.execute(text("SELECT id, cash_balance, card_balance FROM couriers WHERE is_active = true"))
        for r in rows.all():
            print(f"COURIER: id={r[0]}, cash_balance={r[1]}, card_balance={r[2]}")
        
        rows2 = await session.execute(text("SELECT id, courier_id, status, paid_amount, cash_amount, card_amount, debt_amount, payment_method FROM orders WHERE paid_amount > 0 OR cash_amount > 0 OR card_amount > 0 ORDER BY id DESC LIMIT 15"))
        for r in rows2.all():
            print(f"ORDER #{r[0]}: courier={r[1]}, status={r[2]}, paid={r[3]}, cash={r[4]}, card={r[5]}, debt={r[6]}, method={r[7]}")
        
        rows3 = await session.execute(text("SELECT status, COUNT(*) FROM orders GROUP BY status"))
        for r in rows3.all():
            print(f"STATUS: {r[0]} = {r[1]} orders")

asyncio.run(check())
