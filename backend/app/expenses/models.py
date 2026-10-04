"""Data models for expenses, expense shares, and settlements."""

import uuid

from django.conf import settings
from django.db import models


class Expense(models.Model):
    """Persist a shared expense with sync-friendly identity and tombstone deletion.

    The optional icon is a stable category reference returned to synced clients.
    """

    class SplitType(models.TextChoices):
        """Split modes supported by the product."""

        EQUAL = "equal", "Equal"
        EXACT = "exact", "Exact"
        SHARES = "shares", "Shares"
        PERCENT = "percent", "Percent"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey("groups.Group", on_delete=models.CASCADE, related_name="expenses")
    title = models.CharField(max_length=200)
    amount_cents = models.IntegerField()
    date = models.DateField()
    payer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="paid_expenses")
    split_type = models.CharField(max_length=20, choices=SplitType.choices)
    icon = models.CharField(max_length=32, blank=True, null=True)
    note = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_expenses")
    created_at = models.DateTimeField()
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="updated_expenses")
    updated_at = models.DateTimeField()
    deleted = models.BooleanField(default=False)
    created_on_device = models.CharField(max_length=200, blank=True, null=True)

    def __str__(self) -> str:
        """Return the expense title for admin and logs."""
        return self.title


class ExpenseShare(models.Model):
    """Participant line for one expense split."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name="shares")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="expense_shares")
    value = models.IntegerField()
    amount_cents = models.IntegerField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["expense", "user"], name="unique_expense_share_per_user"),
        ]


class Settlement(models.Model):
    """Recorded payment between two group members with tombstone deletion."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey("groups.Group", on_delete=models.CASCADE, related_name="settlements")
    from_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sent_settlements")
    to_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="received_settlements")
    amount_cents = models.IntegerField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_settlements")
    created_at = models.DateTimeField()
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="updated_settlements")
    updated_at = models.DateTimeField()
    deleted = models.BooleanField(default=False)
    created_on_device = models.CharField(max_length=200, blank=True, null=True)
