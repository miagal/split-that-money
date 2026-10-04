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


def _get_allowed_hosts() -> list[str]:
    """Prefer the public Compose host when the deployment supplies one."""
    return [os.environ["APP_HOST"]] if os.getenv("APP_HOST") else _get_list("ALLOWED_HOSTS", "localhost,127.0.0.1")


def _get_csrf_trusted_origins() -> list[str]:
    """Build the public HTTPS origin from Compose inputs when available."""
    host = os.getenv("APP_HOST")
    if not host:
        return _get_list("CSRF_TRUSTED_ORIGINS", "")
    port = os.getenv("HTTPS_PORT", "443")
    return [f"https://{host}" if port == "443" else f"https://{host}:{port}"]


def _get_int(name: str, default: str) -> int:
    """Read an integer environment variable.

    This helper mirrors the string-based helpers above and keeps parsing
    explicit and predictable for numeric config values.
    """
    return int(os.getenv(name, default))


class Settings(BaseSettings):
    """Application settings loaded from explicit environment variables."""

    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    THIRD_PARTY_LOG_LEVEL: str = os.getenv("THIRD_PARTY_LOG_LEVEL", "WARNING")
    DJANGO_SECRET_KEY: str = os.getenv("DJANGO_SECRET_KEY", "change-this-secret-key-in-production")
    DJANGO_DEBUG: bool = _get_bool("DJANGO_DEBUG", "true")
    ALLOWED_HOSTS: list[str] = _get_allowed_hosts()
    CSRF_TRUSTED_ORIGINS: list[str] = _get_csrf_trusted_origins()
    DATABASE_NAME: str = os.getenv("DATABASE_NAME", "split_that_money.sqlite3")
    ALLOW_SELF_REGISTRATION: bool = _get_bool("ALLOW_SELF_REGISTRATION", "true")
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
    # Seconds the installed app waits for the server before starting from cache
    SHELL_NETWORK_TIMEOUT_SECONDS: int = _get_int("SHELL_NETWORK_TIMEOUT_SECONDS", "3")
    # Seconds one GUI sync request waits before aborting a dead server
    SYNC_REQUEST_TIMEOUT_SECONDS: int = _get_int("SYNC_REQUEST_TIMEOUT_SECONDS", "8")

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
    "SHELL_NETWORK_TIMEOUT_SECONDS",
    "SYNC_REQUEST_TIMEOUT_SECONDS",
]

settings = Settings()
