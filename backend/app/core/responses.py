"""Helpers for consistent API response shapes."""

from rest_framework.response import Response


def error_response(
    code: str, message: str, status_code: int, fields: dict[str, list[str]] | None = None
) -> Response:
    """Build a stable JSON error response for expected API failures.

    Args:
        code: Stable machine-readable error identifier.
        message: Safe summary suitable for display to API clients.
        status_code: HTTP status code for the failed request.
        fields: Optional safe per-field messages for inline feedback.

    Returns:
        A DRF response using the project's public error envelope.
    """
    data = {"code": code, "message": message}
    if fields is not None:
        data["fields"] = fields
    return Response(data, status=status_code)
