"""Seed script: insert 14 Uzbekistan regions (system-wide, tenant_id=NULL)."""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.base import AsyncSessionLocal
from app.models.region import Region


REGIONS = [
    {"name_uz": "Toshkent shahri",    "name_uz_cyrillic": "Тошкент шаҳри",      "name_ru": "г. Ташкент",        "sort_order": 1},
    {"name_uz": "Toshkent viloyati",  "name_uz_cyrillic": "Тошкент вилояти",    "name_ru": "Ташкентская обл.",  "sort_order": 2},
    {"name_uz": "Andijon viloyati",   "name_uz_cyrillic": "Андижон вилояти",    "name_ru": "Андижанская обл.",  "sort_order": 3},
    {"name_uz": "Buxoro viloyati",    "name_uz_cyrillic": "Бухоро вилояти",     "name_ru": "Бухарская обл.",    "sort_order": 4},
    {"name_uz": "Farg'ona viloyati",  "name_uz_cyrillic": "Фарғона вилояти",    "name_ru": "Ферганская обл.",   "sort_order": 5},
    {"name_uz": "Jizzax viloyati",    "name_uz_cyrillic": "Жиззах вилояти",     "name_ru": "Джизакская обл.",   "sort_order": 6},
    {"name_uz": "Qashqadaryo",        "name_uz_cyrillic": "Қашқадарё",          "name_ru": "Кашкадарьинская",   "sort_order": 7},
    {"name_uz": "Navoiy viloyati",    "name_uz_cyrillic": "Навоий вилояти",     "name_ru": "Навоийская обл.",   "sort_order": 8},
    {"name_uz": "Namangan viloyati",  "name_uz_cyrillic": "Наманган вилояти",   "name_ru": "Наманганская обл.", "sort_order": 9},
    {"name_uz": "Samarqand viloyati", "name_uz_cyrillic": "Самарқанд вилояти",  "name_ru": "Самаркандская обл.","sort_order": 10},
    {"name_uz": "Sirdaryo viloyati",  "name_uz_cyrillic": "Сирдарё вилояти",    "name_ru": "Сырдарьинская обл.","sort_order": 11},
    {"name_uz": "Surxondaryo",        "name_uz_cyrillic": "Сурхондарё",         "name_ru": "Сурхандарьинская",  "sort_order": 12},
    {"name_uz": "Xorazm viloyati",    "name_uz_cyrillic": "Хоразм вилояти",     "name_ru": "Хорезмская обл.",   "sort_order": 13},
    {"name_uz": "Qoraqalpog'iston",   "name_uz_cyrillic": "Қорақалпоғистон",    "name_ru": "Каракалпакстан",    "sort_order": 14},
]


async def seed():
    async with AsyncSessionLocal() as session:
        for region_data in REGIONS:
            region = Region(
                tenant_id=None,
                is_active=True,
                **region_data,
            )
            session.add(region)
        await session.commit()
        print(f"✅ Seeded {len(REGIONS)} regions")


if __name__ == "__main__":
    asyncio.run(seed())
