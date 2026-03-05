import asyncio
import json
import math
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.db.dependency import get_db
from app.db.session import SessionLocal
from app.models.player import Player
from app.services.mcsr_service import (
    fetch_player_from_api,
    fetch_user_matches_from_api,
    fetch_match_info_from_api
)
from app.services.cache import get_redis_client
from app.services.splits import extract_splits, extract_death_counts
from app.models.match import Match
from datetime import datetime, timedelta

router = APIRouter(prefix="/players", tags=["players"])

DEFAULT_START_FILTERS = [
    "village",
    "desert_temple",
    "ruined_portal",
    "shipwreck",
    "buried_treasure"
]

def _ms_to_mmss(ms_value):
    if ms_value is None:
        return None
    total_seconds = int(round(ms_value / 1000))
    minutes = total_seconds // 60
    seconds = total_seconds % 60
    return f"{minutes}:{seconds:02d}"


def _win_rate_excluding_draws(wins: int, losses: int) -> float:
    decisive_matches = (wins or 0) + (losses or 0)
    if decisive_matches <= 0:
        return 0.0
    return (wins / decisive_matches) * 100


def _normalize_seed_value(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    return normalized or None


async def _set_sync_progress(uuid: str, processed: int, total: int, message: str):
    progress_key = f"sync:progress:{uuid.lower()}"
    percent = 100.0 if total <= 0 else round(min((processed / total) * 100, 100), 2)
    payload = {
        "processed": processed,
        "total": total,
        "progress_percent": percent,
        "message": message
    }
    try:
        redis = get_redis_client()
        await redis.set(progress_key, json.dumps(payload), ex=900)
    except Exception:
        pass


async def _run_sync_job(username: str, scope: str, max_pages: int, lock_key: str):
    db = SessionLocal()
    try:
        await sync_matches(username=username, scope=scope, max_pages=max_pages, db=db)
    except Exception:
        db.rollback()
    finally:
        db.close()
        try:
            redis = get_redis_client()
            await redis.delete(lock_key)
        except Exception:
            pass


async def _schedule_sync_if_needed(lock_id: str, username: str, scope: str, max_pages: int) -> bool:
    lock_key = f"sync:lock:{lock_id.lower()}"
    try:
        redis = get_redis_client()
        locked = await redis.set(lock_key, "1", ex=300, nx=True)
    except Exception:
        locked = True

    if not locked:
        return False

    asyncio.create_task(_run_sync_job(username, scope, max_pages, lock_key))
    return True

@router.get("/{username}")
async def get_player(
    username: str = Path(..., min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$"),
    db: Session = Depends(get_db)
):

    # 1️⃣ Fetch from API FIRST
    api_data = await fetch_player_from_api(username)

    if not api_data:
        raise HTTPException(status_code=404, detail="Player not found")

    uuid = api_data.get("uuid")

    if not uuid:
        raise HTTPException(status_code=500, detail="UUID missing from API response")

    # 2️⃣ Now check DB using UUID
    player = db.query(Player).filter(Player.uuid == uuid).first()

    if player:
        return player

    # 3️⃣ Create new player
    new_player = Player(
        uuid=uuid,
        username=api_data.get("nickname"),
        current_elo=api_data.get("eloRate") or 0,
        peak_elo=api_data.get("eloRate") or 0
    )

    db.add(new_player)
    db.commit()
    db.refresh(new_player)

    return new_player

@router.post("/{username}/sync-matches")
async def sync_matches(
    username: str = Path(..., min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$"),
    scope: str = Query("last_30_days", pattern="^(last_30_days|all_time)$"),
    max_pages: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db)
):

    api_data = await fetch_player_from_api(username)

    if not api_data:
        raise HTTPException(status_code=404, detail="Player not found")

    uuid = api_data.get("uuid")

    player = db.query(Player).filter(Player.uuid == uuid).first()

    if not player:
        player = Player(
            uuid=uuid,
            username=api_data.get("nickname"),
            current_elo=api_data.get("eloRate") or 0,
            peak_elo=api_data.get("eloRate") or 0
        )
        db.add(player)
        db.commit()
        db.refresh(player)

    # Fetch ranked matches by scope.
    cutoff_epoch = None
    if scope == "last_30_days":
        cutoff_dt = datetime.utcnow() - timedelta(days=30)
        cutoff_epoch = int(cutoff_dt.timestamp())

    match_data = []
    before_cursor = None

    for _ in range(max_pages):
        page_matches = await fetch_user_matches_from_api(
            uuid,
            count=100,
            sort="newest",
            match_type=2,
            before=before_cursor
        )
        if not page_matches:
            break

        if cutoff_epoch is None:
            match_data.extend(page_matches)
        else:
            scoped_matches = [m for m in page_matches if (m.get("date") or 0) >= cutoff_epoch]
            match_data.extend(scoped_matches)
            oldest_in_page = min((m.get("date") or 0) for m in page_matches)
            if oldest_in_page < cutoff_epoch:
                break

        before_cursor = min(m["id"] for m in page_matches)

    inserted_matches = 0
    inserted_splits = 0
    total_to_process = len(match_data)
    processed = 0
    await _set_sync_progress(uuid, 0, total_to_process, "Preparing sync...")

    for match in match_data:
        if match.get("type") != 2:
            processed += 1
            continue

        existing_match = db.query(Match).filter(
            Match.player_id == player.id,
            Match.match_uuid == str(match["id"])
        ).first()

        # Create match row if it does not exist yet
        if existing_match is None:
            winner_uuid = match.get("result", {}).get("uuid")
            is_draw = winner_uuid is None
            won = (winner_uuid == uuid) if not is_draw else False

            duration_seconds = None
            if match["result"].get("time"):
                duration_seconds = match["result"]["time"] / 1000

            played_at = datetime.utcfromtimestamp(match["date"])

            existing_match = Match(
                player_id=player.id,
                match_uuid=str(match["id"]),
                won=won,
                is_draw=is_draw,
                duration_seconds=duration_seconds,
                match_type=match.get("type"),
                played_at=played_at
            )
            db.add(existing_match)
            db.flush()  # materialize existing_match.id for split inserts
            inserted_matches += 1
        else:
            existing_match.match_type = 2
            winner_uuid = match.get("result", {}).get("uuid")
            existing_match.is_draw = winner_uuid is None
            existing_match.won = (winner_uuid == uuid) if winner_uuid is not None else False

        # Fetch full match details (needed for timelines)
        full_match_data = await fetch_match_info_from_api(match["id"])
        if not full_match_data:
            continue
        seed_data = (full_match_data.get("data", {}) or {}).get("seed") or {}
        existing_match.start_overworld = _normalize_seed_value(seed_data.get("overworld"))
        # MCSR API currently uses `seed.nether` for bastion route category.
        existing_match.bastion_type = _normalize_seed_value(
            seed_data.get("bastion") or seed_data.get("nether")
        )
        splits = extract_splits(full_match_data)
        death_counts = extract_death_counts(full_match_data)
        player_splits = splits.get(uuid)
        existing_match.death_count = death_counts.get(uuid, 0)

        # Insert splits if available
        if player_splits:
            result = db.execute(text("""
                    INSERT INTO match_splits (
                        match_id,
                        player_uuid,
                        nether_enter_ms,
                        bastion_ms,
                        fortress_ms,
                        first_rod_ms,
                        blind_ms,
                        stronghold_ms,
                        end_enter_ms,
                        dragon_death_ms,
                        finish_ms
                    )
                    VALUES (:match_id, :player_uuid, :nether_enter, :bastion,
                            :fortress, :first_rod, :blind, :stronghold,
                            :end_enter, :dragon_death, :finish)
                    ON CONFLICT (match_id, player_uuid) DO UPDATE
                    SET
                        nether_enter_ms = COALESCE(match_splits.nether_enter_ms, EXCLUDED.nether_enter_ms),
                        bastion_ms = COALESCE(match_splits.bastion_ms, EXCLUDED.bastion_ms),
                        fortress_ms = COALESCE(match_splits.fortress_ms, EXCLUDED.fortress_ms),
                        first_rod_ms = COALESCE(match_splits.first_rod_ms, EXCLUDED.first_rod_ms),
                        blind_ms = COALESCE(match_splits.blind_ms, EXCLUDED.blind_ms),
                        stronghold_ms = COALESCE(match_splits.stronghold_ms, EXCLUDED.stronghold_ms),
                        end_enter_ms = COALESCE(match_splits.end_enter_ms, EXCLUDED.end_enter_ms),
                        dragon_death_ms = COALESCE(match_splits.dragon_death_ms, EXCLUDED.dragon_death_ms),
                        finish_ms = COALESCE(match_splits.finish_ms, EXCLUDED.finish_ms)
            """), {
                "match_id": existing_match.id,
                "player_uuid": uuid,
                "nether_enter": player_splits["nether_enter"],
                "bastion": player_splits["bastion"],
                "fortress": player_splits["fortress"],
                "first_rod": player_splits["first_rod"],
                "blind": player_splits["blind"],
                "stronghold": player_splits["stronghold"],
                "end_enter": player_splits["end_enter"],
                "dragon_death": player_splits["dragon_death"],
                "finish": player_splits["finish"]
            })
            inserted_splits += result.rowcount or 0

        processed += 1
        if processed % 5 == 0 or processed == total_to_process:
            await _set_sync_progress(
                uuid,
                processed,
                total_to_process,
                f"Syncing match data... ({processed}/{total_to_process})"
            )

    db.commit()
    await _set_sync_progress(uuid, total_to_process, total_to_process, "Sync complete.")

    return {
        "inserted_matches": inserted_matches,
        "inserted_splits": inserted_splits,
        "window": scope,
        "fetched_ranked_matches_in_window": len(match_data)
    }


@router.post("/{username}/sync-dashboard")
async def sync_dashboard(
    username: str = Path(..., min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$"),
    fast_mode: bool = Query(True),
    db: Session = Depends(get_db)
):
    """
    Smart sync for UI:
    - First-time user in DB: backfill all-time ranked history.
    - Returning user: compare latest ranked match in API vs DB.
      If different, sync recent ranked data; if same, skip.
    """
    api_data = await fetch_player_from_api(username)
    if not api_data:
        raise HTTPException(status_code=404, detail="Player not found")

    uuid = api_data.get("uuid")
    if not uuid:
        raise HTTPException(status_code=500, detail="UUID missing from API response")

    player = db.query(Player).filter(Player.uuid == uuid).first()
    created_player = False
    if not player:
        player = Player(
            uuid=uuid,
            username=api_data.get("nickname"),
            current_elo=api_data.get("eloRate") or 0,
            peak_elo=api_data.get("eloRate") or 0
        )
        db.add(player)
        db.commit()
        db.refresh(player)
        created_player = True

    latest_api_match_id = None
    latest_rows = await fetch_user_matches_from_api(uuid, count=1, sort="newest", match_type=2)
    if latest_rows:
        latest_api_match_id = str(latest_rows[0].get("id"))

    latest_db_match = db.query(Match).filter(
        Match.player_id == player.id,
        Match.match_type == 2
    ).order_by(Match.played_at.desc()).first()
    latest_db_match_id = latest_db_match.match_uuid if latest_db_match else None

    db_ranked_count = db.query(func.count(Match.id)).filter(
        Match.player_id == player.id,
        Match.match_type == 2
    ).scalar() or 0
    api_ranked_total = (
        api_data.get("statistics", {})
        .get("total", {})
        .get("playedMatches", {})
        .get("ranked") or 0
    )

    first_time = latest_db_match is None
    missing_ranked_count = max((api_ranked_total or 0) - (db_ranked_count or 0), 0)
    latest_mismatch = latest_api_match_id is not None and latest_api_match_id != latest_db_match_id
    needs_sync = first_time or missing_ranked_count > 0 or latest_mismatch

    if first_time:
        sync_scope = "all_time"
        sync_pages = max(50, min(500, math.ceil((api_ranked_total or 0) / 100) + 2))
    elif missing_ranked_count > 0:
        # Fetch only enough newest pages to cover the known difference.
        sync_scope = "all_time"
        sync_pages = max(2, min(500, math.ceil(missing_ranked_count / 100) + 2))
    else:
        # Fallback when totals match but latest id differs (edge-case mismatch).
        sync_scope = "all_time"
        sync_pages = 2

    if not needs_sync:
        return {
            "created_player": created_player,
            "first_time": False,
            "up_to_date": True,
            "sync_started": False,
            "message": "Ranked totals match API. Returning cached data."
        }

    if fast_mode:
        started = await _schedule_sync_if_needed(uuid, username, sync_scope, sync_pages)
        return {
            "created_player": created_player,
            "first_time": first_time,
            "up_to_date": False,
            "sync_started": started,
            "message": (
                "Sync already in progress. Showing cached data."
                if not started else
                (
                    "First-time player detected. Building full ranked history in background."
                    if first_time else
                    f"Detected {missing_ranked_count} new ranked matches. Syncing latest data in background."
                )
            )
        }

    result = await sync_matches(username, scope=sync_scope, max_pages=sync_pages, db=db)
    return {
        "created_player": created_player,
        "first_time": first_time,
        "up_to_date": False,
        "sync_started": False,
        "message": (
            "First-time player detected. Synced all-time ranked history."
            if first_time else
            f"Synced {missing_ranked_count} new ranked matches."
        ),
        "sync": result
    }


@router.get("/{username}/sync-status")
async def get_sync_status(
    username: str = Path(..., min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$"),
    db: Session = Depends(get_db)
):
    player = db.query(Player).filter(Player.username.ilike(username)).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    lock_key = f"sync:lock:{player.uuid.lower()}"
    progress_key = f"sync:progress:{player.uuid.lower()}"
    in_progress = False
    progress_percent = 0.0
    progress_message = "Sync idle."
    ranked_synced = 0
    ranked_total = 0

    try:
        redis = get_redis_client()
        in_progress = await redis.exists(lock_key) == 1
        raw = await redis.get(progress_key)
        if raw:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                progress_percent = float(parsed.get("progress_percent", 0.0) or 0.0)
                ranked_synced = int(parsed.get("processed", 0) or 0)
                ranked_total = int(parsed.get("total", 0) or 0)
                progress_message = str(parsed.get("message", progress_message))
    except Exception:
        pass

    if ranked_total == 0:
        db_ranked_count = db.query(func.count(Match.id)).filter(
            Match.player_id == player.id,
            Match.match_type == 2
        ).scalar() or 0

        api_data = await fetch_player_from_api(username)
        api_ranked_total = (
            api_data.get("statistics", {})
            .get("total", {})
            .get("playedMatches", {})
            .get("ranked") or 0
        ) if api_data else 0

        ranked_synced = db_ranked_count
        ranked_total = api_ranked_total
        total = max(api_ranked_total, db_ranked_count, 1)
        progress_percent = round(min((db_ranked_count / total) * 100, 100), 2)
        progress_message = "Sync in progress. Building ranked history..." if in_progress else "Sync idle."

    return {
        "username": player.username,
        "in_progress": in_progress,
        "ranked_synced": ranked_synced,
        "ranked_total": ranked_total,
        "progress_percent": progress_percent,
        "message": progress_message
    }

@router.get("/{username}/stats")
async def get_player_stats(
    username: str = Path(..., min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$"),
    db: Session = Depends(get_db)
):

    player = db.query(Player).filter(Player.username.ilike(username)).first()

    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    def _window_stats(days: int):
        cutoff = datetime.utcnow() - timedelta(days=days)
        total_matches = db.query(func.count(Match.id)).filter(
            Match.player_id == player.id,
            Match.match_type == 2,
            Match.played_at >= cutoff
        ).scalar()
        wins = db.query(func.count(Match.id)).filter(
            Match.player_id == player.id,
            Match.match_type == 2,
            Match.played_at >= cutoff,
            Match.is_draw == False,
            Match.won == True
        ).scalar()
        draws = db.query(func.count(Match.id)).filter(
            Match.player_id == player.id,
            Match.match_type == 2,
            Match.played_at >= cutoff,
            Match.is_draw == True
        ).scalar()
        losses = max((total_matches or 0) - (wins or 0) - (draws or 0), 0)
        avg_duration = db.query(func.avg(Match.duration_seconds)).filter(
            Match.player_id == player.id,
            Match.match_type == 2,
            Match.played_at >= cutoff,
            Match.duration_seconds != None
        ).scalar()
        total_deaths = db.query(func.coalesce(func.sum(Match.death_count), 0)).filter(
            Match.player_id == player.id,
            Match.match_type == 2,
            Match.played_at >= cutoff
        ).scalar()
        avg_deaths = db.query(func.avg(Match.death_count)).filter(
            Match.player_id == player.id,
            Match.match_type == 2,
            Match.played_at >= cutoff
        ).scalar()
        win_rate = _win_rate_excluding_draws(wins or 0, losses or 0)
        return {
            "window": f"last_{days}_days",
            "total_matches": total_matches,
            "wins": wins,
            "losses": losses,
            "draws": draws,
            "win_rate_percent": round(win_rate, 2),
            "average_match_duration_seconds": round(avg_duration, 2) if avg_duration else None,
            "total_deaths": int(total_deaths or 0),
            "average_deaths_per_match": round(avg_deaths, 2) if avg_deaths is not None else None
        }

    weekly = _window_stats(7)
    monthly = _window_stats(30)

    # Pull authoritative all-time and current-season counters from MCSR API.
    api_data = await fetch_player_from_api(username)
    overall = None
    season_record = None
    if api_data and api_data.get("statistics", {}).get("total"):
        total_stats = api_data["statistics"]["total"]
        total_played = total_stats.get("playedMatches", {}).get("ranked") or 0
        total_wins = total_stats.get("wins", {}).get("ranked") or 0
        total_losses = total_stats.get("loses", {}).get("ranked") or 0
        total_draws = max(total_played - total_wins - total_losses, 0)
        overall = {
            "mode": "ranked",
            "total_matches": total_played,
            "wins": total_wins,
            "losses": total_losses,
            "draws": total_draws,
            "record_line": f"{total_played} matches - {total_wins}W {total_losses}L {total_draws}D"
        }
    if api_data and api_data.get("statistics", {}).get("season"):
        season_stats = api_data["statistics"]["season"]
        season_played = season_stats.get("playedMatches", {}).get("ranked") or 0
        season_wins = season_stats.get("wins", {}).get("ranked") or 0
        season_losses = season_stats.get("loses", {}).get("ranked") or 0
        season_draws = max(season_played - season_wins - season_losses, 0)
        season_record = {
            "mode": "ranked",
            "scope": "current_season",
            "total_matches": season_played,
            "wins": season_wins,
            "losses": season_losses,
            "draws": season_draws,
            "record_line": f"{season_played} matches - {season_wins}W {season_losses}L {season_draws}D"
        }

    overall_win_rate_percent = None
    overall_average_time_seconds = None
    overall_average_time_mmss = None
    if api_data and api_data.get("statistics", {}).get("total"):
        total_stats = api_data["statistics"]["total"]
        ranked_played = total_stats.get("playedMatches", {}).get("ranked") or 0
        ranked_wins = total_stats.get("wins", {}).get("ranked") or 0
        ranked_losses = total_stats.get("loses", {}).get("ranked") or 0
        ranked_playtime_ms = total_stats.get("playtime", {}).get("ranked") or 0
        if ranked_played > 0:
            overall_win_rate_percent = round(_win_rate_excluding_draws(ranked_wins, ranked_losses), 2)
            overall_average_time_seconds = round((ranked_playtime_ms / ranked_played) / 1000, 2)
            overall_average_time_mmss = _ms_to_mmss(ranked_playtime_ms / ranked_played)

    return {
        "username": player.username,
        "current_elo": api_data.get("eloRate") if api_data else player.current_elo,
        "peak_elo": (
            api_data.get("seasonResult", {}).get("highest")
            if api_data else player.peak_elo
        ),
        "personal_best": {
            "time_ms": (
                api_data.get("statistics", {})
                .get("total", {})
                .get("bestTime", {})
                .get("ranked")
                if api_data else None
            ),
            "time_mmss": _ms_to_mmss(
                api_data.get("statistics", {})
                .get("total", {})
                .get("bestTime", {})
                .get("ranked")
                if api_data else None
            )
        },
        "win_streak": {
            "best": (
                api_data.get("statistics", {})
                .get("total", {})
                .get("highestWinStreak", {})
                .get("ranked")
                if api_data else None
            ),
            "current": (
                api_data.get("statistics", {})
                .get("total", {})
                .get("currentWinStreak", {})
                .get("ranked")
                if api_data else None
            )
        },
        "overall_win_rate_percent": overall_win_rate_percent,
        "overall_average_time_seconds": overall_average_time_seconds,
        "overall_average_time_mmss": overall_average_time_mmss,
        "overall_record": overall,
        "season_record": season_record,
        "synced_record": {
            "window": "last_7_days",
            "total_matches": weekly["total_matches"],
            "wins": weekly["wins"],
            "losses": weekly["losses"],
            "draws": weekly["draws"],
            "win_rate_percent": weekly["win_rate_percent"]
        },
        "synced_record_last_7_days": weekly,
        "synced_record_last_30_days": monthly,
        "average_match_duration_seconds": weekly["average_match_duration_seconds"],
        "total_deaths": weekly["total_deaths"],
        "average_deaths_per_match": weekly["average_deaths_per_match"]
    }

@router.get("/{username}/split-averages")
async def get_player_split_averages(
    username: str = Path(..., min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$"),
    start: str = Query("all", min_length=1, max_length=64, pattern=r"^[A-Za-z_]+$"),
    bastion: str = Query("all", min_length=1, max_length=64, pattern=r"^[A-Za-z_]+$"),
    db: Session = Depends(get_db)
):

    player = db.query(Player).filter(Player.username.ilike(username)).first()

    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    start_filter = None if start.strip().lower() in ("", "all") else start.strip().lower()
    bastion_filter = None if bastion.strip().lower() in ("", "all") else bastion.strip().lower()

    def _window_split_stats(window_name: str, days: int | None = None):
        where_parts = [
            "ms.player_uuid = :player_uuid",
            "m.player_id = :player_id",
            "m.match_type = 2"
        ]
        params = {"player_uuid": player.uuid, "player_id": player.id}

        if start_filter is not None:
            where_parts.append("LOWER(m.start_overworld) = :start_overworld")
            params["start_overworld"] = start_filter
        if bastion_filter is not None:
            where_parts.append("LOWER(m.bastion_type) = :bastion_type")
            params["bastion_type"] = bastion_filter
        if days is not None:
            where_parts.append("m.played_at >= :cutoff")
            params["cutoff"] = datetime.utcnow() - timedelta(days=days)

        where_sql = " AND ".join(where_parts)
        result = db.execute(text(f"""
            SELECT
                COUNT(*) AS total_split_rows,
                AVG(nether_enter_ms) AS avg_nether_enter_ms,
                AVG(bastion_ms) AS avg_bastion_ms,
                AVG(fortress_ms) AS avg_fortress_ms,
                AVG(first_rod_ms) AS avg_first_rod_ms,
                AVG(blind_ms) AS avg_blind_ms,
                AVG(stronghold_ms) AS avg_stronghold_ms,
                AVG(end_enter_ms) AS avg_end_enter_ms,
                AVG(dragon_death_ms) AS avg_dragon_death_ms,
                AVG(finish_ms) AS avg_finish_ms,
                COUNT(nether_enter_ms) AS samples_nether_enter,
                COUNT(bastion_ms) AS samples_bastion,
                COUNT(fortress_ms) AS samples_fortress,
                COUNT(first_rod_ms) AS samples_first_rod,
                COUNT(blind_ms) AS samples_blind,
                COUNT(stronghold_ms) AS samples_stronghold,
                COUNT(end_enter_ms) AS samples_end_enter,
                COUNT(dragon_death_ms) AS samples_dragon_death,
                COUNT(finish_ms) AS samples_finish
            FROM match_splits ms
            JOIN matches m ON m.id = ms.match_id
            WHERE {where_sql}
        """), params).mappings().first()

        total_rows = (result["total_split_rows"] if result else 0) or 0
        if total_rows == 0:
            return {
                "window": window_name,
                "total_split_rows": 0,
                "averages_ms": {},
                "averages_seconds": {},
                "averages_mmss": {},
                "samples": {}
            }

        averages_ms = {
            "nether_enter": round(result["avg_nether_enter_ms"], 2) if result["avg_nether_enter_ms"] is not None else None,
            "bastion": round(result["avg_bastion_ms"], 2) if result["avg_bastion_ms"] is not None else None,
            "fortress": round(result["avg_fortress_ms"], 2) if result["avg_fortress_ms"] is not None else None,
            "first_rod": round(result["avg_first_rod_ms"], 2) if result["avg_first_rod_ms"] is not None else None,
            "blind": round(result["avg_blind_ms"], 2) if result["avg_blind_ms"] is not None else None,
            "stronghold": round(result["avg_stronghold_ms"], 2) if result["avg_stronghold_ms"] is not None else None,
            "end_enter": round(result["avg_end_enter_ms"], 2) if result["avg_end_enter_ms"] is not None else None,
            "dragon_death": round(result["avg_dragon_death_ms"], 2) if result["avg_dragon_death_ms"] is not None else None,
            "finish": round(result["avg_finish_ms"], 2) if result["avg_finish_ms"] is not None else None
        }
        averages_seconds = {
            key: round(value / 1000, 2) if value is not None else None
            for key, value in averages_ms.items()
        }
        averages_mmss = {
            key: _ms_to_mmss(value)
            for key, value in averages_ms.items()
        }
        samples = {
            "nether_enter": result["samples_nether_enter"],
            "bastion": result["samples_bastion"],
            "fortress": result["samples_fortress"],
            "first_rod": result["samples_first_rod"],
            "blind": result["samples_blind"],
            "stronghold": result["samples_stronghold"],
            "end_enter": result["samples_end_enter"],
            "dragon_death": result["samples_dragon_death"],
            "finish": result["samples_finish"]
        }
        return {
            "window": window_name,
            "total_split_rows": total_rows,
            "averages_ms": averages_ms,
            "averages_seconds": averages_seconds,
            "averages_mmss": averages_mmss,
            "samples": samples
        }

    all_time = _window_split_stats("all_time", None)
    last_7_days = _window_split_stats("last_7_days", 7)
    last_30_days = _window_split_stats("last_30_days", 30)
    start_values = db.execute(text("""
        SELECT DISTINCT LOWER(m.start_overworld) AS start_overworld
        FROM matches m
        WHERE m.player_id = :player_id
          AND m.match_type = 2
          AND m.start_overworld IS NOT NULL
        ORDER BY start_overworld ASC
    """), {"player_id": player.id}).scalars().all()
    start_values = sorted(set([*DEFAULT_START_FILTERS, *start_values]))
    bastion_values = db.execute(text("""
        SELECT DISTINCT LOWER(m.bastion_type) AS bastion_type
        FROM matches m
        WHERE m.player_id = :player_id
          AND m.match_type = 2
          AND m.bastion_type IS NOT NULL
        ORDER BY bastion_type ASC
    """), {"player_id": player.id}).scalars().all()

    return {
        "username": player.username,
        "player_uuid": player.uuid,
        "applied_filters": {
            "start": start_filter or "all",
            "bastion": bastion_filter or "all"
        },
        "available_filters": {
            "starts": start_values,
            "bastions": bastion_values
        },
        "windows": {
            "all_time": all_time,
            "last_7_days": last_7_days,
            "last_30_days": last_30_days
        }
    }
