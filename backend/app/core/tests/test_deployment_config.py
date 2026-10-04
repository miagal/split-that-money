"""Verifies deployment settings derive Django trust values from public Compose inputs."""

from importlib import reload

import app.core.config as config_module


def test_public_host_and_https_port_define_django_trust_values(monkeypatch):
    monkeypatch.setenv("APP_HOST", "192.0.2.10")
    monkeypatch.setenv("HTTPS_PORT", "8443")

    config = reload(config_module)

    assert config.settings.ALLOWED_HOSTS == ["192.0.2.10"]
    assert config.settings.CSRF_TRUSTED_ORIGINS == ["https://192.0.2.10:8443"]
