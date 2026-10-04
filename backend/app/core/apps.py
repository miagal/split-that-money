"""Django app configuration for project-wide backend infrastructure."""

from django.apps import AppConfig


class CoreConfig(AppConfig):
    """Register the core infrastructure app with Django."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "app.core"
