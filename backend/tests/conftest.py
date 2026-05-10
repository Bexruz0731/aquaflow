"""
Test configuration — uses SQLite in-memory database for speed.
Run with: pytest tests/ -v
"""
import asyncio
import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.db.base import Base, get_db
from app.main import app
from app.models.user import User, UserRole
from app.models.client import Client
from app.models.courier import Courier
from app.models.product import Product, ProductCategory
from app.models.order import Order, OrderItem
from app.core.security import hash_password, create_access_token

# In-memory SQLite for tests
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(TEST_DB_URL, echo=False)
TestSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def db_setup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db(db_setup) -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db) -> AsyncGenerator[AsyncClient, None]:
    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ── Fixtures: shared test data ────────────────────────────────────────────────

TENANT_ID = uuid.uuid4()


@pytest_asyncio.fixture
async def tenant(db: AsyncSession):
    from app.models.tenant import Tenant
    t = Tenant(
        id=TENANT_ID,
        name="Test Company",
        slug="test",
        bot_token="fake:token",
    )
    db.add(t)
    await db.flush()
    return t


@pytest_asyncio.fixture
async def operator_user(db: AsyncSession, tenant):
    user = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Operator",
        phone="998901234567",
        role=UserRole.OPERATOR,
        hashed_password=hash_password("pass123"),
    )
    db.add(user)
    await db.flush()
    return user


@pytest_asyncio.fixture
async def boshliq_user(db: AsyncSession, tenant):
    user = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Boss",
        phone="998901234568",
        role=UserRole.BOSHLIQ,
        hashed_password=hash_password("boss123"),
    )
    db.add(user)
    await db.flush()
    return user


@pytest_asyncio.fixture
async def client_user(db: AsyncSession, tenant):
    user = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Test",
        last_name="Client",
        phone="998901234569",
        role=UserRole.CLIENT,
    )
    db.add(user)
    await db.flush()

    c = Client(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        user_id=user.id,
        first_name="Test",
        last_name="Client",
        phone="998901234569",
    )
    db.add(c)
    await db.flush()
    return user, c


@pytest_asyncio.fixture
async def courier_user(db: AsyncSession, tenant):
    user = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Courier",
        phone="998901234570",
        role=UserRole.COURIER,
        hashed_password=hash_password("courier123"),
    )
    db.add(user)
    await db.flush()

    c = Courier(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        user_id=user.id,
        car_number="01A123BC",
    )
    db.add(c)
    await db.flush()
    return user, c


@pytest_asyncio.fixture
async def product(db: AsyncSession, tenant):
    cat = ProductCategory(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Suv",
    )
    db.add(cat)
    await db.flush()

    p = Product(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        category_id=cat.id,
        name="Suv 18.9L",
        price=12000,
        volume=18,
        is_returnable_container=True,
        is_active=True,
    )
    db.add(p)
    await db.flush()
    return p


def auth_headers(user: User) -> dict:
    token = create_access_token({"sub": str(user.id), "tenant_id": str(user.tenant_id)})
    return {"Authorization": f"Bearer {token}"}
