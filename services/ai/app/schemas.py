"""Request/response contracts for the AI service."""

from __future__ import annotations

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "eldercare-ai"


class EmbedTextRequest(BaseModel):
    """Only caregiver-approved prescription text may be embedded, never raw OCR output."""

    texts: list[str] = Field(min_length=1)


class EmbedTextResponse(BaseModel):
    model: str
    dimensions: int
    embeddings: list[list[float]]
