"""Read queries for groups and memberships.

Selectors centralize reusable group lookups so views and services do not
spread visibility query rules across HTTP and domain code.
"""

from django.db.models import Exists, OuterRef, Q

from app.groups.models import Group, Membership


def visible_groups_for_user(user):
    """Return groups visible to active or involved former members."""
    groups = Group.objects.order_by("name", "created_at")
    if user.is_staff or user.is_superuser:
        return groups
    memberships = Membership.objects.filter(group_id=OuterRef("pk"), user=user)
    return groups.annotate(
        has_active_membership=Exists(memberships.filter(left_at__isnull=True)),
        has_left_membership=Exists(memberships.filter(left_at__isnull=False)),
    ).filter(
        Q(has_active_membership=True)
        | (
            Q(has_left_membership=True)
            & (Q(expenses__payer=user) | Q(expenses__shares__user=user) | Q(settlements__from_user=user) | Q(settlements__to_user=user))
        )
    ).distinct()


def active_membership(group, user):
    """Return the user's active membership for a group or None."""
    return Membership.objects.filter(group=group, user=user, left_at__isnull=True).first()
