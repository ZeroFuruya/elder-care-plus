"""Shared-secret guard for every non-health endpoint.

The AI service is called only by trusted server-side logic (an Edge Function or
backend job) and never holds user data, so a shared-secret header is the boundary.
It fails closed: if no secret is configured, the service refuses to do work.
"""

from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings


async def require_shared_secret(
    settings: Annotated[Settings, Depends(get_settings)],
    presented: Annotated[str | None, Header(alias="X-ElderCare-AI-Secret")] = None,
) -> None:
    if not settings.shared_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Shared secret is not configured on this service.",
        )
    if presented is None or not hmac.compare_digest(presented, settings.shared_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing shared secret.",
        )
