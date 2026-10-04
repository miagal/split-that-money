"""Permission helpers for group lifecycle APIs.

The helpers keep group membership checks reusable without moving product
state changes out of the service layer.
"""

from app.groups.models import Membership
from app.groups.selectors import active_membership


def is_system_admin(user) -> bool:
    """Return whether the user may manage instance-level group data."""
    return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))


def is_group_admin(user, group) -> bool:
    """Return whether the user is an active admin member of the group."""
    membership = active_membership(group, user)
    return bool(membership and membership.role == Membership.Role.ADMIN)


def can_manage_group(user, group) -> bool:
    """Return whether the user can manage group lifecycle operations."""
    return is_system_admin(user) or is_group_admin(user, group)
