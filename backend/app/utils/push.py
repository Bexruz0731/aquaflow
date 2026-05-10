"""Expo push notification sender."""
import logging
import httpx

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_expo_push(token: str, title: str, body: str, data: dict | None = None) -> None:
    """Fire-and-forget push via Expo Push Service. Silently ignores errors."""
    if not token or not token.startswith("ExponentPushToken"):
        return
    payload: dict = {"to": token, "title": title, "body": body, "sound": "default"}
    if data:
        payload["data"] = data
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(EXPO_PUSH_URL, json=payload)
    except Exception as exc:
        logger.warning("push failed: %s", exc)


async def send_order_push(token: str | None, order_id: int, status: str) -> None:
    """Send order status update push to client."""
    if not token:
        return
    messages = {
        "tayinlandi":    ("📦 Buyurtma", f"#{order_id} — Kuryer tayinlandi"),
        "yolda":         ("🚗 Kuryer yo'lda", f"#{order_id} buyurtmangizni yetkazmoqda"),
        "yetkazildi":    ("✅ Yetkazildi", f"#{order_id} buyurtmangiz yetkazildi"),
        "bekor_qilindi": ("❌ Bekor qilindi", f"#{order_id} buyurtmangiz bekor qilindi"),
    }
    if status not in messages:
        return
    title, body = messages[status]
    await send_expo_push(token, title, body, {"order_id": order_id, "status": status})
