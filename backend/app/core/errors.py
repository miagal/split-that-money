"""Shared domain error types for expected API failures."""


class DomainError(Exception):
    """Expected product-rule failure that can be mapped to a JSON response."""

    def __init__(self, code: str, message: str) -> None:
        """Store a stable error code and human-readable message."""
        super().__init__(message)
        self.code = code
        self.message = message
