from __future__ import annotations

import json
import logging
from typing import Any, Optional, Dict

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Cache key templates
# ---------------------------------------------------------------------------
KEY_MEETING = "meeting:{code}"
KEY_MEETINGS_UPCOMING = "meetings:upcoming:{user_id}"
KEY_MEETINGS_RECENT = "meetings:recent:{user_id}"
KEY_PARTICIPANTS = "participants:{code}"
KEY_RATELIMIT = "ratelimit:{ip}:{group}"

# TTLs (seconds)
TTL_MEETING = 60
TTL_MEETINGS_LIST = 30
TTL_PARTICIPANTS = 10
TTL_RATELIMIT = 120


class Cache:
    """Async Redis cache wrapper with graceful fallback when Redis is down."""

    def __init__(self) -> None:
        self._client: Optional[aioredis.Redis] = None

    async def connect(self) -> None:
        try:
            self._client = aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=2,
            )
            await self._client.ping()
            logger.info("Redis connected at %s", settings.REDIS_URL)
        except Exception as exc:
            logger.warning("Redis unavailable (%s) — caching disabled", exc)
            self._client = None

    async def disconnect(self) -> None:
        if self._client:
            await self._client.aclose()

    # ------------------------------------------------------------------
    # Basic helpers
    # ------------------------------------------------------------------

    async def get(self, key: str) -> Optional[Any]:
        if not self._client:
            return None
        try:
            raw = await self._client.get(key)
            return json.loads(raw) if raw is not None else None
        except Exception as exc:
            logger.debug("Cache GET error (%s): %s", key, exc)
            return None

    async def set(self, key: str, value: Any, ttl: int = 60) -> None:
        if not self._client:
            return
        try:
            await self._client.set(key, json.dumps(value), ex=ttl)
        except Exception as exc:
            logger.debug("Cache SET error (%s): %s", key, exc)

    async def delete(self, *keys: str) -> None:
        if not self._client:
            return
        try:
            await self._client.delete(*keys)
        except Exception as exc:
            logger.debug("Cache DELETE error: %s", exc)

    async def delete_pattern(self, pattern: str) -> None:
        """Delete all keys matching a glob pattern (use sparingly)."""
        if not self._client:
            return
        try:
            cursor = 0
            while True:
                cursor, keys = await self._client.scan(cursor, match=pattern, count=100)
                if keys:
                    await self._client.delete(*keys)
                if cursor == 0:
                    break
        except Exception as exc:
            logger.debug("Cache DELETE_PATTERN error (%s): %s", pattern, exc)

    # ------------------------------------------------------------------
    # Rate-limit token bucket helpers (Redis-backed, atomic)
    # ------------------------------------------------------------------

    async def get_bucket(self, ip: str, group: str) -> Optional[Dict[str, Any]]:
        key = KEY_RATELIMIT.format(ip=ip, group=group)
        return await self.get(key)

    async def set_bucket(self, ip: str, group: str, state: Dict[str, Any], ttl: int = TTL_RATELIMIT) -> None:
        key = KEY_RATELIMIT.format(ip=ip, group=group)
        await self.set(key, state, ttl)


# Singleton instance — imported by routers and middleware
cache = Cache()
