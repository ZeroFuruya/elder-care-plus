from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings

SECRET = "test-secret-value"
AUTH_HEADERS = {"X-ElderCare-AI-Secret": SECRET}


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("ELDERCARE_AI_SHARED_SECRET", SECRET)
    get_settings.cache_clear()
    from main import app

    return TestClient(app)


def test_health_is_public(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_ocr_requires_shared_secret(client: TestClient) -> None:
    response = client.post("/ocr", files={"file": ("rx.png", b"x", "image/png")})
    assert response.status_code == 401


def test_ocr_rejects_wrong_secret(client: TestClient) -> None:
    response = client.post(
        "/ocr",
        files={"file": ("rx.png", b"x", "image/png")},
        headers={"X-ElderCare-AI-Secret": "not-the-secret"},
    )
    assert response.status_code == 401


def test_ocr_rejects_unsupported_mime_type(client: TestClient) -> None:
    response = client.post(
        "/ocr",
        files={"file": ("payload.exe", b"x", "application/octet-stream")},
        headers=AUTH_HEADERS,
    )
    assert response.status_code == 415


def test_ocr_accepts_valid_upload_but_model_is_not_wired(client: TestClient) -> None:
    response = client.post(
        "/ocr",
        files={"file": ("rx.png", b"synthetic-image-bytes", "image/png")},
        headers=AUTH_HEADERS,
    )
    assert response.status_code == 501


def test_embed_requires_shared_secret(client: TestClient) -> None:
    response = client.post("/embed/text", json={"texts": ["synthetic text"]})
    assert response.status_code == 401


def test_embed_accepts_valid_request_but_model_is_not_wired(client: TestClient) -> None:
    response = client.post(
        "/embed/text",
        json={"texts": ["synthetic text"]},
        headers=AUTH_HEADERS,
    )
    assert response.status_code == 501
