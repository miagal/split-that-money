"""Domain services for group lifecycle rules.

Services own membership, archive, and delete product rules while exposing
expected failures as structured domain errors for API views.
"""

from django.db import transaction
from django.utils import timezone

from app.accounts.models import User
from app.core.errors import DomainError
from app.expenses.services import user_is_involved_in_group
from app.groups.models import Group, Membership
from app.groups.permissions import can_manage_group
from app.groups.selectors import active_membership


def create_group(user, name: str, currency: str, icon: str) -> Group:
    """Create a group with its required icon and sole active admin.

    Args:
        user: The authenticated creator who becomes the group admin.
        name: The group name.
        currency: The immutable ISO currency code.
        icon: The serializer-validated icon contract value.

    Returns:
        The newly persisted group and its created admin membership.
    """
    with transaction.atomic():
        group = Group.objects.create(name=name, currency=currency, icon=icon, created_by=user)
        Membership.objects.create(group=group, user=user, role=Membership.Role.ADMIN)
    return group


@transaction.atomic
def add_member(actor, group, email) -> Membership:
    """Add an existing user to an open group by email."""
    group = Group.objects.select_for_update().get(id=group.id)
    _require_manager(actor, group)
    _require_open(group)
    try:
        user = User.objects.get(email=User.objects.normalize_email(email))
    except User.DoesNotExist as error:
        raise DomainError("user_not_found", "No user with that email exists.") from error

    membership, _created = Membership.objects.get_or_create(
        group=group,
        user=user,
        defaults={"role": Membership.Role.MEMBER},
    )
    if membership.left_at is not None:
        membership.left_at = None
        membership.role = _reactivated_member_role(group)
        membership.save(update_fields=["left_at", "role"])
    return membership


def leave_group(actor, group) -> None:
    """Remove or soft-leave the actor's active membership."""
    membership = active_membership(group, actor)
    if membership is None:
        raise DomainError("not_group_member", "You are not an active member of this group.")
    _leave_membership(membership)


def remove_member(actor, group, user) -> None:
    """Remove or soft-leave a member from a group."""
    _require_manager(actor, group)
    membership = active_membership(group, user)
    if membership is None:
        raise DomainError("not_group_member", "The user is not an active member of this group.")
    _leave_membership(membership)


@transaction.atomic
def rejoin_group(actor, group) -> Membership:
    """Clear a left membership without changing archive state."""
    group = Group.objects.select_for_update().get(id=group.id)
    membership = Membership.objects.select_for_update().filter(group=group, user=actor, left_at__isnull=False).first()
    if membership is None:
        raise DomainError("cannot_rejoin", "You do not have a left membership in this group.")

    membership.left_at = None
    membership.role = _reactivated_member_role(group)
    membership.save(update_fields=["left_at", "role"])
    return membership


def archive_group(actor, group) -> Group:
    """Archive a group when the actor can manage it."""
    _require_manager(actor, group)
    if group.archived_at is None:
        group.archived_at = timezone.now()
        group.save(update_fields=["archived_at", "updated_at"])
    return group


def unarchive_group(actor, group) -> Group:
    """Unarchive a group when the actor can manage it."""
    _require_manager(actor, group)
    if group.archived_at is not None:
        group.archived_at = None
        group.save(update_fields=["archived_at", "updated_at"])
    return group


def delete_group(actor, group) -> None:
    """Delete an archived group and its memberships."""
    _require_manager(actor, group)
    if group.archived_at is None:
        raise DomainError("group_not_archived", "Only archived groups can be deleted.")
    group.delete()


def update_group(actor, group, *, name=None, icon=None) -> Group:
    """Update a manager-owned group's editable presentation fields."""
    _require_manager(actor, group)
    fields = []
    if name is not None:
        group.name = name
        fields.append("name")
    if icon is not None:
        group.icon = icon
        fields.append("icon")
    group.save(update_fields=[*fields, "updated_at"])
    return group


def _require_manager(actor, group) -> None:
    """Raise a domain error unless the actor can manage the group."""
    if not can_manage_group(actor, group):
        raise DomainError("permission_denied", "You do not have permission to manage this group.")


def _require_open(group) -> None:
    """Raise a domain error when a group is archived."""
    if group.archived_at is not None:
        raise DomainError("group_archived", "Archived groups cannot be changed.")


def _reactivated_member_role(group) -> str:
    """Return the sole admin role when none is active, otherwise member."""
    has_active_admin = Membership.objects.filter(group=group, role=Membership.Role.ADMIN, left_at__isnull=True).exists()
    return Membership.Role.MEMBER if has_active_admin else Membership.Role.ADMIN


@transaction.atomic
def _leave_membership(membership) -> None:
    """Apply leave/remove cleanup and admin promotion rules."""
    group = membership.group
    was_admin = membership.role == Membership.Role.ADMIN
    involved = user_is_involved_in_group(membership.user, group)

    if involved:
        membership.left_at = timezone.now()
        membership.save(update_fields=["left_at"])
    else:
        membership.delete()

    active_memberships = Membership.objects.filter(group=group, left_at__isnull=True).order_by("joined_at")
    if not active_memberships.exists():
        if involved:
            if group.archived_at is None:
                group.archived_at = timezone.now()
                group.save(update_fields=["archived_at", "updated_at"])
        else:
            group.delete()
        return

    if was_admin and not active_memberships.filter(role=Membership.Role.ADMIN).exists():
        promoted = active_memberships.first()
        promoted.role = Membership.Role.ADMIN
        promoted.save(update_fields=["role"])
