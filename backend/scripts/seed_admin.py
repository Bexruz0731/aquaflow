"""
Creates initial tenant + SUPER_ADMIN user for first login.
Run: python scripts/seed_admin.py
"""
import asyncio
import uuid
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.models.tenant import Tenant
from app.models.user import User, UserRole


PHONE    = "998901234567"
PASSWORD = "Admin1234"


async def seed():
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # Check if user already exists
        result = await db.execute(select(User).where(User.phone == PHONE))
        if result.scalar_one_or_none():
            print(f"✅ Пользователь {PHONE} уже существует")
            return

        # Create tenant
        tenant = Tenant(
            id=uuid.uuid4(),
            name="SuvPro Demo",
            slug="suvpro",
            is_active=True,
        )
        db.add(tenant)
        await db.flush()

        # Create SUPER_ADMIN user
        user = User(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            first_name="Admin",
            last_name="SuvPro",
            phone=PHONE,
            role=UserRole.SUPER_ADMIN,
            hashed_password=hash_password(PASSWORD),
            is_active=True,
            is_phone_verified=True,
        )
        db.add(user)
        await db.commit()

        print("=" * 40)
        print("✅ Администратор создан!")
        print(f"   Телефон : {PHONE}")
        print(f"   Пароль  : {PASSWORD}")
        print(f"   Роль    : SUPER_ADMIN")
        print(f"   Tenant  : {tenant.name} (id: {tenant.id})")
        print("=" * 40)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
