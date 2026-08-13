from __future__ import annotations

"""
Token Bucket Rate Limiter — Redis-backed with in-memory fallback.
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Tuple, Optional, Dict, List

from app.cache import cache

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Bucket configuration per route group
# ---------------------------------------------------------------------------
@dataclass
class BucketConfig:
    capacity: int        # max tokens (burst)
    refill_rate: float   # tokens per second


ROUTE_LIMITS: Dict[str, BucketConfig] = {
    "meeting_create":      BucketConfig(capacity=5,  refill_rate=0.1),   # 1 token / 10s
    "meeting_read":        BucketConfig(capacity=30, refill_rate=1.0),   # 1 token / 1s
    "participant_action":  BucketConfig(capacity=10, refill_rate=0.2),   # 1 token / 5s
    "host_control":        BucketConfig(capacity=10, refill_rate=0.33),  # 1 token / 3s
    "websocket":           BucketConfig(capacity=5,  refill_rate=0.2),   # 1 token / 5s
    "default":             BucketConfig(capacity=20, refill_rate=0.5),
}

# Map URL path prefixes → group names (checked in order)
PATH_TO_GROUP: List[Tuple[str, str]] = [
    ("/api/meetings/instant",          "meeting_create"),
    ("/api/meetings/schedule",         "meeting_create"),
    ("/api/meetings/upcoming",         "meeting_read"),
    ("/api/meetings/recent",           "meeting_read"),
    ("/api/meetings",                  "meeting_read"),   # GET /{code}
    ("/ws/meetings",                   "websocket"),
]

# Suffix-based overrides (checked against the full path)
PATH_SUFFIX_TO_GROUP: List[Tuple[str, str]] = [
    ("/join",     "participant_action"),
    ("/leave",    "participant_action"),
    ("/mute-all", "host_control"),
    ("/remove/",  "host_control"),
]


def route_group_for(path: str) -> str:
    """Map a URL path to its rate-limit group name."""
    for suffix, group in PATH_SUFFIX_TO_GROUP:
        if path.endswith(suffix) or suffix in path:
            return group
    for prefix, group in PATH_TO_GROUP:
        if path.startswith(prefix):
            return group
    return "default"


# ---------------------------------------------------------------------------
# In-memory fallback bucket (single-process)
# ---------------------------------------------------------------------------
@dataclass
class InMemoryBucket:
    capacity: float
    refill_rate: float
    tokens: float = field(init=False)
    last_refill: float = field(default_factory=time.monotonic)

    def __post_init__(self) -> None:
        self.tokens = float(self.capacity)

    def consume(self) -> Tuple[bool, float, int]:
        now = time.monotonic()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
        self.last_refill = now

        if self.tokens >= 1:
            self.tokens -= 1
            return True, 0.0, int(self.tokens)
        else:
            retry_after = (1 - self.tokens) / self.refill_rate
            return False, retry_after, 0


_fallback_buckets: Dict[str, InMemoryBucket] = {}
_fallback_lock = asyncio.Lock()


# ---------------------------------------------------------------------------
# Main rate limiter
# ---------------------------------------------------------------------------
class RateLimiter:
    """
    Redis-backed token bucket rate limiter.
    Falls back to in-memory per-process buckets if Redis is unavailable.
    """

    async def check(
        self, ip: str, path: str
    ) -> Tuple[bool, float, int, int]:
        """
        Returns (allowed, retry_after_seconds, remaining_tokens, capacity).
        """
        group = route_group_for(path)
        cfg = ROUTE_LIMITS.get(group, ROUTE_LIMITS["default"])

        # --- Try Redis-backed bucket ---
        try:
            allowed, retry_after, remaining = await self._redis_consume(ip, group, cfg)
            return allowed, retry_after, remaining, cfg.capacity
        except Exception as exc:
            logger.debug("Rate limiter Redis error — using in-memory fallback: %s", exc)

        # --- In-memory fallback ---
        return await self._memory_consume(ip, group, cfg)

    # ------------------------------------------------------------------
    async def _redis_consume(
        self, ip: str, group: str, cfg: BucketConfig
    ) -> Tuple[bool, float, int]:
        now = time.time()
        state = await cache.get_bucket(ip, group)

        if state is None:
            tokens = float(cfg.capacity)
            last_refill = now
        else:
            tokens = float(state["tokens"])
            last_refill = float(state["last_refill"])

        # Refill
        elapsed = now - last_refill
        tokens = min(cfg.capacity, tokens + elapsed * cfg.refill_rate)

        if tokens >= 1:
            tokens -= 1
            allowed, retry_after, remaining = True, 0.0, int(tokens)
        else:
            retry_after = (1 - tokens) / cfg.refill_rate
            allowed, remaining = False, 0

        await cache.set_bucket(ip, group, {"tokens": tokens, "last_refill": now})
        return allowed, retry_after, remaining

    async def _memory_consume(
        self, ip: str, group: str, cfg: BucketConfig
    ) -> Tuple[bool, float, int, int]:
        key = f"{ip}:{group}"
        async with _fallback_lock:
            if key not in _fallback_buckets:
                _fallback_buckets[key] = InMemoryBucket(
                    capacity=cfg.capacity,
                    refill_rate=cfg.refill_rate,
                )
            bucket = _fallback_buckets[key]
            allowed, retry_after, remaining = bucket.consume()
        return allowed, retry_after, remaining, cfg.capacity


# Singleton
rate_limiter = RateLimiter()
