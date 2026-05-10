"""Notification sending helpers called by Celery tasks or webhooks."""
import logging

from aiogram import Bot
from aiogram.exceptions import TelegramForbiddenError, TelegramBadRequest

logger = logging.getLogger(__name__)

# Order status → human-readable message (Uzbek)
ORDER_STATUS_MESSAGES = {
    "QABUL_QILINDI": "✅ Buyurtmangiz qabul qilindi va tez orada kurer tayinlanadi.",
    "TAYINLANDI":    "🚗 Kureringiz tayinlandi va yo'lda!",
    "YOLDA":         "📦 Kureringiz yetib kelmoqda. Tayyor bo'ling!",
    "YETKAZILDI":    "🎉 Buyurtmangiz muvaffaqiyatli yetkazildi. Rahmat!",
    "BEKOR_QILINDI": "❌ Buyurtmangiz bekor qilindi.",
    "MUAMMO":        "⚠️ Buyurtmangizda muammo yuz berdi. Operator siz bilan bog'lanadi.",
}


async def notify_client_order_status(
    bot: Bot,
    telegram_id: int,
    order_id: str,
    status: str,
    extra: str = "",
) -> None:
    """Send order status update to client."""
    text = ORDER_STATUS_MESSAGES.get(status, f"Buyurtma holati: {status}")
    if extra:
        text = f"{text}\n\n{extra}"
    text = f"🔔 <b>Buyurtma #{order_id[:8].upper()}</b>\n\n{text}"
    await _safe_send(bot, telegram_id, text)


async def notify_courier_new_order(
    bot: Bot,
    telegram_id: int,
    order_id: str,
    client_name: str,
    address: str,
    total: int,
) -> None:
    """Notify courier about new assigned order."""
    text = (
        f"📬 <b>Yangi buyurtma!</b>\n\n"
        f"🆔 #{order_id[:8].upper()}\n"
        f"👤 {client_name}\n"
        f"📍 {address}\n"
        f"💰 {total:,} so'm\n\n"
        "Buyurtmani qabul qilish uchun dasturni oching."
    )
    await _safe_send(bot, telegram_id, text)


async def notify_operator_new_order(
    bot: Bot,
    telegram_id: int,
    order_id: str,
    client_name: str,
    address: str,
    total: int,
    items_summary: str,
) -> None:
    """Notify operator about new order that needs processing."""
    text = (
        f"🛒 <b>Yangi buyurtma!</b>\n\n"
        f"🆔 #{order_id[:8].upper()}\n"
        f"👤 {client_name}\n"
        f"📍 {address}\n"
        f"📦 {items_summary}\n"
        f"💰 {total:,} so'm"
    )
    await _safe_send(bot, telegram_id, text)


async def notify_operator_problem(
    bot: Bot,
    telegram_id: int,
    order_id: str,
    courier_name: str,
    problem_note: str,
) -> None:
    text = (
        f"⚠️ <b>Buyurtmada muammo</b>\n\n"
        f"🆔 #{order_id[:8].upper()}\n"
        f"🚗 Kurer: {courier_name}\n"
        f"📝 {problem_note}"
    )
    await _safe_send(bot, telegram_id, text)


async def send_order_receipt(
    bot: Bot,
    telegram_id: int,
    order_id: str,
    items: list[dict],
    total: int,
    paid: int,
    debt: int,
    containers_returned: int,
) -> None:
    """Send completion receipt to client."""
    lines = [f"  • {it['name']} × {it['qty']} — {it['price']:,} so'm" for it in items]
    items_text = "\n".join(lines)

    debt_line = f"💳 Qarz: <b>{debt:,} so'm</b>" if debt > 0 else ""
    overpay = paid - total
    avans_line = f"💵 Avans: <b>{overpay:,} so'm</b>" if overpay > 0 else ""

    text = (
        f"🧾 <b>Kvitansiya #{order_id[:8].upper()}</b>\n"
        f"{'─' * 28}\n"
        f"{items_text}\n"
        f"{'─' * 28}\n"
        f"💰 Jami: <b>{total:,} so'm</b>\n"
        f"✅ To'landi: <b>{paid:,} so'm</b>\n"
    )
    if debt_line:
        text += f"{debt_line}\n"
    if avans_line:
        text += f"{avans_line}\n"
    if containers_returned:
        text += f"🫙 Qaytarilgan idish: <b>{containers_returned}</b>\n"
    text += "\nRahmat! Keyingi buyurtma uchun dasturni oching. 💧"

    await _safe_send(bot, telegram_id, text)


async def _safe_send(bot: Bot, telegram_id: int, text: str) -> bool:
    """Send message with bot-blocked handling."""
    try:
        await bot.send_message(chat_id=telegram_id, text=text)
        return True
    except TelegramForbiddenError:
        logger.warning("Bot blocked by user %s — flagging in DB", telegram_id)
        await _flag_bot_blocked(telegram_id)
        return False
    except TelegramBadRequest as exc:
        logger.warning("Bad request sending to %s: %s", telegram_id, exc)
        return False
    except Exception as exc:
        logger.error("Unexpected error sending to %s: %s", telegram_id, exc)
        return False


async def _flag_bot_blocked(telegram_id: int) -> None:
    """Mark user as bot_blocked in the backend."""
    import httpx
    from config import settings
    try:
        async with httpx.AsyncClient() as client:
            await client.patch(
                f"{settings.API_BASE_URL}/auth/telegram/user/{telegram_id}/blocked",
                json={"bot_blocked": True},
                headers={"X-Bot-Secret": settings.BOT_SECRET or settings.BOT_TOKEN},
                timeout=5,
            )
    except Exception as exc:
        logger.error("Failed to flag bot_blocked for %s: %s", telegram_id, exc)
