"""Tests for public runtime configuration exposed to API clients."""

import logging

import pytest
from django.test import Client

from app.core.config import settings
from app.core.logging import init_logging


@pytest.mark.django_db
def test_public_config_exposes_registration_flag(client):
    response = client.get("/api/config/public/")

    assert response.status_code == 200
    assert response.json() == {
        "ALLOW_SELF_REGISTRATION": True,
        "SHELL_NETWORK_TIMEOUT_SECONDS": 3,
        "SYNC_REQUEST_TIMEOUT_SECONDS": 8,
    }


@pytest.mark.django_db
def test_public_config_does_not_expose_secret_key(client):
    response = client.get("/api/config/public/")

    assert "DJANGO_SECRET_KEY" not in response.json()


@pytest.mark.django_db
def test_public_config_sets_csrf_cookie_for_browser_clients():
    csrf_client = Client(enforce_csrf_checks=True)

    response = csrf_client.get("/api/config/public/")

    assert response.status_code == 200
    assert "stm_csrftoken" in csrf_client.cookies


def test_application_and_third_party_log_levels_are_configured_separately(monkeypatch):
    monkeypatch.setattr(settings, "LOG_LEVEL", "INFO")
    monkeypatch.setattr(settings, "THIRD_PARTY_LOG_LEVEL", "WARNING")

    init_logging()

    assert logging.getLogger("app").getEffectiveLevel() == logging.INFO
    assert logging.getLogger("third_party_library").getEffectiveLevel() == logging.WARNING
