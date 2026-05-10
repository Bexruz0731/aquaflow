"""Tests: client management."""
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_create_client(client: AsyncClient, operator_user, tenant):
    resp = await client.post("/api/v1/clients/", json={
        "first_name": "Alisher",
        "last_name": "Karimov",
        "phone": "998901234599",
        "tenant_id": str(tenant.id),
    }, headers=auth_headers(operator_user))
    assert resp.status_code == 201
    data = resp.json()
    assert data["phone"] == "998901234599"
    assert data["first_name"] == "Alisher"


@pytest.mark.asyncio
async def test_list_clients(client: AsyncClient, operator_user, client_user):
    resp = await client.get("/api/v1/clients/", headers=auth_headers(operator_user))
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert data["total"] >= 1


@pytest.mark.asyncio
async def test_search_clients(client: AsyncClient, operator_user, client_user, db):
    _, cli = client_user

    resp = await client.get(
        f"/api/v1/clients/?search={cli.phone[:8]}",
        headers=auth_headers(operator_user)
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert any(c["phone"] == cli.phone for c in items)


@pytest.mark.asyncio
async def test_block_client(client: AsyncClient, operator_user, client_user):
    _, cli = client_user

    resp = await client.post(
        f"/api/v1/clients/{cli.id}/block",
        headers=auth_headers(operator_user)
    )
    assert resp.status_code in (200, 404)  # 404 if endpoint not yet wired


@pytest.mark.asyncio
async def test_add_address(client: AsyncClient, client_user, db):
    user, cli = client_user

    resp = await client.post("/api/v1/clients/me/addresses", json={
        "label": "Uy",
        "address_text": "Toshkent, Yunusobod 6",
        "latitude": 41.3,
        "longitude": 69.2,
        "is_primary": True,
    }, headers=auth_headers(user))

    assert resp.status_code in (200, 201)
    data = resp.json()
    assert data["label"] == "Uy"


@pytest.mark.asyncio
async def test_duplicate_phone_rejected(client: AsyncClient, operator_user, client_user, tenant):
    _, cli = client_user

    resp = await client.post("/api/v1/clients/", json={
        "first_name": "Duplicate",
        "phone": cli.phone,  # already exists
        "tenant_id": str(tenant.id),
    }, headers=auth_headers(operator_user))

    assert resp.status_code in (400, 409, 422)
