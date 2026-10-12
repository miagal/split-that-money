"""Verifies deployment settings derive Django trust values from public Compose inputs."""

from importlib import reload

import app.core.config as config_module


def test_public_host_and_https_port_define_django_trust_values(monkeypatch):
    monkeypatch.delenv("APP_DOMAIN", raising=False)
    monkeypatch.setenv("APP_HOST", "192.0.2.10")
    monkeypatch.setenv("HTTPS_PORT", "8443")

    config = reload(config_module)

    assert config.settings.ALLOWED_HOSTS == ["192.0.2.10"]
    assert config.settings.CSRF_TRUSTED_ORIGINS == ["https://192.0.2.10:8443"]
    assert config.settings.LOCAL_CA_SETUP is True


def test_app_domain_defines_hosts_csrf_and_disables_local_ca_setup(monkeypatch):
    monkeypatch.setenv("APP_DOMAIN", "stm.example.com")
    monkeypatch.setenv("APP_HOST", "192.0.2.10")
    monkeypatch.setenv("HTTP_PORT", "8080")
    monkeypatch.delenv("HTTPS_PORT", raising=False)

    config = reload(config_module)

    assert config.settings.ALLOWED_HOSTS == ["stm.example.com", "192.0.2.10"]
    assert config.settings.CSRF_TRUSTED_ORIGINS == [
        "https://stm.example.com",
        "http://192.0.2.10:8080",
    ]
    assert config.settings.LOCAL_CA_SETUP is False


def test_blank_app_domain_keeps_local_mode(monkeypatch):
    monkeypatch.setenv("APP_DOMAIN", "   ")
    monkeypatch.setenv("APP_HOST", "192.0.2.10")
    monkeypatch.setenv("HTTPS_PORT", "8443")

    config = reload(config_module)

    assert config.settings.ALLOWED_HOSTS == ["192.0.2.10"]
    assert config.settings.LOCAL_CA_SETUP is True
