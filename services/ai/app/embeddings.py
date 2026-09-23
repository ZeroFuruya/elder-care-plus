"""Placeholder for text embeddings.

Model plan (docs/01-dev-environment.md section 4.2): Qwen3-Embedding, 0.6B first.
Only caregiver-approved extracted prescription text is embedded; retrieval is
filtered by care link and prescription id before any vector search.
"""

from __future__ import annotations


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed caregiver-approved text chunks.

    Not implemented yet: wiring the model is Sprint 8 work. This stub exists so the
    endpoint contract and its auth guard can be built and tested now.
    """
    raise NotImplementedError("Embedding model is not wired yet (Qwen3-Embedding planned).")
