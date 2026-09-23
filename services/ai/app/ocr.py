"""Placeholder for prescription OCR.

Model plan (docs/01-dev-environment.md section 4.2): PaddleOCR standard model first,
RapidOCR-ONNX as fallback. Extracted text is a **suggestion only** for the caregiver
to review; it never creates or fills a medicine, schedule, dose or prescription.
Raw OCR text is never embedded until a caregiver approves it.
"""

from __future__ import annotations


def extract_text(contents: bytes, content_type: str) -> list[str]:
    """Return extracted text lines for an uploaded prescription image/PDF.

    Not implemented yet: wiring the model is Sprint 6 work. This stub exists so the
    endpoint, its auth guard and its upload validation can be built and tested now.
    """
    raise NotImplementedError("OCR model is not wired yet (PaddleOCR planned).")
