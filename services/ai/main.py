"""ElderCare+ AI service.

Endpoints (docs/01-dev-environment.md section 8.3):
  GET  /health       public liveness probe
  POST /ocr          prescription photo -> reference-only extracted text
  POST /embed/text   caregiver-approved text -> embeddings

The AI service never holds user data and never logs images, extracted text or
embeddings. It is called only by trusted server-side logic with a shared secret.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status

from app.config import Settings, get_settings
from app.embeddings import embed_texts
from app.ocr import extract_text
from app.schemas import EmbedTextRequest, EmbedTextResponse, HealthResponse
from app.security import require_shared_secret

app = FastAPI(title="ElderCare+ AI service", version="0.0.0")


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse()


def _validate_upload(file: UploadFile, contents: bytes, settings: Settings) -> None:
    """Reject unsupported MIME types and out-of-bounds sizes before any processing."""
    content_type = (file.content_type or "").lower()
    if content_type not in settings.allowed_mime_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported file type.",
        )
    if not contents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty upload.")
    if len(contents) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Upload exceeds the size limit.",
        )


@app.post("/ocr", dependencies=[Depends(require_shared_secret)])
async def ocr(
    settings: Annotated[Settings, Depends(get_settings)],
    file: Annotated[UploadFile, File()],
) -> dict[str, object]:
    contents = await file.read(settings.max_upload_bytes + 1)
    _validate_upload(file, contents, settings)
    try:
        lines = extract_text(contents, file.content_type or "")
    except NotImplementedError as exc:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(exc)) from exc
    # `reference_only` is explicit: OCR output can never auto-create or auto-fill records.
    return {"lines": lines, "reference_only": True}


@app.post("/embed/text", dependencies=[Depends(require_shared_secret)])
async def embed_text(payload: EmbedTextRequest) -> EmbedTextResponse:
    try:
        vectors = embed_texts(payload.texts)
    except NotImplementedError as exc:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(exc)) from exc
    return EmbedTextResponse(
        model="qwen3-embedding-0.6b",
        dimensions=len(vectors[0]) if vectors else 0,
        embeddings=vectors,
    )
