import os
import json
import hashlib
from redis.asyncio import Redis

_redis_client = None


def get_redis_client() -> Redis:
    global _redis_client
    if _redis_client is None:
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        _redis_client = Redis.from_url(redis_url, decode_responses=True)
    return _redis_client


def make_cache_key(prefix: str, raw: str) -> str:
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"{prefix}:{digest}"


async def cache_get_json(key: str):
    try:
        client = get_redis_client()
        raw = await client.get(key)
        if not raw:
            return None
        return json.loads(raw)
    except Exception:
        return None


async def cache_set_json(key: str, value, ttl_seconds: int):
    try:
        client = get_redis_client()
        await client.set(key, json.dumps(value), ex=ttl_seconds)
    except Exception:
        # Cache failures should never break API flow.
        return
