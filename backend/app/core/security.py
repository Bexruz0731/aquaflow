import hashlib
import hmac
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import unquote

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings

logger = logging.getLogger(__name__)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(data: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({**data, "exp": expire, "type": "access"}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode({**data, "exp": expire, "type": "refresh"}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError as e:
        logger.debug(f"Token decode failed: {e}")
        return None


def verify_telegram_init_data(init_data: str, bot_token: str) -> Optional[dict]:
    """Verify Telegram WebApp initData using HMAC-SHA256."""
    try:
        from urllib.parse import parse_qsl
        
        if init_data == "test_developer_mock_token":
            if settings.APP_ENV != "development":
                logger.warning("Mock token attempted outside development environment")
                return None
            return {
                "id": 999999999,
                "first_name": "Dev",
                "last_name": "Test",
            }
            
        parsed_data = dict(parse_qsl(init_data, keep_blank_values=True))
        hash_value = parsed_data.pop("hash", None)
        # NOTE: In Bot API 8.0+, 'signature' field is now INCLUDED in HMAC calculation
        # Do NOT remove it like we used to in older versions

        if not hash_value:
            return None

        secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed_data.items()))
        expected = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

        # Debug logging only in development mode
        if settings.APP_ENV == "development":
            import logging
            logger = logging.getLogger(__name__)
            logger.debug("=== TELEGRAM HMAC DEBUG ===")
            logger.debug(f"EXPECTED: {expected}")
            logger.debug(f"ACTUAL: {hash_value}")
            logger.debug(f"MATCH: {hmac.compare_digest(expected, hash_value)}")

        if not hmac.compare_digest(expected, hash_value):
            return None

        user_data = parsed_data.get("user")
        if user_data:
            return json.loads(user_data)
        return parsed_data

    except Exception as e:
        logger.warning(f"Telegram init data verification error: {e}")
        return None
