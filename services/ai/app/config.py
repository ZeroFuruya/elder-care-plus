"""Configuration, loaded from the environment. No secrets are ever committed."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ELDERCARE_AI_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Shared secret required on every non-health endpoint. Must be set in the
    # Space's secret settings (and in a local git-ignored .env for development).
    shared_secret: str = ""

    # Upload guard rails (docs/00-product-flow.md section 8).
    max_upload_bytes: int = 8 * 1024 * 1024
    allowed_mime_types: tuple[str, ...] = (
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
