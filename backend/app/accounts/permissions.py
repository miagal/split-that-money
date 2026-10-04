"""DRF permissions for account administration."""

from rest_framework.permissions import BasePermission


class IsSystemAdmin(BasePermission):
    """Allow only staff or superusers to manage instance-level users."""

    def has_permission(self, request, view) -> bool:
        """Return true when the authenticated user is an instance admin."""
        return bool(request.user and request.user.is_authenticated and (request.user.is_staff or request.user.is_superuser))
