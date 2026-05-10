from aiogram.types import (
    ReplyKeyboardMarkup, KeyboardButton,
    InlineKeyboardMarkup, InlineKeyboardButton,
    WebAppInfo,
)
from config import settings

MANUAL_ADDRESS_BTN = "✏️ Manzilni qo'lda yozish"


def location_choice_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="📍 Lokatsiyani ulashish", request_location=True)],
            [KeyboardButton(text=MANUAL_ADDRESS_BTN)],
        ],
        resize_keyboard=True,
    )


def client_main_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="🛒 Buyurtma berish",
            web_app=WebAppInfo(url=settings.WEB_APP_CLIENT_URL),
        )
    ]])


def courier_main_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="🚗 Ishni boshlash",
            web_app=WebAppInfo(url=settings.WEB_APP_COURIER_URL),
        )
    ]])
