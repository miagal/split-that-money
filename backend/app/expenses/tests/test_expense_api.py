"""Tests for expense persistence and API behavior."""

from uuid import uuid4

import pytest
from django.utils import timezone

from app.accounts.models import User
from app.expenses.models import Expense, ExpenseShare
from app.groups.models import Group, Membership


def create_user(email):
    """Create a test user with stable required profile fields."""
    return User.objects.create_user(email, "secret123", first_name="Test", last_name="User")


def create_group_with_members(*users, archived=False):
    """Create a group containing the supplied users."""
    group = Group.objects.create(name="Trip", currency="EUR", created_by=users[0])
    if archived:
        group.archived_at = timezone.now()
        group.save(update_fields=["archived_at"])
    for index, user in enumerate(users):
        role = Membership.Role.ADMIN if index == 0 else Membership.Role.MEMBER
        Membership.objects.create(group=group, user=user, role=role)
    return group


def expense_payload(group, actor, payer, participants, *, expense_id=None, updated_at=None):
    """Build a valid equal-split expense upsert payload."""
    now = timezone.now()
    return {
        "id": str(expense_id or uuid4()),
        "created_by": str(actor.id),
        "created_at": (updated_at or now).isoformat().replace("+00:00", "Z"),
        "updated_at": (updated_at or now).isoformat().replace("+00:00", "Z"),
        "title": "Dinner",
        "amount_cents": 1200,
        "date": now.date().isoformat(),
        "payer": str(payer.id),
        "split_type": Expense.SplitType.EQUAL,
        "note": "",
        "shares": [{"user": str(user.id), "value": 1} for user in participants],
        "deleted": False,
        "created_on_device": "phone-a",
    }


@pytest.mark.django_db
@pytest.mark.parametrize(
    "icon",
    [
        None,
        "utensils-crossed",
        "coffee",
        "shopping-basket",
        "car-front",
        "ticket",
        "bed-double",
        "party-popper",
    ],
)
def test_expense_upsert_accepts_allowed_icon_and_returns_it(client, icon):
    """Persist and return each intentional no-icon or supported expense icon."""
    alice = create_user(f"icon-{icon or 'none'}@example.com")
    group = create_group_with_members(alice)
    client.force_login(alice)
    payload = expense_payload(group, alice, alice, [alice])
    payload["icon"] = icon

    response = client.put(
        f"/api/groups/{group.id}/expenses/{payload['id']}/",
        payload,
        content_type="application/json",
    )

    assert response.status_code == 200
    assert response.json()["expense"]["icon"] == icon


@pytest.mark.django_db
def test_expense_upsert_rejects_unknown_icon(client):
    """Reject an expense icon outside the supported API contract."""
    alice = create_user("invalid-icon@example.com")
    group = create_group_with_members(alice)
    client.force_login(alice)
    payload = expense_payload(group, alice, alice, [alice])
    payload["icon"] = "food"

    response = client.put(
        f"/api/groups/{group.id}/expenses/{payload['id']}/",
        payload,
        content_type="application/json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "code": "validation_error",
        "message": "Please correct the highlighted fields.",
        "fields": {"icon": ['"food" is not a valid choice.']},
    }


@pytest.mark.django_db
def test_expense_uses_client_uuid_and_fingerprint():
    user = create_user("person@example.com")
    group = Group.objects.create(name="Trip", currency="EUR", created_by=user)
    Membership.objects.create(group=group, user=user, role=Membership.Role.ADMIN)
    created_at = timezone.now()

    expense = Expense.objects.create(
        group=group,
        title="Dinner",
        amount_cents=1200,
        date=created_at.date(),
        payer=user,
        split_type=Expense.SplitType.EQUAL,
        created_by=user,
        created_at=created_at,
        updated_by=user,
        updated_at=created_at,
    )

    assert expense.id
    assert not expense.deleted


@pytest.mark.django_db
def test_active_member_can_create_equal_expense(client):
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    group = create_group_with_members(alice, bob)
    client.force_login(alice)

    payload = expense_payload(group, alice, alice, [alice, bob])
    response = client.put(
        f"/api/groups/{group.id}/expenses/{payload['id']}/",
        payload,
        content_type="application/json",
    )

    assert response.status_code == 200
    expense = Expense.objects.get(id=payload["id"])
    assert expense.title == "Dinner"
    assert list(expense.shares.order_by("user_id").values_list("amount_cents", flat=True)) == [600, 600]


@pytest.mark.django_db
def test_system_admin_cannot_create_expense_for_foreign_group(client):
    owner = create_user("owner@example.com")
    system_admin = User.objects.create_superuser("operator@example.com", "secret123")
    group = create_group_with_members(owner)
    assert not Membership.objects.filter(group=group, user=system_admin).exists()
    client.force_login(system_admin)
    payload = expense_payload(group, owner, owner, [owner])

    response = client.put(
        f"/api/groups/{group.id}/expenses/{payload['id']}/",
        payload,
        content_type="application/json",
    )

    assert response.status_code == 400
    assert response.json()["code"] == "not_group_member"


@pytest.mark.django_db
def test_left_member_is_rejected_as_new_expense_participant(client):
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    group = create_group_with_members(alice, bob)
    Membership.objects.filter(group=group, user=bob).update(left_at=timezone.now())
    client.force_login(alice)

    payload = expense_payload(group, alice, alice, [alice, bob])
    response = client.put(
        f"/api/groups/{group.id}/expenses/{payload['id']}/",
        payload,
        content_type="application/json",
    )

    assert response.status_code == 400
    assert response.json()["code"] == "participant_not_active"


@pytest.mark.django_db
def test_archived_group_rejects_new_expense(client):
    alice = create_user("alice@example.com")
    group = create_group_with_members(alice, archived=True)
    client.force_login(alice)

    payload = expense_payload(group, alice, alice, [alice])
    response = client.put(
        f"/api/groups/{group.id}/expenses/{payload['id']}/",
        payload,
        content_type="application/json",
    )

    assert response.status_code == 400
    assert response.json()["code"] == "group_archived"


@pytest.mark.django_db
def test_delete_expense_creates_tombstone(client):
    alice = create_user("alice@example.com")
    group = create_group_with_members(alice)
    now = timezone.now()
    expense = Expense.objects.create(
        id=uuid4(),
        group=group,
        title="Dinner",
        amount_cents=1200,
        date=now.date(),
        payer=alice,
        split_type=Expense.SplitType.EQUAL,
        created_by=alice,
        created_at=now,
        updated_by=alice,
        updated_at=now,
    )
    ExpenseShare.objects.create(expense=expense, user=alice, value=1, amount_cents=1200)
    client.force_login(alice)

    response = client.delete(f"/api/groups/{group.id}/expenses/{expense.id}/")

    assert response.status_code == 204
    expense.refresh_from_db()
    assert expense.deleted
