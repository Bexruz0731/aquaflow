"""HTTP client for communicating with the FastAPI backend."""
import logging

import httpx
from config import settings

logger = logging.getLogger(__name__)


async def register_client(
    telegram_id: int,
    telegram_username: str | None,
    first_name: str,
    last_name: str | None,
    phone: str,
    language: str,
    tenant_id: str,
    latitude: float | None = None,
    longitude: float | None = None,
    address_text: str | None = None,
) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.API_BASE_URL}/clients/register",
            json={
                "telegram_id": telegram_id,
                "telegram_username": telegram_username,
                "first_name": first_name,
                "last_name": last_name,
                "phone": phone,
                "language": language,
                "tenant_id": tenant_id,
                "latitude": latitude,
                "longitude": longitude,
                "address_text": address_text,
            },
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()


async def register_courier(
    telegram_id: int,
    telegram_username: str | None,
    fullname: str,
    phone: str,
    car_number: str,
    tenant_id: str,
) -> dict:
    parts = fullname.split(maxsplit=2)
    first_name = parts[1] if len(parts) > 1 else parts[0]
    last_name = parts[0]
    middle_name = parts[2] if len(parts) > 2 else None

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.API_BASE_URL}/couriers/register",
            json={
                "telegram_id": telegram_id,
                "telegram_username": telegram_username,
                "first_name": first_name,
                "last_name": last_name,
                "middle_name": middle_name,
                "phone": phone,
                "car_number": car_number,
                "tenant_id": tenant_id,
            },
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()


async def get_user_by_telegram_id(telegram_id: int) -> dict | None:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{settings.API_BASE_URL}/auth/telegram/user/{telegram_id}",
            headers={"X-Bot-Secret": settings.BOT_SECRET or settings.BOT_TOKEN},
            timeout=10,
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()


async def check_courier_invite(phone: str) -> bool:
    """Check if phone is pre-registered as courier by boshliq."""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{settings.API_BASE_URL}/couriers/invite/check",
                params={"phone": phone},
                timeout=10,
            )
            if resp.status_code == 200:
                return resp.json().get("invited", False)
        except Exception as exc:
            logger.warning("check_courier_invite failed: %s", exc)
    return False


async def send_telegram_message(telegram_id: int, text: str, bot) -> bool:
    """Send a message to a user. Used by notification tasks."""
    try:
        await bot.send_message(chat_id=telegram_id, text=text)
        return True
    except Exception as exc:
        logger.warning("send_telegram_message to %s failed: %s", telegram_id, exc)
        return False
