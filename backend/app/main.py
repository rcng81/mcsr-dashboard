import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette import status
from app.db.session import engine, Base
from app.services.cache import get_redis_client
from app.models import player
from app.routes.player import router as player_router
from app.models.match import Match

APP_ENV = os.getenv("APP_ENV", "development").lower()
IS_PROD = APP_ENV == "production"

docs_url = None if IS_PROD else "/docs"
redoc_url = None if IS_PROD else "/redoc"
openapi_url = None if IS_PROD else "/openapi.json"
app = FastAPI(docs_url=docs_url, redoc_url=redoc_url, openapi_url=openapi_url)

allowed_origins_raw = os.getenv(
    "CORS_ALLOW_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173"
)
allowed_origins = [o.strip() for o in allowed_origins_raw.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"]
)

allowed_hosts_raw = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1")
allowed_hosts = [h.strip() for h in allowed_hosts_raw.split(",") if h.strip()]
app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # Frontend should be served over HTTPS in production.
    if IS_PROD:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    return response


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.method == "OPTIONS" or request.url.path == "/health":
        return await call_next(request)

    client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if not client_ip:
        client_ip = request.client.host if request.client else "unknown"

    path = request.url.path
    if path.endswith("/sync-matches") or path.endswith("/sync-dashboard"):
        limit = 20
        window_seconds = 600
    else:
        limit = 120
        window_seconds = 60

    key = f"rl:{client_ip}:{path}:{window_seconds}"
    try:
        redis_client = get_redis_client()
        current = await redis_client.incr(key)
        if current == 1:
            await redis_client.expire(key, window_seconds)
        if current > limit:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Rate limit exceeded. Try again later."}
            )
    except Exception:
        # Never hard-fail requests because limiter backend is unavailable.
        pass

    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, __: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Invalid request parameters."}
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, __: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error."}
    )

Base.metadata.create_all(bind=engine)

with engine.begin() as conn:
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS match_splits (
            id SERIAL PRIMARY KEY,
            match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
            player_uuid VARCHAR NOT NULL,
            nether_enter_ms DOUBLE PRECISION,
            bastion_ms DOUBLE PRECISION,
            fortress_ms DOUBLE PRECISION,
            first_rod_ms DOUBLE PRECISION,
            blind_ms DOUBLE PRECISION,
            stronghold_ms DOUBLE PRECISION,
            end_enter_ms DOUBLE PRECISION,
            dragon_death_ms DOUBLE PRECISION,
            finish_ms DOUBLE PRECISION
        )
    """))
    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_match_splits_match_player ON match_splits (match_id, player_uuid)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_match_splits_player_uuid ON match_splits (player_uuid)"))

    conn.execute(text("ALTER TABLE matches ADD COLUMN IF NOT EXISTS death_count INTEGER NOT NULL DEFAULT 0"))
    conn.execute(text("ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_draw BOOLEAN NOT NULL DEFAULT FALSE"))
    conn.execute(text("ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_type INTEGER"))
    conn.execute(text("ALTER TABLE matches ADD COLUMN IF NOT EXISTS start_overworld VARCHAR"))
    conn.execute(text("ALTER TABLE matches ADD COLUMN IF NOT EXISTS bastion_type VARCHAR"))
    conn.execute(text("ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_match_uuid_key"))
    conn.execute(text("DROP INDEX IF EXISTS ix_matches_match_uuid"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_matches_match_uuid ON matches (match_uuid)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_matches_match_type ON matches (match_type)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_matches_start_overworld ON matches (start_overworld)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_matches_bastion_type ON matches (bastion_type)"))
    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_matches_player_match_uuid ON matches (player_id, match_uuid)"))

app.include_router(player_router)

@app.get("/health")
def health_check():
    return {"status": "ok"}
