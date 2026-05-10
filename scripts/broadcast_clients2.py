#!/usr/bin/env python3
"""Broadcast: send new WebApp button to all TG clients via Docker postgres."""
import asyncio, subprocess, httpx

BOT_TOKEN = "8606897441:AAHSTXMN_vJ2pxY7Tbuc9hxX0TE4gXSQKVM"
WEB_APP_URL = "https://akowater.duckdns.org/client"
TG_API = f"https://api.telegram.org/bot{BOT_TOKEN}"

MESSAGE_TEXT = (
    "🔄 Ilovamiz yangilandi!\n\n"
    "Yangi ro'yxatni ko'rish uchun — quyidagi tugmani bosing:"
)


def get_tg_ids() -> list[int]:
    result = subprocess.run(
        ["docker", "exec", "suvpro-postgres-1", "psql", "-U", "postgres", "suvpro",
         "-t", "-c",
         "SELECT telegram_id FROM users WHERE role='CLIENT' AND telegram_id IS NOT NULL"],
        capture_output=True, text=True
    )
    return [int(x.strip()) for x in result.stdout.strip().splitlines() if x.strip().lstrip('-').isdigit()]


async def send_one(client: httpx.AsyncClient, tg_id: int) -> bool:
    payload = {
        "chat_id": tg_id,
        "text": MESSAGE_TEXT,
        "reply_markup": {
            "inline_keyboard": [[{
                "text": "🛒 Buyurtma berish",
                "web_app": {"url": WEB_APP_URL},
            }]]
        },
    }
    try:
        r = await client.post(f"{TG_API}/sendMessage", json=payload, timeout=10)
        data = r.json()
        if data.get("ok"):
            return True
        print(f"  WARN {tg_id}: {data.get('description')}")
        return False
    except Exception as e:
        print(f"  ERROR {tg_id}: {e}")
        return False


async def main():
    ids = get_tg_ids()
    print(f"Sending to {len(ids)} clients: {ids}")
    ok = 0
    async with httpx.AsyncClient() as client:
        for tg_id in ids:
            if await send_one(client, tg_id):
                ok += 1
                print(f"  ✓ {tg_id}")
            await asyncio.sleep(0.1)
    print(f"\nDone: {ok}/{len(ids)}")

asyncio.run(main())
