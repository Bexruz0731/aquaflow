"""Tests: RBAC — role-based access control."""
import uuid
import pytest
from httpx import AsyncClient
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_operator_cannot_access_staff(client: AsyncClient, operator_user):
    """Operator cannot manage staff (Boshliq only)."""
    resp = await client.get("/api/v1/users/", headers=auth_headers(operator_user))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_boshliq_can_access_staff(client: AsyncClient, boshliq_user):
    resp = await client.get("/api/v1/users/", headers=auth_headers(boshliq_user))
    assert resp.status_code in (200, 404)  # 404 if no users, but not 403


@pytest.mark.asyncio
async def test_operator_cannot_access_treasury(client: AsyncClient, operator_user):
    """Operator cannot see G'azna."""
    resp = await client.get("/api/v1/treasury/", headers=auth_headers(operator_user))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_boshliq_can_access_treasury(client: AsyncClient, boshliq_user):
    resp = await client.get("/api/v1/treasury/", headers=auth_headers(boshliq_user))
    assert resp.status_code in (200, 404)


@pytest.mark.asyncio
async def test_operator_cannot_manage_products(client: AsyncClient, operator_user):
    """Operator can only VIEW products, not create."""
    resp = await client.post("/api/v1/products/", json={
        "name": "Test", "price": 1000, "is_active": True
    }, headers=auth_headers(operator_user))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_blocked(client: AsyncClient):
    for path in ["/api/v1/orders/", "/api/v1/clients/", "/api/v1/users/"]:
        resp = await client.get(path)
        assert resp.status_code == 401, f"Expected 401 for {path}, got {resp.status_code}"


@pytest.mark.asyncio
async def test_tenant_isolation(client: AsyncClient, db, tenant):
    """Two tenants cannot see each other's data."""
    from app.models.user import User, UserRole
    from app.models.tenant import Tenant
    from app.core.security import hash_password

    tenant2_id = uuid.uuid4()
    t2 = Tenant(id=tenant2_id, name="Other Co", slug="other", bot_token="fake:token2")
    db.add(t2)
    await db.flush()

    user2 = User(
        id=uuid.uuid4(),
        tenant_id=tenant2_id,
        first_name="Other",
        phone="998901111111",
        role=UserRole.OPERATOR,
        hashed_password=hash_password("pass123"),
    )
    db.add(user2)
    await db.flush()

    # user2 can list orders — but should only see tenant2 orders (empty)
    resp = await client.get("/api/v1/orders/", headers=auth_headers(user2))
    assert resp.status_code == 200
    data = resp.json()
    # items should be empty — tenant1 orders not visible
    assert data.get("items", []) == [] or all(
        str(item.get("tenant_id")) == str(tenant2_id)
        for item in data.get("items", [])
    )
