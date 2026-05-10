import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application
from aiohttp import web

from config import settings, resolve_tunnel_urls
from handlers import start, registration
from handlers.webhook_notify import register_notify_routes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


BOT_DESCRIPTION_UZ = (
    "💧 AkoWater — buyurtma botiga xush kelibsiz!\n\n"
    "🇺🇿 Assalomu alaykum! AkoWater buyurtma botiga xush kelibsiz!\n"
    "Toza ichimlik suvini uyingizga yetkazib beramiz.\n"
    "Buyurtma berish va hisobni ko'rish uchun «СТАРТ» tugmasini bosing.\n\n"
    "🇷🇺 Здравствуйте! Добро пожаловать в бот заказа AkoWater!\n"
    "Доставляем чистую питьевую воду прямо к вашему порогу.\n"
    "Нажмите «СТАРТ», чтобы оформить заказ или проверить баланс."
)

BOT_SHORT_DESCRIPTION = "💧 AkoWater — toza suv yetkazib berish | доставка чистой воды"


async def on_startup(bot: Bot) -> None:
    # Auto-fetch tunnel URLs from cloudflared if not set in .env
    await resolve_tunnel_urls()
    logger.info(f"Client mini-app URL: {settings.WEB_APP_CLIENT_URL}")
    logger.info(f"Courier mini-app URL: {settings.WEB_APP_COURIER_URL}")

    # Set bot description shown before user presses Start
    try:
        await bot.set_my_description(description=BOT_DESCRIPTION_UZ)
        await bot.set_my_short_description(short_description=BOT_SHORT_DESCRIPTION)
        logger.info("Bot description set successfully")
    except Exception as e:
        logger.warning(f"Could not set bot description: {e}")

    if settings.WEBHOOK_URL:
        await bot.set_webhook(
            url=f"{settings.WEBHOOK_URL}",
            secret_token=settings.WEBHOOK_SECRET,
        )
        logger.info(f"Webhook set: {settings.WEBHOOK_URL}")


async def on_shutdown(bot: Bot) -> None:
    await bot.delete_webhook()


def create_bot() -> tuple[Bot, Dispatcher]:
    bot = Bot(
        token=settings.BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher()
    dp.startup.register(on_startup)
    dp.shutdown.register(on_shutdown)

    dp.include_router(start.router)
    dp.include_router(registration.router)

    return bot, dp


def main() -> None:
    bot, dp = create_bot()

    if settings.WEBHOOK_URL:
        app = web.Application()
        webhook_handler = SimpleRequestHandler(
            dispatcher=dp,
            bot=bot,
            secret_token=settings.WEBHOOK_SECRET,
        )
        webhook_handler.register(app, path="/bot/webhook")
        setup_application(app, dp, bot=bot)
        register_notify_routes(app, bot)
        web.run_app(app, host="0.0.0.0", port=8080)
    else:
        asyncio.run(dp.start_polling(bot))


if __name__ == "__main__":
    main()
