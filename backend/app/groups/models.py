"""Data models for groups and memberships.

Groups persist the shared-money metadata returned by the API, while
memberships represent each user's role and leave state within a group.
"""

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


class Group(models.Model):
    """Persist a shared-money group with fixed creation metadata.

    The icon is selected during group creation and remains part of the group
    representation returned to clients.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=150)
    currency = models.CharField(max_length=3)
    icon = models.CharField(max_length=80)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_groups")
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        """Return the group name for admin and logs."""
        return self.name


class Membership(models.Model):
    """User membership in a group with role and leave state."""

    class Role(models.TextChoices):
        """Membership roles supported by the product."""

        ADMIN = "admin", "Admin"
        MEMBER = "member", "Member"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="memberships")
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.MEMBER)
    joined_at = models.DateTimeField(default=timezone.now)
    left_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["group", "user"], name="unique_membership_per_group_user"),
            models.UniqueConstraint(
                fields=["group"],
                condition=Q(role="admin", left_at__isnull=True),
                name="unique_active_admin_per_group",
            ),
        ]

    @property
    def is_active(self) -> bool:
        """Return whether the membership has not been left."""
        return self.left_at is None
