# ElderCare+ AI service — Hugging Face Space (Docker SDK, free CPU), port 7860.
# Heavy OCR/embedding models are added in Sprint 6/8 via the `ml` extra.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_PROJECT_ENVIRONMENT=/app/.venv

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install runtime dependencies first for layer caching.
COPY pyproject.toml ./
RUN uv sync --no-install-project --no-dev

COPY main.py ./
COPY app ./app

EXPOSE 7860

CMD ["uv", "run", "--no-dev", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
