"""Centralized configuration management with explicit environment loading."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

_startup_logger = logging.getLogger(__name__)

APP_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = APP_DIR.parent
ROOT_DIR = BACKEND_DIR.parent
ENV_FILE = BACKEND_DIR / ".env"

if ENV_FILE.exists():
    load_dotenv(ENV_FILE)
    _startup_logger.info("Loaded environment from %s", ENV_FILE)
else:
    _startup_logger.warning("No .env file found at %s; using environment/defaults", ENV_FILE)


def _get_bool(name: str, default: str) -> bool:
    """Read a boolean environment variable using true/false strings."""
    return os.getenv(name, default).lower() == "true"


def _get_list(name: str, default: str) -> list[str]:
    """Read a comma-separated environment variable as a trimmed list."""
    raw_value = os.getenv(name, default)
    return [value.strip() for value in raw_value.split(",") if value.strip()]


def _app_domain() -> str:
    """Return the trimmed public hostname, or empty when local mode is active."""
    return os.getenv("APP_DOMAIN", "").strip()


def _https_origin(host: str, port: str) -> str:
    """Build an https origin, omitting the port when it is 443."""
    return f"https://{host}" if port == "443" else f"https://{host}:{port}"


def _http_origin(host: str, port: str) -> str:
    """Build an http origin, omitting the port when it is 80."""
    return f"http://{host}" if port == "80" else f"http://{host}:{port}"


def _get_allowed_hosts() -> list[str]:
    """Prefer Compose public host values when the deployment supplies them."""
    domain = _app_domain()
    host = os.getenv("APP_HOST", "").strip()
    if domain and host:
        return [domain, host]
    if domain:
        return [domain]
    if host:
        return [host]
    return _get_list("ALLOWED_HOSTS", "localhost,127.0.0.1")


def _get_csrf_trusted_origins() -> list[str]:
    """Build trusted browser origins for local HTTPS or domain + HTTP debug."""
    domain = _app_domain()
    host = os.getenv("APP_HOST", "").strip()
    if domain:
        origins = [_https_origin(domain, "443")]
        if host:
            origins.append(_http_origin(host, os.getenv("HTTP_PORT", "8080")))
        return origins
    if not host:
        return _get_list("CSRF_TRUSTED_ORIGINS", "")
    return [_https_origin(host, os.getenv("HTTPS_PORT", "443"))]


def _get_int(name: str, default: str) -> int:
    """Read an integer environment variable.

    This helper mirrors the string-based helpers above and keeps parsing
    explicit and predictable for numeric config values.
    """
    return int(os.getenv(name, default))


def _get_app_version() -> str:
    """Return the baked release label, or containerless local when unset."""
    return os.getenv("APP_VERSION", "lcl").strip() or "lcl"


def _get_app_git() -> str:
    """Return the baked short git SHA, or empty when unset (local builds)."""
    return os.getenv("APP_GIT", "").strip()


class Settings(BaseSettings):
    """Application settings loaded from explicit environment variables."""

    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    THIRD_PARTY_LOG_LEVEL: str = os.getenv("THIRD_PARTY_LOG_LEVEL", "WARNING")
    DJANGO_SECRET_KEY: str = os.getenv("DJANGO_SECRET_KEY", "change-this-secret-key-in-production")
    DJANGO_DEBUG: bool = _get_bool("DJANGO_DEBUG", "true")
    ALLOWED_HOSTS: list[str] = _get_allowed_hosts()
    CSRF_TRUSTED_ORIGINS: list[str] = _get_csrf_trusted_origins()
    LOCAL_CA_SETUP: bool = not bool(_app_domain())
    # True when STM terminates TLS itself (local CA); false when APP_DOMAIN is set and an edge proxy handles HTTPS -> access via subdomain.
    DATABASE_NAME: str = os.getenv("DATABASE_NAME", "split_that_money.sqlite3")
    ALLOW_SELF_REGISTRATION: bool = _get_bool("ALLOW_SELF_REGISTRATION", "true")
    # When false the account dropdown hides the baked version pill.
    SHOW_APP_VERSION: bool = _get_bool("SHOW_APP_VERSION", "false")
    BOOTSTRAP_ADMIN_ENABLED: bool = _get_bool("BOOTSTRAP_ADMIN_ENABLED", "false")
    BOOTSTRAP_ADMIN_EMAIL: str = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "admin@admin.com")
    BOOTSTRAP_ADMIN_PASSWORD: str = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "admin123$")
    BOOTSTRAP_ADMIN_FIRST_NAME: str = os.getenv("BOOTSTRAP_ADMIN_FIRST_NAME", "Admin")
    BOOTSTRAP_ADMIN_LAST_NAME: str = os.getenv("BOOTSTRAP_ADMIN_LAST_NAME", "User")
    SESSION_COOKIE_SECURE: bool = _get_bool("SESSION_COOKIE_SECURE", "false")
    CSRF_COOKIE_SECURE: bool = _get_bool("CSRF_COOKIE_SECURE", "false")
    SESSION_COOKIE_SAMESITE: str = os.getenv("SESSION_COOKIE_SAMESITE", "Lax")
    # Days a session cookie remains valid; converted to seconds in settings.py
    SESSION_COOKIE_AGE_DAYS: int = _get_int("SESSION_COOKIE_AGE_DAYS", "30")
    # Seconds pull-to-reload and Update app wait before using the cached shell
    SHELL_NETWORK_TIMEOUT_SECONDS: int = _get_int("SHELL_NETWORK_TIMEOUT_SECONDS", "3")
    # Seconds one GUI sync request waits before aborting a dead server
    SYNC_REQUEST_TIMEOUT_SECONDS: int = _get_int("SYNC_REQUEST_TIMEOUT_SECONDS", "8")
    # Baked release label (`v1.2.3`, `lcl`, `lcl-cntr`); not an operator Compose setting.
    APP_VERSION: str = _get_app_version()
    # Baked 7-character git SHA, or empty for local builds.
    APP_GIT: str = _get_app_git()

    model_config = SettingsConfigDict(case_sensitive=True)

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls,
        init_settings,
        env_settings,
        dotenv_settings,
        file_secret_settings,
    ):
        """Use explicit os.getenv values instead of Pydantic environment parsing."""
        return (init_settings,)


PUBLIC_CONFIG_VARS = [
    "ALLOW_SELF_REGISTRATION",
    "SHOW_APP_VERSION",
    "SHELL_NETWORK_TIMEOUT_SECONDS",
    "SYNC_REQUEST_TIMEOUT_SECONDS",
    "LOCAL_CA_SETUP",
    "APP_VERSION",
    "APP_GIT",
]

settings = Settings()
