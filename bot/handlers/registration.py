"""FSM registration handlers for clients and couriers."""
import re
import logging

from aiogram import Router, F
from aiogram.types import Message, ReplyKeyboardRemove
from aiogram.fsm.context import FSMContext

from keyboards.client import (
    location_choice_keyboard,
    client_main_keyboard,
    courier_main_keyboard,
    MANUAL_ADDRESS_BTN,
)
from states import ClientReg, CourierReg
from services.api_client import register_client, register_courier, check_courier_invite

logger = logging.getLogger(__name__)

router = Router()

DEFAULT_TENANT_ID = "0f92d89b-e7e7-411c-8c89-b5dd801bbe6a"


def normalize_phone(text: str) -> str | None:
    """Normalize Uzbek phone to +998XXXXXXXXX format. Returns None if invalid."""
    digits = re.sub(r"\D", "", text.strip())
    if len(digits) == 9:                                  # 901234567
        return f"+998{digits}"
    if len(digits) == 12 and digits.startswith("998"):   # 998901234567
        return f"+{digits}"
    if len(digits) == 13 and digits.startswith("9980"):  # edge case with extra leading zero — reject
        return None
    return None


def parse_fullname(fullname: str) -> tuple[str, str | None]:
    """Split 'Familiya Ism ...' → (first_name, last_name)."""
    parts = fullname.strip().split(maxsplit=2)
    if len(parts) >= 2:
        return parts[1], parts[0]   # Uzbek order: last_name first_name
    return parts[0], None


# ──────────────────────────────────────────────
#  CLIENT REGISTRATION
# ──────────────────────────────────────────────

@router.message(ClientReg.waiting_name, F.text)
async def client_got_name(message: Message, state: FSMContext) -> None:
    fullname = message.text.strip() if message.text else ""
    if len(fullname.split()) < 2:
        await message.answer(
            "❗ Iltimos, to'liq ismingizni kiriting (kamida ism va familiya).\n"
            "<i>Namuna: Karimov Jasur</i>",
            parse_mode="HTML",
        )
        return

    first_name, last_name = parse_fullname(fullname)
    await state.update_data(first_name=first_name, last_name=last_name)

    await state.set_state(ClientReg.waiting_phone_text)
    await message.answer(
        f"✅ Ism qabul qilindi: <b>{fullname}</b>\n\n"
        "📱 Telefon raqamingizni kiriting:\n"
        "<i>Namuna: 901234567 yoki +998901234567</i>",
        parse_mode="HTML",
        reply_markup=ReplyKeyboardRemove(),
    )


@router.message(ClientReg.waiting_name)
async def client_name_invalid(message: Message) -> None:
    await message.answer(
        "❗ Iltimos, ismingizni matn sifatida kiriting.\n"
        "<i>Namuna: Karimov Jasur</i>",
        parse_mode="HTML",
    )


@router.message(ClientReg.waiting_phone_text, F.text)
async def client_got_phone_text(message: Message, state: FSMContext) -> None:
    phone = normalize_phone(message.text or "")
    if not phone:
        await message.answer(
            "❗ Telefon raqami noto'g'ri. Qayta kiriting.\n"
            "<i>Namuna: 901234567 yoki +998901234567</i>",
            parse_mode="HTML",
        )
        return

    await state.update_data(phone=phone)

    # Check if this phone belongs to a pre-registered courier
    is_courier = await check_courier_invite(phone)
    if is_courier:
        data = await state.get_data()
        await state.update_data(is_courier=True)
        await state.set_state(CourierReg.waiting_fullname)
        await message.answer(
            "👋 Siz kuryer sifatida taklif qilingan ekansiz!\n\n"
            "Iltimos, to'liq ismingizni kiriting (Familiya Ism Otasining ismi):",
            reply_markup=ReplyKeyboardRemove(),
        )
        return

    await state.set_state(ClientReg.waiting_location)
    await message.answer(
        f"✅ Raqam qabul qilindi: <b>{phone}</b>\n\n"
        "📍 Manzilingizni yuboring:\n"
        "Lokatsiyani ulashish tugmasini bosing <b>yoki</b> manzilni qo'lda yozing.",
        parse_mode="HTML",
        reply_markup=location_choice_keyboard(),
    )


@router.message(ClientReg.waiting_phone_text)
async def client_phone_text_invalid(message: Message) -> None:
    await message.answer(
        "❗ Telefon raqamini matn sifatida kiriting.\n"
        "<i>Namuna: 901234567 yoki +998901234567</i>",
        parse_mode="HTML",
    )


@router.message(ClientReg.waiting_location, F.location)
async def client_got_location(message: Message, state: FSMContext) -> None:
    location = message.location
    data = await state.get_data()

    user = message.from_user
    first_name = data.get("first_name") or user.first_name or "Mijoz"
    last_name = data.get("last_name") or user.last_name
    phone: str = data["phone"]

    try:
        await register_client(
            telegram_id=user.id,
            telegram_username=user.username,
            first_name=first_name,
            last_name=last_name,
            phone=phone,
            language="uz",
            tenant_id=DEFAULT_TENANT_ID,
            latitude=location.latitude,
            longitude=location.longitude,
        )
    except Exception as exc:
        logger.error("register_client failed: %s", exc)
        await message.answer(
            "⚠️ Ro'yxatdan o'tishda xatolik yuz berdi. Qayta urinib ko'ring: /start",
            reply_markup=ReplyKeyboardRemove(),
        )
        await state.clear()
        return

    await state.clear()
    await message.answer(
        f"🎉 Ro'yxatdan muvaffaqiyatli o'tdingiz, <b>{first_name}</b>!\n\n"
        "Buyurtma berish uchun quyidagi tugmani bosing 👇",
        parse_mode="HTML",
        reply_markup=client_main_keyboard(),
    )


@router.message(ClientReg.waiting_location, F.text == MANUAL_ADDRESS_BTN)
async def client_chose_manual_address(message: Message, state: FSMContext) -> None:
    await state.set_state(ClientReg.waiting_location_text)
    await message.answer(
        "✏️ Manzilingizni yozing:\n"
        "<i>Namuna: Toshkent, Chilonzor tumani, 10-mavze, 25-uy</i>",
        parse_mode="HTML",
        reply_markup=ReplyKeyboardRemove(),
    )


@router.message(ClientReg.waiting_location)
async def client_location_invalid(message: Message) -> None:
    await message.answer(
        "❗ Lokatsiya tugmasini bosing yoki manzilni qo'lda yozish tugmasini tanlang:",
        reply_markup=location_choice_keyboard(),
    )


@router.message(ClientReg.waiting_location_text, F.text)
async def client_got_location_text(message: Message, state: FSMContext) -> None:
    address_text = message.text.strip() if message.text else ""
    if len(address_text) < 5:
        await message.answer(
            "❗ Manzil juda qisqa. To'liqroq yozing:\n"
            "<i>Namuna: Toshkent, Chilonzor 10-mavze, 25-uy</i>",
            parse_mode="HTML",
        )
        return

    data = await state.get_data()
    user = message.from_user
    first_name = data.get("first_name") or user.first_name or "Mijoz"
    last_name = data.get("last_name") or user.last_name
    phone: str = data["phone"]

    try:
        await register_client(
            telegram_id=user.id,
            telegram_username=user.username,
            first_name=first_name,
            last_name=last_name,
            phone=phone,
            language="uz",
            tenant_id=DEFAULT_TENANT_ID,
            address_text=address_text,
        )
    except Exception as exc:
        logger.error("register_client failed: %s", exc)
        await message.answer(
            "⚠️ Ro'yxatdan o'tishda xatolik yuz berdi. Qayta urinib ko'ring: /start",
            reply_markup=ReplyKeyboardRemove(),
        )
        await state.clear()
        return

    await state.clear()
    await message.answer(
        f"🎉 Ro'yxatdan muvaffaqiyatli o'tdingiz, <b>{first_name}</b>!\n\n"
        "Buyurtma berish uchun quyidagi tugmani bosing 👇",
        parse_mode="HTML",
        reply_markup=client_main_keyboard(),
    )


@router.message(ClientReg.waiting_location_text)
async def client_location_text_invalid(message: Message) -> None:
    await message.answer(
        "❗ Iltimos, manzilingizni matn sifatida yozing.\n"
        "<i>Namuna: Toshkent, Chilonzor 10-mavze, 25-uy</i>",
        parse_mode="HTML",
    )


# ──────────────────────────────────────────────
#  COURIER REGISTRATION
# ──────────────────────────────────────────────

@router.message(CourierReg.waiting_fullname)
async def courier_got_fullname(message: Message, state: FSMContext) -> None:
    fullname = message.text.strip() if message.text else ""
    if len(fullname.split()) < 2:
        await message.answer(
            "❗ Iltimos, to'liq ismingizni kiriting (masalan: Karimov Jasur Aliyevich):"
        )
        return

    await state.update_data(fullname=fullname)
    await state.set_state(CourierReg.waiting_phone)
    await message.answer(
        "✅ Ismingiz qabul qilindi.\n\n"
        "📱 Telefon raqamingizni kiriting:\n"
        "<i>Namuna: 901234567 yoki +998901234567</i>",
        parse_mode="HTML",
        reply_markup=ReplyKeyboardRemove(),
    )


@router.message(CourierReg.waiting_phone, F.text)
async def courier_got_phone(message: Message, state: FSMContext) -> None:
    phone = normalize_phone(message.text or "")
    if not phone:
        await message.answer(
            "❗ Telefon raqami noto'g'ri. Qayta kiriting.\n"
            "<i>Namuna: 901234567 yoki +998901234567</i>",
            parse_mode="HTML",
        )
        return

    await state.update_data(phone=phone)
    await state.set_state(CourierReg.waiting_car_number)
    await message.answer(
        "✅ Raqamingiz qabul qilindi.\n\n"
        "Endi avtomobil raqamingizni kiriting (masalan: 01A123BC):",
        reply_markup=ReplyKeyboardRemove(),
    )


@router.message(CourierReg.waiting_phone)
async def courier_phone_invalid(message: Message) -> None:
    await message.answer(
        "❗ Telefon raqamini matn sifatida kiriting.\n"
        "<i>Namuna: 901234567 yoki +998901234567</i>",
        parse_mode="HTML",
    )


@router.message(CourierReg.waiting_car_number)
async def courier_got_car_number(message: Message, state: FSMContext) -> None:
    car_number = message.text.strip().upper() if message.text else ""
    if len(car_number) < 5:
        await message.answer(
            "❗ Avtomobil raqami noto'g'ri. Qayta kiriting (masalan: 01A123BC):"
        )
        return

    data = await state.get_data()
    user = message.from_user

    try:
        await register_courier(
            telegram_id=user.id,
            telegram_username=user.username,
            fullname=data["fullname"],
            phone=data["phone"],
            car_number=car_number,
            tenant_id=DEFAULT_TENANT_ID,
        )
    except Exception as exc:
        logger.error("register_courier failed: %s", exc)
        await message.answer(
            "⚠️ Ro'yxatdan o'tishda xatolik yuz berdi. Qayta urinib ko'ring: /start",
        )
        await state.clear()
        return

    await state.clear()
    first_name, _ = parse_fullname(data["fullname"])
    await message.answer(
        f"🎉 Ro'yxatdan muvaffaqiyatli o'tdingiz, <b>{first_name}</b>!\n\n"
        "Ish boshlash uchun quyidagi tugmani bosing 👇",
        parse_mode="HTML",
        reply_markup=courier_main_keyboard(),
    )
