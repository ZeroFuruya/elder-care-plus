# services/ai

FastAPI service for prescription OCR and caregiver-approved text embeddings.
Deployed as a **Hugging Face Space (Docker SDK, free CPU)** on port **7860**.

This service has a deliberately narrow footprint: OCR and text embeddings only.
There is no image-similarity model, and it is never a source of clinical advice.

## Endpoints

| Method | Path          | Auth          | Purpose                                        |
| ------ | ------------- | ------------- | ---------------------------------------------- |
| `GET`  | `/health`     | public        | liveness probe for wake/retry checks           |
| `POST` | `/ocr`        | shared secret | prescription photo → reference-only text lines |
| `POST` | `/embed/text` | shared secret | caregiver-approved text → embeddings           |

Every non-health endpoint requires the `X-ElderCare-AI-Secret` header. The service
**fails closed**: with no `ELDERCARE_AI_SHARED_SECRET` configured it returns `503`
rather than doing unauthenticated work.

OCR output is `reference_only: true` by contract. It can never auto-create or
auto-fill a medicine, schedule, dose, prescription or clinical advice — the
caregiver reviews and enters every field. Raw OCR text is never embedded; only
caregiver-approved text is.

## Status in this scaffold

`/health` and the auth/upload validation are real and tested. `/ocr` and
`/embed/text` return `501` until the models are wired (PaddleOCR for OCR in
Sprint 6, Qwen3-Embedding in Sprint 8).

## Commands

```bash
cd services/ai
uv sync                                            # light: FastAPI only
uv run uvicorn main:app --reload                   # dev server, port 8000
uv run pytest                                      # service tests
uv run ruff check .

# When a sprint actually needs the models:
uv sync --extra ml                                 # PaddleOCR, RapidOCR, sentence-transformers
```

Run with no `.env` and you will get `503` on `/ocr` — that is the guard working.
For local development use the git-ignored `.env` (see `.env.example`).

## Rules

- Never log images, extracted prescription text or embeddings.
- Never send real prescription photos or real health data here (or to any AI tool).
- Secrets live in the Space's secret settings, never in the repo.
- The owner's PC behind a tunnel is the fallback if the Space sleeps during a demo.
