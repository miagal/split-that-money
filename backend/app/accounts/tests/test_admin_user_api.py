"""Tests for admin-only user management APIs."""

import pytest
from django.db import IntegrityError

from app.accounts.models import User
from app.core.config import settings as core_settings


@pytest.mark.django_db
def test_admin_can_list_users(client):
    admin = User.objects.create_superuser("admin@example.com", "secret123", first_name="Admin", last_name="User")
    User.objects.create_user("person@example.com", "secret123", first_name="Person", last_name="Example")
    client.force_login(admin)

    response = client.get("/api/admin/users/")

    assert response.status_code == 200
    emails = {user["email"] for user in response.json()}
    assert emails == {"admin@example.com", "person@example.com"}


@pytest.mark.django_db
def test_admin_can_create_user_when_registration_is_disabled(client, monkeypatch):
    monkeypatch.setattr(core_settings, "ALLOW_SELF_REGISTRATION", False)
    admin = User.objects.create_superuser("admin@example.com", "secret123", first_name="Admin", last_name="User")
    client.force_login(admin)

    response = client.post(
        "/api/admin/users/",
        {"email": "person@example.com", "password": "secret123", "first_name": "Person", "last_name": "Example"},
        content_type="application/json",
    )

    assert response.status_code == 201
    assert User.objects.filter(email="person@example.com").exists()


@pytest.mark.django_db
def test_admin_create_user_returns_validation_error_for_missing_fields(client):
    admin = User.objects.create_superuser("admin@example.com", "secret123", first_name="Admin", last_name="User")
    client.force_login(admin)

    response = client.post(
        "/api/admin/users/",
        {"email": "person@example.com", "first_name": "Person", "last_name": "Example"},
        content_type="application/json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "code": "validation_error",
        "message": "Please correct the highlighted fields.",
        "fields": {"password": ["This field is required."]},
    }


@pytest.mark.django_db
def test_admin_create_user_returns_validation_error_for_duplicate_email(client):
    admin = User.objects.create_superuser("admin@example.com", "secret123", first_name="Admin", last_name="User")
    User.objects.create_user("person@example.com", "secret123", first_name="Person", last_name="Example")
    client.force_login(admin)

    response = client.post(
        "/api/admin/users/",
        {"email": "person@example.com", "password": "newpass123", "first_name": "Other", "last_name": "User"},
        content_type="application/json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "code": "validation_error",
        "message": "Please correct the highlighted fields.",
        "fields": {"email": ["A user with this email already exists."]},
    }


@pytest.mark.django_db
def test_non_admin_cannot_create_user(client):
    user = User.objects.create_user("person@example.com", "secret123", first_name="Person", last_name="Example")
    client.force_login(user)

    response = client.post(
        "/api/admin/users/",
        {"email": "other@example.com", "password": "secret123", "first_name": "Other", "last_name": "User"},
        content_type="application/json",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_admin_can_get_user_detail(client):
    admin = User.objects.create_superuser("admin@example.com", "secret123", first_name="Admin", last_name="User")
    user = User.objects.create_user("person@example.com", "secret123", first_name="Person", last_name="Example")
    client.force_login(admin)

    response = client.get(f"/api/admin/users/{user.id}/")

    assert response.status_code == 200
    assert response.json()["email"] == "person@example.com"


@pytest.mark.django_db
def test_admin_patch_updates_only_allowed_user_fields(client):
    admin = User.objects.create_superuser("admin@example.com", "secret123", first_name="Admin", last_name="User")
    user = User.objects.create_user("person@example.com", "secret123", first_name="Person", last_name="Example")
    client.force_login(admin)

    response = client.patch(
        f"/api/admin/users/{user.id}/",
        {
            "email": "updated@example.com",
            "first_name": "Updated",
            "last_name": "Example",
            "is_staff": True,
            "is_superuser": True,
            "is_active": False,
            "password": "ignoredpass",
        },
        content_type="application/json",
    )

    user.refresh_from_db()
    assert response.status_code == 200
    assert user.email == "updated@example.com"
    assert user.first_name == "Updated"
    assert user.last_name == "Example"
    assert user.is_staff
    assert user.is_superuser
    assert not user.is_active
    assert user.check_password("secret123")


@pytest.mark.django_db
def test_admin_patch_returns_validation_error_for_duplicate_email(client):
    admin = User.objects.create_superuser("admin@example.com", "secret123", first_name="Admin", last_name="User")
    user = User.objects.create_user("person@example.com", "secret123", first_name="Person", last_name="Example")
    User.objects.create_user("other@example.com", "secret123", first_name="Other", last_name="User")
    client.force_login(admin)

    response = client.patch(
        f"/api/admin/users/{user.id}/",
        {"email": "other@example.com"},
        content_type="application/json",
    )

    user.refresh_from_db()
    assert response.status_code == 400
    assert response.json() == {
        "code": "validation_error",
        "message": "Please correct the highlighted fields.",
        "fields": {"email": ["A user with this email already exists."]},
    }
    assert user.email == "person@example.com"


@pytest.mark.django_db
def test_admin_can_reset_password(client):
    admin = User.objects.create_superuser("admin@example.com", "secret123", first_name="Admin", last_name="User")
    user = User.objects.create_user("person@example.com", "oldpass123", first_name="Person", last_name="Example")
    client.force_login(admin)

    response = client.post(
        f"/api/admin/users/{user.id}/reset-password/",
        {"password": "newpass123"},
        content_type="application/json",
    )

    user.refresh_from_db()
    assert response.status_code == 204
    assert user.check_password("newpass123")


@pytest.mark.django_db
def test_admin_reset_password_returns_validation_error_for_missing_password(client):
    admin = User.objects.create_superuser("admin@example.com", "secret123", first_name="Admin", last_name="User")
    user = User.objects.create_user("person@example.com", "oldpass123", first_name="Person", last_name="Example")
    client.force_login(admin)

    response = client.post(
        f"/api/admin/users/{user.id}/reset-password/",
        {},
        content_type="application/json",
    )

    user.refresh_from_db()
    assert response.status_code == 400
    assert response.json() == {
        "code": "validation_error",
        "message": "Please correct the highlighted fields.",
        "fields": {"password": ["This field is required."]},
    }
    assert user.check_password("oldpass123")


@pytest.mark.django_db
def test_admin_can_deactivate_and_reactivate_user(client):
    admin = User.objects.create_superuser("admin@example.com", "secret123", first_name="Admin", last_name="User")
    user = User.objects.create_user("person@example.com", "secret123", first_name="Person", last_name="Example")
    client.force_login(admin)

    deactivate = client.post(f"/api/admin/users/{user.id}/deactivate/")
    user.refresh_from_db()
    reactivate = client.post(f"/api/admin/users/{user.id}/reactivate/")
    user.refresh_from_db()

    assert deactivate.status_code == 204
    assert reactivate.status_code == 204
    assert user.is_active


@pytest.mark.django_db
def test_email_uniqueness_remains_enforced_after_deactivation(client):
    admin = User.objects.create_superuser("admin@example.com", "secret123", first_name="Admin", last_name="User")
    user = User.objects.create_user("person@example.com", "secret123", first_name="Person", last_name="Example")
    client.force_login(admin)

    deactivate = client.post(f"/api/admin/users/{user.id}/deactivate/")

    assert deactivate.status_code == 204
    with pytest.raises(IntegrityError):
        User.objects.create_user("person@example.com", "secret123", first_name="Other", last_name="User")
