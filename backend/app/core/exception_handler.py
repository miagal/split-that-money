"""DRF exception handling for the API's stable expected-error envelope.

Expected DRF failures expose stable codes and safe messages while validation
failures additionally expose string-only field messages.
"""

from collections.abc import Mapping
from typing import Any

from rest_framework.exceptions import APIException, ValidationError
from rest_framework.views import exception_handler


def normalize_fields(data: Any) -> dict[str, list[str]]:
    """Convert DRF validation details into the API's string-list field mapping.

    Args:
        data: Mapping, list, or scalar validation details produced by DRF.

    Returns:
        A JSON-safe mapping of every field to its displayed error messages.
        Non-field validation details use DRF's standard ``non_field_errors``
        key.
    """
    if isinstance(data, Mapping):
        return {
            str(field): _message_list(messages)
            for field, messages in data.items()
        }
    return {"non_field_errors": _message_list(data)}


def _message_list(messages: Any) -> list[str]:
    """Convert one DRF detail value into safe string messages."""
    if isinstance(messages, (list, tuple)):
        return [str(message) for message in messages]
    return [str(messages)]


_SAFE_MESSAGES = {
    "authentication_failed": "Incorrect authentication credentials.",
    "not_authenticated": "Authentication credentials were not provided.",
    "permission_denied": "You do not have permission to perform this action.",
    "not_found": "Not found.",
}


def api_exception_handler(exc: Exception, context: dict[str, Any]):
    """Wrap expected DRF errors while leaving unexpected errors alone.

    Args:
        exc: Exception raised while processing the request.
        context: DRF exception context for the request and view.

    Returns:
        DRF's response with a stable validation envelope, or its original result.
    """
    response = exception_handler(exc, context)
    if response is not None and isinstance(exc, APIException):
        if isinstance(exc, ValidationError):
            response.data = {
                "code": "validation_error",
                "message": "Please correct the highlighted fields.",
                "fields": normalize_fields(response.data),
            }
        else:
            code = str(exc.default_code)
            response.data = {
                "code": code,
                "message": _SAFE_MESSAGES.get(code, "Request failed."),
            }
    return response
