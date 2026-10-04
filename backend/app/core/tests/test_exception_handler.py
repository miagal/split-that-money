"""Tests for the public API error envelope used by DRF expected failures."""

import pytest
from rest_framework.exceptions import (
    APIException,
    AuthenticationFailed,
    ErrorDetail,
    NotAuthenticated,
    NotFound,
    PermissionDenied,
    ValidationError,
)

from app.core.exception_handler import api_exception_handler, normalize_fields


class CustomApiException(APIException):
    """Represent a framework/provider error whose default detail is private."""

    status_code = 418
    default_code = "custom_failure"
    default_detail = "provider secret detail"


def test_exception_handler_normalizes_validation_fields(rf):
    request = rf.post("/api/auth/register/", {}, format="json")
    exception = ValidationError(
        {"email": [ErrorDetail("Enter a valid email address.", code="invalid")]}
    )

    response = api_exception_handler(exception, {"request": request})

    assert response.status_code == 400
    assert response.data == {
        "code": "validation_error",
        "message": "Please correct the highlighted fields.",
        "fields": {"email": ["Enter a valid email address."]},
    }


@pytest.mark.parametrize(
    "detail, expected",
    [
        (
            [ErrorDetail("The request is invalid.", code="invalid")],
            {"non_field_errors": ["The request is invalid."]},
        ),
        (
            ErrorDetail("The request is invalid.", code="invalid"),
            {"non_field_errors": ["The request is invalid."]},
        ),
    ],
)
def test_normalize_fields_handles_non_mapping_validation_data(detail, expected):
    assert normalize_fields(detail) == expected


@pytest.mark.parametrize(
    "exception, expected",
    [
        (
            NotAuthenticated("internal authentication detail"),
            (401, "not_authenticated", "Authentication credentials were not provided."),
        ),
        (
            PermissionDenied("internal permission detail"),
            (403, "permission_denied", "You do not have permission to perform this action."),
        ),
        (
            NotFound("internal not-found detail"),
            (404, "not_found", "Not found."),
        ),
    ],
)
def test_exception_handler_normalizes_expected_http_errors(rf, exception, expected):
    request = rf.get("/api/private/")

    response = api_exception_handler(exception, {"request": request})

    status_code, code, message = expected
    assert response.status_code == status_code
    assert response.data == {"code": code, "message": message}


def test_exception_handler_normalizes_scalar_validation_detail(rf):
    request = rf.post("/api/auth/register/", {}, format="json")

    response = api_exception_handler(
        ValidationError("The request is invalid."),
        {"request": request},
    )

    assert response.data == {
        "code": "validation_error",
        "message": "Please correct the highlighted fields.",
        "fields": {"non_field_errors": ["The request is invalid."]},
    }


def test_exception_handler_hides_custom_authentication_detail(rf):
    request = rf.get("/api/private/")

    response = api_exception_handler(
        AuthenticationFailed("provider secret detail"),
        {"request": request},
    )

    assert response.data == {
        "code": "authentication_failed",
        "message": "Incorrect authentication credentials.",
    }


def test_exception_handler_uses_generic_message_for_unknown_api_errors(rf):
    request = rf.get("/api/private/")

    response = api_exception_handler(CustomApiException(), {"request": request})

    assert response.status_code == 418
    assert response.data == {"code": "custom_failure", "message": "Request failed."}
