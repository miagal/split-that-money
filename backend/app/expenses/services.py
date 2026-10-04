"""Domain services for expense, settlement, and sync rules."""

from django.db import transaction
from django.utils import timezone

from app.core.errors import DomainError
from app.expenses.models import Expense, ExpenseShare, Settlement
from app.expenses.splits import compute_split
from app.expenses.sync import upsert_with_fingerprint
from app.groups.models import Membership
from app.groups.selectors import active_membership


def user_is_involved_in_group(user, group) -> bool:
    """Return whether a user appears in any group money record."""
    return (
        Expense.objects.filter(group=group, payer=user).exists()
        or ExpenseShare.objects.filter(expense__group=group, user=user).exists()
        or Settlement.objects.filter(group=group, from_user=user).exists()
        or Settlement.objects.filter(group=group, to_user=user).exists()
    )


@transaction.atomic
def upsert_expense(actor, group, payload):
    """Create or update an expense after enforcing write and split rules."""
    existing = Expense.objects.filter(id=payload["id"]).first()
    frozen_fields = {
        "group": group,
        "created_by_id": payload["created_by"],
        "created_at": payload["created_at"],
    }
    _require_active_group_member(actor, group)
    if _is_stale_replay(existing, frozen_fields, payload["updated_at"]):
        return existing, "ignored"

    if existing is None or _fingerprint_matches(existing, frozen_fields):
        _require_active_open_writer(actor, group)
        _validate_created_by_for_new(actor, existing, payload)
        _require_active_member(group, payload["payer"], "payer_not_active", "Expense payer must be an active group member.")
        participant_values = {share["user"]: share["value"] for share in payload["shares"]}
        if len(participant_values) != len(payload["shares"]):
            raise DomainError("duplicate_participant", "Expense participants must be unique.")
        if payload["split_type"] == Expense.SplitType.EQUAL:
            participant_values = {user_id: 1 for user_id in participant_values}
        for user_id in participant_values:
            _require_active_member(group, user_id, "participant_not_active", "Expense participants must be active group members.")
        share_amounts = compute_split(payload["amount_cents"], payload["split_type"], participant_values)
    else:
        share_amounts = None
        participant_values = None

    mutable_values = {
        "title": payload["title"],
        "amount_cents": payload["amount_cents"],
        "date": payload["date"],
        "payer_id": payload["payer"],
        "split_type": payload["split_type"],
        "icon": payload.get("icon"),
        "note": payload.get("note", ""),
        "deleted": payload.get("deleted", False),
        "updated_by": actor,
        "updated_at": payload["updated_at"],
        "created_on_device": payload.get("created_on_device"),
    }
    expense, sync_status = upsert_with_fingerprint(Expense, payload["id"], frozen_fields, mutable_values)
    if sync_status in {"created", "updated"}:
        _replace_expense_shares(expense, participant_values, share_amounts)
    return expense, sync_status


@transaction.atomic
def upsert_settlement(actor, group, payload):
    """Create or update a settlement after enforcing write rules."""
    existing = Settlement.objects.filter(id=payload["id"]).first()
    frozen_fields = {
        "group": group,
        "created_by_id": payload["created_by"],
        "created_at": payload["created_at"],
    }
    _require_active_group_member(actor, group)
    if _is_stale_replay(existing, frozen_fields, payload["updated_at"]):
        return existing, "ignored"

    if existing is None or _fingerprint_matches(existing, frozen_fields):
        _require_active_open_writer(actor, group)
        _validate_created_by_for_new(actor, existing, payload)
        if payload["from_user"] == payload["to_user"]:
            raise DomainError("invalid_settlement", "Settlement users must be different.")
        if payload["amount_cents"] <= 0:
            raise DomainError("invalid_amount", "Settlement amount must be positive.")
        _require_group_membership(group, payload["from_user"], "from_user_not_member", "Settlement sender must belong to the group.")
        _require_group_membership(group, payload["to_user"], "to_user_not_member", "Settlement recipient must belong to the group.")

    mutable_values = {
        "from_user_id": payload["from_user"],
        "to_user_id": payload["to_user"],
        "amount_cents": payload["amount_cents"],
        "deleted": payload.get("deleted", False),
        "updated_by": actor,
        "updated_at": payload["updated_at"],
        "created_on_device": payload.get("created_on_device"),
    }
    return upsert_with_fingerprint(Settlement, payload["id"], frozen_fields, mutable_values)


def tombstone_expense(actor, group, expense_id):
    """Mark an expense deleted without removing its row."""
    _require_active_open_writer(actor, group)
    expense = Expense.objects.get(id=expense_id, group=group)
    expense.deleted = True
    expense.updated_by = actor
    expense.updated_at = timezone.now()
    expense.save(update_fields=["deleted", "updated_by", "updated_at"])
    return expense


def tombstone_settlement(actor, group, settlement_id):
    """Mark a settlement deleted without removing its row."""
    _require_active_open_writer(actor, group)
    settlement = Settlement.objects.get(id=settlement_id, group=group)
    settlement.deleted = True
    settlement.updated_by = actor
    settlement.updated_at = timezone.now()
    settlement.save(update_fields=["deleted", "updated_by", "updated_at"])
    return settlement


def push_sync(actor, group, expenses, settlements):
    """Apply a batch of expense and settlement upserts with per-row results."""
    return {
        "expenses": [_push_result(lambda row=row: upsert_expense(actor, group, row), row["id"]) for row in expenses],
        "settlements": [_push_result(lambda row=row: upsert_settlement(actor, group, row), row["id"]) for row in settlements],
    }


def pull_sync(group, since):
    """Return expense and settlement rows updated after the supplied cursor."""
    return {
        "expenses": group.expenses.filter(updated_at__gt=since).prefetch_related("shares").order_by("updated_at", "id"),
        "settlements": group.settlements.filter(updated_at__gt=since).order_by("updated_at", "id"),
    }


def _push_result(upsert, row_id):
    """Return a stable per-row batch result without aborting unrelated rows."""
    try:
        instance, sync_status = upsert()
    except DomainError as error:
        return {"id": str(row_id), "sync_status": "error", "code": error.code, "message": error.message}
    if sync_status == "conflict":
        return {"id": str(instance.id), "sync_status": sync_status}
    return {"id": str(instance.id), "sync_status": sync_status, "instance": instance}


def _replace_expense_shares(expense, participant_values, share_amounts) -> None:
    """Replace stored split lines after an accepted expense upsert."""
    expense.shares.all().delete()
    ExpenseShare.objects.bulk_create(
        [
            ExpenseShare(expense=expense, user_id=user_id, value=participant_values[user_id], amount_cents=amount_cents)
            for user_id, amount_cents in share_amounts.items()
        ]
    )


def _fingerprint_matches(instance, frozen_fields) -> bool:
    """Return whether an existing row has the same immutable sync fingerprint."""
    return all(getattr(instance, field_name) == value for field_name, value in frozen_fields.items())


def _is_stale_replay(instance, frozen_fields, updated_at) -> bool:
    """Return whether an existing matching row needs no validation or write."""
    return instance is not None and _fingerprint_matches(instance, frozen_fields) and updated_at <= instance.updated_at


def _require_active_open_writer(actor, group) -> None:
    """Require an active actor membership and an open group before writes."""
    if group.archived_at is not None:
        raise DomainError("group_archived", "Archived groups do not accept money record changes.")
    _require_active_group_member(actor, group)


def _require_active_group_member(actor, group) -> None:
    """Require an active actor membership before exposing sync row data."""
    if active_membership(group, actor) is None:
        raise DomainError("not_group_member", "You must be an active group member to change money records.")


def _validate_created_by_for_new(actor, existing, payload) -> None:
    """Prevent creating new rows on behalf of another user."""
    if existing is None and payload["created_by"] != actor.id:
        raise DomainError("invalid_creator", "New money records must be created by the current user.")


def _require_active_member(group, user_id, code, message) -> None:
    """Require an active membership for expense payer and participant fields."""
    if not Membership.objects.filter(group=group, user_id=user_id, left_at__isnull=True).exists():
        raise DomainError(code, message)


def _require_group_membership(group, user_id, code, message) -> None:
    """Require an active or left membership for settlement users."""
    if not Membership.objects.filter(group=group, user_id=user_id).exists():
        raise DomainError(code, message)
