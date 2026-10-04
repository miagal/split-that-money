"""Application logging configuration for Django and project code."""

import logging
import logging.config
import sys
from pathlib import Path

from app.core.config import settings


def init_logging() -> None:
    """Initialize console and rotating file logging for the backend."""
    log_dir = Path(__file__).resolve().parents[1] / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "standard": {
                    "format": "%(asctime)s | %(levelname)-8s | %(filename)s | line: %(lineno)d | %(funcName)-8s() | %(name)s - %(message)s",
                    "datefmt": "%Y-%m-%d %H:%M:%S",
                },
            },
            # Write every accepted record to the terminal and the rotating log file.
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "standard",
                    "level": "NOTSET",
                    "stream": sys.stdout,
                },
                "file": {
                    "class": "logging.handlers.RotatingFileHandler",
                    "formatter": "standard",
                    "level": "NOTSET",
                    "filename": str(log_dir / "app.log"),
                    "mode": "a",
                    "maxBytes": 10 * 1024 * 1024,
                    "backupCount": 5,
                    "encoding": "utf-8",
                },
            },
            # Use the quieter third-party level unless a logger defines its own level.
            "root": {"handlers": ["console", "file"], "level": settings.THIRD_PARTY_LOG_LEVEL},
            "loggers": {
                # Keep application diagnostics independently configurable through LOG_LEVEL.
                "app": {"level": settings.LOG_LEVEL, "propagate": True},
                # Optional: configure third-party loggers independently
                # "django": {"level": WARNING, "propagate": True},
            },
        }
    )


def get_logger(name: str) -> logging.Logger:
    """Return a configured logger instance for the given module name."""
    return logging.getLogger(name)
