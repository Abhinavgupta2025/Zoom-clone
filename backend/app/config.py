from __future__ import annotations

import os
from pydantic_settings import BaseSettings



class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./meetings.db"
    REDIS_URL: str = "redis://localhost:6379/0"
    CORS_ORIGINS: str = "https://zoom-clone-amber-three.vercel.app,http://localhost:3000,http://localhost:3001"
    DEFAULT_USER_ID: int = 1
    APP_ENV: str = "development"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip() and o.strip() != "*"]

    class Config:
        env_file = ".env"


settings = Settings()
