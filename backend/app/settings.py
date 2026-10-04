"""Django settings for the Split That Money backend."""

from pathlib import Path

from app.core.config import settings
from app.core.logging import init_logging

BASE_DIR = Path(__file__).resolve().parents[1]

SECRET_KEY = settings.DJANGO_SECRET_KEY
DEBUG = settings.DJANGO_DEBUG
ALLOWED_HOSTS = settings.ALLOWED_HOSTS
CSRF_TRUSTED_ORIGINS = settings.CSRF_TRUSTED_ORIGINS
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "app.core",
    "app.accounts",
    "app.groups",
    "app.expenses",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "app.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "app.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / settings.DATABASE_NAME,
    }
}

AUTH_USER_MODEL = "accounts.User"

REST_FRAMEWORK = {
    "EXCEPTION_HANDLER": "app.core.exception_handler.api_exception_handler",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# App-specific names keep other apps on the same host from overwriting these cookies; browsers ignore ports.
SESSION_COOKIE_NAME = "stm_sessionid"
CSRF_COOKIE_NAME = "stm_csrftoken"
SESSION_COOKIE_SECURE = settings.SESSION_COOKIE_SECURE
CSRF_COOKIE_SECURE = settings.CSRF_COOKIE_SECURE
SESSION_COOKIE_SAMESITE = settings.SESSION_COOKIE_SAMESITE
SESSION_COOKIE_AGE = settings.SESSION_COOKIE_AGE_DAYS * 24 * 60 * 60 # Convert days -> seconds
# Sliding expiry: every request renews the session, so SESSION_COOKIE_AGE counts from last use, not from login.
# This writes the session on every request; re-evaluate if the user base grows.
SESSION_SAVE_EVERY_REQUEST = True

LOGGING_CONFIG = None
init_logging()
