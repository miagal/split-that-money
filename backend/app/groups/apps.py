"""Django app configuration for groups and memberships."""

from django.apps import AppConfig


class GroupsConfig(AppConfig):
    """Register the groups feature app with Django."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "app.groups"
