from __future__ import annotations

"""FastAPI application entry point."""


import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.cache import cache
from app.config import settings
from app.database import init_db
from app.rate_limit import rate_limiter
from app.routers import meetings, websocket
from app.seed import seed
from app.database import AsyncSessionLocal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan — startup + shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting up — initialising DB and Redis...")
    await init_db()
    await cache.connect()

    async with AsyncSessionLocal() as db:
        await seed(db)

    yield

    # Shutdown
    logger.info("Shutting down...")
    await cache.disconnect()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Zoom Clone API",
    description="REST + WebSocket API for the Zoom Clone app",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://zoom-clone-amber-three.vercel.app",
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app|http://localhost:.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Token-bucket rate limit middleware
# ---------------------------------------------------------------------------
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # Skip OPTIONS preflight requests + docs + health
    if request.method == "OPTIONS" or request.url.path in ("/", "/docs", "/redoc", "/openapi.json", "/health"):
        return await call_next(request)

    # Determine client IP (respect reverse-proxy header)
    forwarded_for = request.headers.get("X-Forwarded-For")
    ip = forwarded_for.split(",")[0].strip() if forwarded_for else (
        request.client.host if request.client else "unknown"
    )

    allowed, retry_after, remaining, capacity = await rate_limiter.check(ip, request.url.path)

    if not allowed:
        return Response(
            content=f'{{"detail":"Too many requests. Retry after {retry_after:.1f}s."}}',
            status_code=429,
            media_type="application/json",
            headers={
                "Retry-After": str(int(retry_after) + 1),
                "X-RateLimit-Limit": str(capacity),
                "X-RateLimit-Remaining": "0",
            },
        )

    response = await call_next(request)
    response.headers["X-RateLimit-Limit"] = str(capacity)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    return response


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(meetings.router)
app.include_router(websocket.router)


# ---------------------------------------------------------------------------
# Health & Root endpoints
# ---------------------------------------------------------------------------
@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "Zoom Clone FastAPI Backend",
        "docs_url": "/docs",
        "health_url": "/health",
    }


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok", "version": "1.0.0"}
