"""Tests for settlement API behavior."""

from uuid import uuid4

import pytest
from django.utils import timezone

from app.accounts.models import User
from app.expenses.models import Settlement
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


def settlement_payload(actor, from_user, to_user, *, settlement_id=None, updated_at=None):
    """Build a valid settlement upsert payload."""
    now = timezone.now()
    return {
        "id": str(settlement_id or uuid4()),
        "created_by": str(actor.id),
        "created_at": (updated_at or now).isoformat().replace("+00:00", "Z"),
        "updated_at": (updated_at or now).isoformat().replace("+00:00", "Z"),
        "from_user": str(from_user.id),
        "to_user": str(to_user.id),
        "amount_cents": 500,
        "deleted": False,
        "created_on_device": "phone-a",
    }


@pytest.mark.django_db
def test_settlement_can_include_left_member(client):
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    group = create_group_with_members(alice, bob)
    Membership.objects.filter(group=group, user=bob).update(left_at=timezone.now())
    client.force_login(alice)

    payload = settlement_payload(alice, bob, alice)
    response = client.put(
        f"/api/groups/{group.id}/settlements/{payload['id']}/",
        payload,
        content_type="application/json",
    )

    assert response.status_code == 200
    settlement = Settlement.objects.get(id=payload["id"])
    assert settlement.from_user == bob
    assert settlement.to_user == alice


@pytest.mark.django_db
def test_system_admin_cannot_create_settlement_for_foreign_group(client):
    owner = create_user("owner@example.com")
    recipient = create_user("recipient@example.com")
    system_admin = User.objects.create_superuser("operator@example.com", "secret123")
    group = create_group_with_members(owner, recipient)
    assert not Membership.objects.filter(group=group, user=system_admin).exists()
    client.force_login(system_admin)
    payload = settlement_payload(owner, owner, recipient)

    response = client.put(
        f"/api/groups/{group.id}/settlements/{payload['id']}/",
        payload,
        content_type="application/json",
    )

    assert response.status_code == 400
    assert response.json()["code"] == "not_group_member"


@pytest.mark.django_db
def test_archived_group_rejects_new_settlement(client):
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    group = create_group_with_members(alice, bob, archived=True)
    client.force_login(alice)

    payload = settlement_payload(alice, bob, alice)
    response = client.put(
        f"/api/groups/{group.id}/settlements/{payload['id']}/",
        payload,
        content_type="application/json",
    )

    assert response.status_code == 400
    assert response.json()["code"] == "group_archived"


@pytest.mark.django_db
def test_delete_settlement_creates_tombstone(client):
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    group = create_group_with_members(alice, bob)
    now = timezone.now()
    settlement = Settlement.objects.create(
        id=uuid4(),
        group=group,
        from_user=bob,
        to_user=alice,
        amount_cents=500,
        created_by=alice,
        created_at=now,
        updated_by=alice,
        updated_at=now,
    )
    client.force_login(alice)

    response = client.delete(f"/api/groups/{group.id}/settlements/{settlement.id}/")

    assert response.status_code == 204
    settlement.refresh_from_db()
    assert settlement.deleted
