"""Tests for public runtime configuration exposed to API clients."""

import logging
from importlib import reload

import pytest
from django.test import Client

import app.core.config as config_module
from app.core.config import settings
from app.core.logging import init_logging


@pytest.mark.django_db
def test_public_config_exposes_registration_flag(client):
    response = client.get("/api/config/public/")

    assert response.status_code == 200
    assert response.json() == {
        "ALLOW_SELF_REGISTRATION": True,
        "SHOW_APP_VERSION": False,
        "SHELL_NETWORK_TIMEOUT_SECONDS": 3,
        "SYNC_REQUEST_TIMEOUT_SECONDS": 8,
        "LOCAL_CA_SETUP": True,
        "APP_VERSION": settings.APP_VERSION,
        "APP_GIT": settings.APP_GIT,
    }


def test_show_app_version_defaults_false(monkeypatch):
    monkeypatch.delenv("SHOW_APP_VERSION", raising=False)

    config = reload(config_module)

    assert config.settings.SHOW_APP_VERSION is False


def test_app_identity_defaults_to_containerless_local(monkeypatch):
    monkeypatch.delenv("APP_VERSION", raising=False)
    monkeypatch.delenv("APP_GIT", raising=False)

    config = reload(config_module)

    assert config.settings.APP_VERSION == "lcl"
    assert config.settings.APP_GIT == ""


@pytest.mark.django_db
def test_public_config_exposes_app_identity(client, monkeypatch):
    monkeypatch.setattr(settings, "APP_VERSION", "v1.2.3")
    monkeypatch.setattr(settings, "APP_GIT", "abc1234")

    response = client.get("/api/config/public/")

    assert response.status_code == 200
    assert response.json()["APP_VERSION"] == "v1.2.3"
    assert response.json()["APP_GIT"] == "abc1234"


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
