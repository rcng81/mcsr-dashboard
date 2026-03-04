import httpx
from app.services.cache import cache_get_json, cache_set_json, make_cache_key

BASE_URL = "https://mcsrranked.com/api"


async def _get_json_with_cache(url: str, ttl_seconds: int):
    cache_key = make_cache_key("mcsr:http", url)
    cached = await cache_get_json(cache_key)
    if cached is not None:
        return cached

    async with httpx.AsyncClient() as client:
        response = await client.get(url)

    if response.status_code != 200:
        return None

    payload = response.json()
    await cache_set_json(cache_key, payload, ttl_seconds)
    return payload


async def fetch_player_from_api(username: str):
    url = f"{BASE_URL}/users/{username}"
    json_data = await _get_json_with_cache(url, ttl_seconds=60)

    if not json_data or json_data.get("status") != "success":
        return None

    return json_data.get("data")


async def fetch_user_matches_from_api(
    identifier: str,
    count: int = 100,
    sort: str = "newest",
    match_type: int | None = 2,
    before: int | None = None
):
    url = f"{BASE_URL}/users/{identifier}/matches?count={count}&sort={sort}"
    if match_type is not None:
        url += f"&type={match_type}"
    if before is not None:
        url += f"&before={before}"

    json_data = await _get_json_with_cache(url, ttl_seconds=45)
    if not json_data or json_data.get("status") != "success":
        return []

    return json_data.get("data", [])


async def fetch_match_info_from_api(match_id: int):
    url = f"{BASE_URL}/matches/{match_id}"
    json_data = await _get_json_with_cache(url, ttl_seconds=300)
    if not json_data or json_data.get("status") != "success":
        return None
    return json_data
