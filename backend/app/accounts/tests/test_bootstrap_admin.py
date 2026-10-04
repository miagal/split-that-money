"""Tests for the bootstrap admin management command."""

import pytest
from django.core.management import call_command

from app.accounts.models import User
from app.core.config import settings as core_settings


@pytest.mark.django_db
def test_bootstrap_admin_does_nothing_when_disabled(monkeypatch):
    monkeypatch.setattr(core_settings, "BOOTSTRAP_ADMIN_ENABLED", False)

    call_command("bootstrap_admin")

    assert User.objects.count() == 0


@pytest.mark.django_db
def test_bootstrap_admin_creates_superuser_once(monkeypatch):
    monkeypatch.setattr(core_settings, "BOOTSTRAP_ADMIN_ENABLED", True)
    monkeypatch.setattr(core_settings, "BOOTSTRAP_ADMIN_EMAIL", "admin@example.com")
    monkeypatch.setattr(core_settings, "BOOTSTRAP_ADMIN_PASSWORD", "secret123")
    monkeypatch.setattr(core_settings, "BOOTSTRAP_ADMIN_FIRST_NAME", "Admin")
    monkeypatch.setattr(core_settings, "BOOTSTRAP_ADMIN_LAST_NAME", "User")

    call_command("bootstrap_admin")
    call_command("bootstrap_admin")

    user = User.objects.get(email="admin@example.com")
    assert User.objects.filter(email="admin@example.com").count() == 1
    assert user.is_staff and user.is_superuser and user.check_password("secret123")
    assert user.first_name == "Admin"
    assert user.last_name == "User"


@pytest.mark.django_db
def test_bootstrap_admin_does_not_overwrite_existing_user(monkeypatch):
    monkeypatch.setattr(core_settings, "BOOTSTRAP_ADMIN_ENABLED", True)

    User.objects.create_superuser("admin@example.com", "oldpass123", first_name="Old", last_name="Keeper")
    monkeypatch.setattr(core_settings, "BOOTSTRAP_ADMIN_EMAIL", "admin@example.com")
    monkeypatch.setattr(core_settings, "BOOTSTRAP_ADMIN_PASSWORD", "newpass123")
    monkeypatch.setattr(core_settings, "BOOTSTRAP_ADMIN_FIRST_NAME", "New")
    monkeypatch.setattr(core_settings, "BOOTSTRAP_ADMIN_LAST_NAME", "Admin")

    call_command("bootstrap_admin")

    user = User.objects.get(email="admin@example.com")
    assert user.check_password("oldpass123")
    assert user.first_name == "Old"
    assert user.last_name == "Keeper"
