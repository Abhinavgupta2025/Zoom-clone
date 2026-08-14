from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import init_db
from app.rate_limit import rate_limiter
from app.routers import auth, meetings, websocket
from app.seed import seed_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise DB tables and seed default user data on startup."""
    logger.info("Initializing database schema...")
    await init_db()
    logger.info("Seeding database with initial data...")
    await seed_db()
    logger.info("Startup complete.")
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for dev & Vercel deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Token Bucket Rate Limiting Middleware
# ---------------------------------------------------------------------------
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # Bypass health check, docs, and websocket from rate limit
    path = request.url.path
    if path in ("/", "/health", "/docs", "/openapi.json") or path.startswith("/ws"):
        return await call_next(request)

    client_ip = request.client.host if request.client else "127.0.0.1"
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    allowed, retry_after, remaining, capacity = await rate_limiter.check(client_ip, path)
    if not allowed:
        logger.warning(f"Rate limit exceeded for IP: {client_ip} on path: {path}")
        return JSONResponse(
            status_code=429,
            content={"detail": f"Too many requests. Please retry in {retry_after:.1f}s."},
            headers={"Retry-After": str(int(retry_after) + 1)},
        )

    response = await call_next(request)
    return response


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(auth.router)
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
