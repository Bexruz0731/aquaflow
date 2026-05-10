from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message
from aiogram.fsm.context import FSMContext
from aiogram.types import ReplyKeyboardRemove

from keyboards.client import client_main_keyboard, courier_main_keyboard
from states import ClientReg

router = Router()

DEFAULT_TENANT_ID = "0f92d89b-e7e7-411c-8c89-b5dd801bbe6a"

COURIER_ROLE = "courier"
CLIENT_ROLE = "client"

WELCOME_TEXT = (
    "🇺🇿 <b>Assalomu alaykum!</b>\n"
    "AkoWater botiga xush kelibsiz — toza ichimlik suvi yetkazib berish xizmati.\n"
    "Buyurtma berish uchun ro'yxatdan o'ting.\n\n"
    "🇷🇺 <b>Здравствуйте!</b>\n"
    "Добро пожаловать в бот AkoWater — доставка чистой питьевой воды.\n"
    "Зарегистрируйтесь для оформления заказов.\n\n"
    "─────────────────────\n"
    "📝 To'liq ismingizni kiriting:\n"
    "📝 Введите ваше полное имя:\n\n"
    "<i>Namuna / Пример: Karimov Jasur</i>"
)


@router.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext):
    await state.clear()
    telegram_id = message.from_user.id

    from services.api_client import get_user_by_telegram_id
    user = await get_user_by_telegram_id(telegram_id)

    if user:
        role = user.get("role", "").lower()
        secondary_role = (user.get("secondary_role") or "").lower()
        is_courier = role == COURIER_ROLE or secondary_role == COURIER_ROLE
        if is_courier:
            await message.answer(
                f"Xush kelibsiz, {user['first_name']}! 🚗\nDasturni oching:",
                reply_markup=courier_main_keyboard(),
            )
        else:
            await message.answer(
                f"Xush kelibsiz, {user['first_name']}! 💧\nBuyurtma berish uchun:",
                reply_markup=client_main_keyboard(),
            )
        return

    await state.set_state(ClientReg.waiting_name)
    await message.answer(
        WELCOME_TEXT,
        parse_mode="HTML",
        reply_markup=ReplyKeyboardRemove(),
    )
