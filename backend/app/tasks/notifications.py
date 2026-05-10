"""Celery tasks for sending Telegram notifications."""
from celery import Celery
from app.core.config import settings

celery_app = Celery("suvpro", broker=settings.REDIS_URL, backend=settings.REDIS_URL)

celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]
celery_app.conf.timezone = "Asia/Tashkent"


@celery_app.task(name="notify_shift_discrepancy")
def notify_shift_discrepancy(courier_id: str, cash_diff: int, card_diff: int, payme_diff: int):
    """Notify boshliq about shift discrepancy."""
    # Full implementation in Stage 6
    pass


@celery_app.task(name="send_order_notification")
def send_order_notification(user_telegram_id: int, message: str):
    """Send a Telegram message to a user."""
    # Full implementation in Stage 6
    pass


@celery_app.task(name="notify_low_stock")
def notify_low_stock(tenant_id: str, item_name: str, quantity: int):
    """Notify boshliq when stock is low."""
    pass
