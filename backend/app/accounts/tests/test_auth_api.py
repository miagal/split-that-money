"""Tests for registration, login, logout, and current-user APIs."""

import pytest
from django.test import Client

from app.accounts.models import User
from app.core.config import settings as core_settings


@pytest.mark.django_db
def test_register_creates_normal_user(client):
    response = client.post(
        "/api/auth/register/",
        {
            "email": "person@example.com",
            "password": "secret123",
            "first_name": "Person",
            "last_name": "Example",
        },
        content_type="application/json",
    )

    assert response.status_code == 201
    user = User.objects.get(email="person@example.com")
    assert user.check_password("secret123")
    assert not user.is_staff


@pytest.mark.django_db
def test_register_returns_structured_error_when_disabled(client, monkeypatch):
    monkeypatch.setattr(core_settings, "ALLOW_SELF_REGISTRATION", False)

    response = client.post(
        "/api/auth/register/",
        {
            "email": "person@example.com",
            "password": "secret123",
            "first_name": "Person",
            "last_name": "Example",
        },
        content_type="application/json",
    )

    assert response.status_code == 403
    assert response.json() == {"code": "registration_disabled", "message": "Self-registration is disabled."}


@pytest.mark.django_db
def test_register_duplicate_email_is_safe_and_inline(client):
    User.objects.create_user(
        email="person@example.com",
        password="secret123",
        first_name="Person",
        last_name="Example",
    )

    response = client.post(
        "/api/auth/register/",
        {
            "email": "person@example.com",
            "password": "valid-password",
            "first_name": "New",
            "last_name": "User",
        },
        content_type="application/json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "code": "email_already_exists",
        "message": "An account with this email already exists. Sign in instead or use another email.",
        "fields": {"email": ["An account with this email already exists."]},
    }


@pytest.mark.django_db
def test_register_returns_safe_fields_for_malformed_payload(client):
    response = client.post(
        "/api/auth/register/",
        {
            "email": "not-an-email",
            "password": "valid-password",
            "first_name": "New",
            "last_name": "User",
        },
        content_type="application/json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "code": "validation_error",
        "message": "Please correct the highlighted fields.",
        "fields": {"email": ["Enter a valid email address."]},
    }


@pytest.mark.django_db
def test_login_reactivates_deactivated_user(client):
    User.objects.create_user(
        email="person@example.com",
        password="secret123",
        first_name="Person",
        last_name="Example",
        is_active=False,
    )

    response = client.post(
        "/api/auth/login/",
        {"email": "person@example.com", "password": "secret123"},
        content_type="application/json",
    )

    assert response.status_code == 200
    assert User.objects.get(email="person@example.com").is_active


@pytest.mark.django_db
def test_login_returns_structured_error_for_invalid_credentials(client):
    User.objects.create_user(
        email="person@example.com",
        password="secret123",
        first_name="Person",
        last_name="Example",
    )

    response = client.post(
        "/api/auth/login/",
        {"email": "person@example.com", "password": "wrongpass"},
        content_type="application/json",
    )

    assert response.status_code == 400
    assert response.json() == {"code": "invalid_credentials", "message": "Invalid email or password."}


@pytest.mark.django_db
def test_login_requires_csrf_when_csrf_checks_are_enabled():
    User.objects.create_user(
        email="person@example.com",
        password="secret123",
        first_name="Person",
        last_name="Example",
    )
    csrf_client = Client(enforce_csrf_checks=True)

    response = csrf_client.post(
        "/api/auth/login/",
        {"email": "person@example.com", "password": "secret123"},
        content_type="application/json",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_logout_clears_current_session(client):
    User.objects.create_user(
        email="person@example.com",
        password="secret123",
        first_name="Person",
        last_name="Example",
    )

    client.post(
        "/api/auth/login/",
        {"email": "person@example.com", "password": "secret123"},
        content_type="application/json",
    )
    logout_response = client.post("/api/auth/logout/")
    me_response = client.get("/api/auth/me/")

    assert logout_response.status_code == 204
    assert me_response.status_code in {401, 403}


@pytest.mark.django_db
def test_logout_without_session_returns_no_content(client):
    response = client.post("/api/auth/logout/")

    assert response.status_code == 204


@pytest.mark.django_db
def test_me_requires_login(client):
    response = client.get("/api/auth/me/")

    assert response.status_code in {401, 403}


@pytest.mark.django_db
def test_me_returns_current_user_after_login(client):
    User.objects.create_user(
        email="person@example.com",
        password="secret123",
        first_name="Person",
        last_name="Example",
    )

    client.post(
        "/api/auth/login/",
        {"email": "person@example.com", "password": "secret123"},
        content_type="application/json",
    )
    response = client.get("/api/auth/me/")

    assert response.status_code == 200
    assert response.json()["email"] == "person@example.com"
