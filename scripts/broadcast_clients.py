#!/usr/bin/env python3
"""
Broadcast: send new WebApp button to all TG clients.
Fixes cached catalog issue by giving them a fresh "Buyurtma berish" button.

Usage: python3 scripts/broadcast_clients.py
"""
import asyncio
import httpx

BOT_TOKEN = "8606897441:AAHSTXMN_vJ2pxY7Tbuc9hxX0TE4gXSQKVM"
WEB_APP_URL = "https://akowater.duckdns.org/client"
DB_DSN = "postgresql://postgres:postgres@localhost:5432/suvpro"

TG_API = f"https://api.telegram.org/bot{BOT_TOKEN}"

MESSAGE_TEXT = (
    "🔄 Ilovamiz yangilandi!\n\n"
    "Eski ro'yxatdagi mahsulotlarni ko'rmaslik uchun — quyidagi tugmadan ilovani qayta oching:"
)


async def get_all_client_tg_ids() -> list[int]:
    import psycopg2
    conn = psycopg2.connect(
        host="localhost", port=5432, dbname="suvpro", user="postgres", password="postgres"
    )
    cur = conn.cursor()
    cur.execute(
        "SELECT telegram_id FROM users WHERE role = 'CLIENT' AND telegram_id IS NOT NULL"
    )
    rows = cur.fetchall()
    conn.close()
    return [r[0] for r in rows]


async def send_message(client: httpx.AsyncClient, tg_id: int) -> bool:
    payload = {
        "chat_id": tg_id,
        "text": MESSAGE_TEXT,
        "reply_markup": {
            "inline_keyboard": [[
                {
                    "text": "🛒 Buyurtma berish",
                    "web_app": {"url": WEB_APP_URL},
                }
            ]]
        },
    }
    try:
        resp = await client.post(f"{TG_API}/sendMessage", json=payload, timeout=10)
        ok = resp.json().get("ok", False)
        if not ok:
            print(f"  WARN {tg_id}: {resp.json().get('description')}")
        return ok
    except Exception as e:
        print(f"  ERROR {tg_id}: {e}")
        return False


async def main():
    tg_ids = await get_all_client_tg_ids()
    print(f"Sending to {len(tg_ids)} clients...")

    ok_count = 0
    async with httpx.AsyncClient() as client:
        for tg_id in tg_ids:
            success = await send_message(client, tg_id)
            if success:
                ok_count += 1
                print(f"  ✓ {tg_id}")
            await asyncio.sleep(0.05)  # ~20 msg/sec, well under TG limit

    print(f"\nDone: {ok_count}/{len(tg_ids)} sent successfully")


if __name__ == "__main__":
    asyncio.run(main())
