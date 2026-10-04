"""Django app configuration for expense and settlement bookkeeping."""

from django.apps import AppConfig


class ExpensesConfig(AppConfig):
    """Register the expenses feature app with Django."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "app.expenses"
