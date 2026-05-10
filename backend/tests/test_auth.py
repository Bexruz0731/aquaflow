"""Tests: JWT authentication."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, operator_user, tenant):
    resp = await client.post("/api/v1/auth/login", json={
        "login": "998901234567",
        "password": "pass123",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, operator_user, tenant):
    resp = await client.post("/api/v1/auth/login", json={
        "login": "998901234567",
        "password": "wrongpass",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_me(client: AsyncClient, operator_user):
    from tests.conftest import auth_headers
    resp = await client.get("/api/v1/auth/me", headers=auth_headers(operator_user))
    assert resp.status_code == 200
    data = resp.json()
    assert data["phone"] == "998901234567"
    assert data["role"] == "operator"


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient, operator_user, tenant):
    login = await client.post("/api/v1/auth/login", json={
        "login": "998901234567",
        "password": "pass123",
    })
    assert login.status_code == 200
    refresh = login.json()["refresh_token"]

    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_protected_without_token(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401
