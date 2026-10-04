"""Tests for the custom email-based user model."""

import pytest

from app.accounts.models import User


@pytest.mark.django_db
def test_create_user_normalizes_email_and_sets_display_name():
    user = User.objects.create_user(
        email="TEST@Example.COM",
        password="secret123",
        first_name="Test",
        last_name="User",
    )

    assert user.email == "TEST@example.com"
    assert user.display_name == "Test User"
    assert user.check_password("secret123")
    assert not user.is_staff
    assert not user.is_superuser


@pytest.mark.django_db
def test_create_superuser_sets_admin_flags():
    user = User.objects.create_superuser(
        email="admin@example.com",
        password="secret123",
        first_name="Admin",
        last_name="User",
    )

    assert user.is_staff
    assert user.is_superuser
