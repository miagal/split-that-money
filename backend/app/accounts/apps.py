"""Django app configuration for account identity and lifecycle rules."""

from django.apps import AppConfig


class AccountsConfig(AppConfig):
    """Register the accounts feature app with Django."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "app.accounts"
