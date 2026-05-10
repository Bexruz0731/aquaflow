"""Internal HTTP endpoint so FastAPI backend can trigger bot notifications."""
import logging
from typing import Annotated

from aiohttp import web
from aiogram import Bot

from handlers.notifications import (
    notify_client_order_status,
    notify_courier_new_order,
    notify_operator_new_order,
    notify_operator_problem,
    send_order_receipt,
)

logger = logging.getLogger(__name__)


def register_notify_routes(app: web.Application, bot: Bot) -> None:
    """Register internal notification routes on the aiohttp app."""
    app["bot"] = bot

    app.router.add_post("/internal/notify/order-status", handle_order_status)
    app.router.add_post("/internal/notify/courier-new-order", handle_courier_new_order)
    app.router.add_post("/internal/notify/operator-new-order", handle_operator_new_order)
    app.router.add_post("/internal/notify/operator-problem", handle_operator_problem)
    app.router.add_post("/internal/notify/receipt", handle_receipt)


async def handle_order_status(request: web.Request) -> web.Response:
    data = await request.json()
    bot: Bot = request.app["bot"]
    await notify_client_order_status(
        bot=bot,
        telegram_id=data["telegram_id"],
        order_id=data["order_id"],
        status=data["status"],
        extra=data.get("extra", ""),
    )
    return web.json_response({"ok": True})


async def handle_courier_new_order(request: web.Request) -> web.Response:
    data = await request.json()
    bot: Bot = request.app["bot"]
    await notify_courier_new_order(
        bot=bot,
        telegram_id=data["telegram_id"],
        order_id=data["order_id"],
        client_name=data["client_name"],
        address=data["address"],
        total=data["total"],
    )
    return web.json_response({"ok": True})


async def handle_operator_new_order(request: web.Request) -> web.Response:
    data = await request.json()
    bot: Bot = request.app["bot"]
    await notify_operator_new_order(
        bot=bot,
        telegram_id=data["telegram_id"],
        order_id=data["order_id"],
        client_name=data["client_name"],
        address=data["address"],
        total=data["total"],
        items_summary=data.get("items_summary", ""),
    )
    return web.json_response({"ok": True})


async def handle_operator_problem(request: web.Request) -> web.Response:
    data = await request.json()
    bot: Bot = request.app["bot"]
    await notify_operator_problem(
        bot=bot,
        telegram_id=data["telegram_id"],
        order_id=data["order_id"],
        courier_name=data["courier_name"],
        problem_note=data["problem_note"],
    )
    return web.json_response({"ok": True})


async def handle_receipt(request: web.Request) -> web.Response:
    data = await request.json()
    bot: Bot = request.app["bot"]
    await send_order_receipt(
        bot=bot,
        telegram_id=data["telegram_id"],
        order_id=data["order_id"],
        items=data["items"],
        total=data["total"],
        paid=data["paid"],
        debt=data.get("debt", 0),
        containers_returned=data.get("containers_returned", 0),
    )
    return web.json_response({"ok": True})
