import asyncio
import logging
import aiohttp
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class BotSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    BOT_TOKEN: str
    BOT_SECRET: str = ""  # Shared secret for bot→backend calls; falls back to BOT_TOKEN if empty
    WEBHOOK_URL: str = ""
    WEBHOOK_SECRET: str = "change-me"
    API_BASE_URL: str = "http://localhost:8000/api/v1"
    REDIS_URL: str = "redis://localhost:6379/1"

    # If set explicitly in .env — used directly.
    # If empty — bot will fetch from cloudflared metrics API on startup.
    WEB_APP_CLIENT_URL: str = ""
    WEB_APP_COURIER_URL: str = ""

    # URLs to fetch trycloudflare dynamic domains from local cloudflared metrics
    CLOUDFLARED_CLIENT_METRICS_URL: str = "http://cloudflared-client:2000/quicktunnel"
    CLOUDFLARED_COURIER_METRICS_URL: str = "http://cloudflared-courier:2001/quicktunnel"


settings = BotSettings()


async def _fetch_tunnel_url(metrics_url: str, retries: int = 15) -> str:
    """Read the public tunnel URL from cloudflared local metrics API."""
    for attempt in range(retries):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(metrics_url, timeout=5) as resp:
                    if resp.status == 200:
                        data = await resp.json(content_type=None)
                        hostname = data.get("hostname")
                        if hostname:
                            return f"https://{hostname}"
                    else:
                        logger.debug(f"[tunnel-url] HTTP {resp.status} from {metrics_url}")
        except Exception as e:
            logger.warning(f"[tunnel-url] attempt {attempt+1}/{retries} getting {metrics_url} failed: {e}")
        await asyncio.sleep(4)
    return ""


async def resolve_tunnel_urls() -> None:
    """
    If WEB_APP_CLIENT_URL or WEB_APP_COURIER_URL are not set in .env,
    fetch them from the cloudflared logs and patch settings in-place.
    """
    tasks = []

    if not settings.WEB_APP_CLIENT_URL and settings.CLOUDFLARED_CLIENT_METRICS_URL:
        tasks.append(("client", _fetch_tunnel_url(settings.CLOUDFLARED_CLIENT_METRICS_URL)))
    if not settings.WEB_APP_COURIER_URL and settings.CLOUDFLARED_COURIER_METRICS_URL:
        tasks.append(("courier", _fetch_tunnel_url(settings.CLOUDFLARED_COURIER_METRICS_URL)))

    if not tasks:
        return

    logger.info("[tunnel-url] Fetching tunnel URLs from docker logs...")
    results = await asyncio.gather(*(t[1] for t in tasks))

    for i, (name, _) in enumerate(tasks):
        url = results[i]
        if url:
            if name == "client":
                settings.WEB_APP_CLIENT_URL = url
            else:
                settings.WEB_APP_COURIER_URL = url
            logger.info(f"[tunnel-url] {name} URL resolved: {url}")
        else:
            logger.error(f"[tunnel-url] Failed to resolve {name} tunnel URL!")
