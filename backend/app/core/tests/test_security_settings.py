"""Verifies Django recognizes HTTPS after the private Caddy proxy."""

from django.conf import settings
from django.conf import settings as django_settings


def test_caddy_https_proxy_header_is_trusted():
    assert settings.SECURE_PROXY_SSL_HEADER == ("HTTP_X_FORWARDED_PROTO", "https")


def test_session_cookie_age_defaults_to_fourteen_days():
    assert django_settings.SESSION_COOKIE_AGE == 14 * 24 * 60 * 60


def test_session_expiry_renews_on_every_request():
    assert django_settings.SESSION_SAVE_EVERY_REQUEST is True
