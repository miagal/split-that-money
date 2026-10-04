"""Tests for expense and settlement sync upsert behavior."""

from uuid import uuid4

import pytest
from django.utils import timezone

from app.accounts.models import User
from app.expenses.models import Expense, Settlement
from app.groups.models import Group, Membership


def create_user(email):
    """Create a test user with stable required profile fields."""
    return User.objects.create_user(email, "secret123", first_name="Test", last_name="User")


def create_group_with_members(*users):
    """Create a group containing the supplied users."""
    group = Group.objects.create(name="Trip", currency="EUR", created_by=users[0])
    for index, user in enumerate(users):
        role = Membership.Role.ADMIN if index == 0 else Membership.Role.MEMBER
        Membership.objects.create(group=group, user=user, role=role)
    return group


def stamp(offset_seconds=0):
    """Return an ISO timestamp offset from now."""
    return (timezone.now() + timezone.timedelta(seconds=offset_seconds)).isoformat().replace("+00:00", "Z")


def expense_payload(actor, payer, participants, *, expense_id=None, created_at=None, updated_at=None, title="Dinner"):
    """Build a valid expense sync row."""
    now = timezone.now()
    return {
        "id": str(expense_id or uuid4()),
        "created_by": str(actor.id),
        "created_at": created_at or now.isoformat().replace("+00:00", "Z"),
        "updated_at": updated_at or now.isoformat().replace("+00:00", "Z"),
        "title": title,
        "amount_cents": 1200,
        "date": now.date().isoformat(),
        "payer": str(payer.id),
        "split_type": Expense.SplitType.EQUAL,
        "note": "",
        "shares": [{"user": str(user.id), "value": 1} for user in participants],
        "deleted": False,
        "created_on_device": "phone-a",
    }


def settlement_payload(actor, from_user, to_user, *, settlement_id=None, created_at=None, updated_at=None):
    """Build a valid settlement sync row."""
    now = timezone.now()
    return {
        "id": str(settlement_id or uuid4()),
        "created_by": str(actor.id),
        "created_at": created_at or now.isoformat().replace("+00:00", "Z"),
        "updated_at": updated_at or now.isoformat().replace("+00:00", "Z"),
        "from_user": str(from_user.id),
        "to_user": str(to_user.id),
        "amount_cents": 500,
        "deleted": False,
        "created_on_device": "phone-a",
    }


@pytest.mark.django_db
def test_same_uuid_and_same_fingerprint_is_idempotent(client):
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    group = create_group_with_members(alice, bob)
    client.force_login(alice)
    created_at = stamp()
    payload = expense_payload(alice, alice, [alice, bob], created_at=created_at, updated_at=created_at)

    first = client.put(f"/api/groups/{group.id}/expenses/{payload['id']}/", payload, content_type="application/json")
    second = client.put(f"/api/groups/{group.id}/expenses/{payload['id']}/", payload, content_type="application/json")

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["sync_status"] == "ignored"
    assert Expense.objects.filter(id=payload["id"]).count() == 1


@pytest.mark.django_db
def test_same_uuid_and_different_created_by_conflicts(client):
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    group = create_group_with_members(alice, bob)
    client.force_login(alice)
    expense_id = uuid4()
    created_at = stamp()

    client.put(
        f"/api/groups/{group.id}/expenses/{expense_id}/",
        expense_payload(alice, alice, [alice], expense_id=expense_id, created_at=created_at, updated_at=created_at),
        content_type="application/json",
    )
    response = client.put(
        f"/api/groups/{group.id}/expenses/{expense_id}/",
        expense_payload(bob, alice, [alice], expense_id=expense_id, created_at=created_at, updated_at=stamp(10)),
        content_type="application/json",
    )

    assert response.status_code == 409
    assert response.json()["sync_status"] == "conflict"


@pytest.mark.django_db
def test_same_uuid_and_different_created_at_conflicts(client):
    alice = create_user("alice@example.com")
    group = create_group_with_members(alice)
    client.force_login(alice)
    expense_id = uuid4()

    client.put(
        f"/api/groups/{group.id}/expenses/{expense_id}/",
        expense_payload(alice, alice, [alice], expense_id=expense_id, created_at=stamp(), updated_at=stamp()),
        content_type="application/json",
    )
    response = client.put(
        f"/api/groups/{group.id}/expenses/{expense_id}/",
        expense_payload(alice, alice, [alice], expense_id=expense_id, created_at=stamp(1), updated_at=stamp(10)),
        content_type="application/json",
    )

    assert response.status_code == 409
    assert response.json()["sync_status"] == "conflict"


@pytest.mark.django_db
def test_older_updated_at_does_not_overwrite_newer_data(client):
    alice = create_user("alice@example.com")
    group = create_group_with_members(alice)
    client.force_login(alice)
    expense_id = uuid4()
    created_at = stamp()

    client.put(
        f"/api/groups/{group.id}/expenses/{expense_id}/",
        expense_payload(alice, alice, [alice], expense_id=expense_id, created_at=created_at, updated_at=stamp(20), title="New"),
        content_type="application/json",
    )
    response = client.put(
        f"/api/groups/{group.id}/expenses/{expense_id}/",
        expense_payload(alice, alice, [alice], expense_id=expense_id, created_at=created_at, updated_at=stamp(10), title="Old"),
        content_type="application/json",
    )

    assert response.status_code == 200
    assert response.json()["sync_status"] == "ignored"
    assert Expense.objects.get(id=expense_id).title == "New"


@pytest.mark.django_db
def test_stale_expense_upsert_is_ignored_even_if_group_archived_and_participant_left(client):
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    group = create_group_with_members(alice, bob)
    client.force_login(alice)
    expense_id = uuid4()
    created_at = stamp()
    current_payload = expense_payload(
        alice,
        alice,
        [alice, bob],
        expense_id=expense_id,
        created_at=created_at,
        updated_at=stamp(20),
        title="Current",
    )
    client.put(f"/api/groups/{group.id}/expenses/{expense_id}/", current_payload, content_type="application/json")
    group.archived_at = timezone.now()
    group.save(update_fields=["archived_at"])
    Membership.objects.filter(group=group, user=bob).update(left_at=timezone.now())

    stale_payload = expense_payload(
        alice,
        alice,
        [alice, bob],
        expense_id=expense_id,
        created_at=created_at,
        updated_at=stamp(10),
        title="Stale",
    )
    response = client.put(f"/api/groups/{group.id}/expenses/{expense_id}/", stale_payload, content_type="application/json")

    assert response.status_code == 200
    assert response.json()["sync_status"] == "ignored"
    assert Expense.objects.get(id=expense_id).title == "Current"


@pytest.mark.django_db
def test_stale_settlement_upsert_is_ignored_when_archived_but_rejects_left_actor(client):
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    group = create_group_with_members(alice, bob)
    client.force_login(alice)
    archived_settlement_id = uuid4()
    left_actor_settlement_id = uuid4()
    created_at = stamp()
    client.put(
        f"/api/groups/{group.id}/settlements/{archived_settlement_id}/",
        settlement_payload(alice, bob, alice, settlement_id=archived_settlement_id, created_at=created_at, updated_at=stamp(20)),
        content_type="application/json",
    )
    client.put(
        f"/api/groups/{group.id}/settlements/{left_actor_settlement_id}/",
        settlement_payload(alice, bob, alice, settlement_id=left_actor_settlement_id, created_at=created_at, updated_at=stamp(20)),
        content_type="application/json",
    )

    group.archived_at = timezone.now()
    group.save(update_fields=["archived_at"])
    archived_response = client.put(
        f"/api/groups/{group.id}/settlements/{archived_settlement_id}/",
        settlement_payload(alice, bob, alice, settlement_id=archived_settlement_id, created_at=created_at, updated_at=stamp(10)),
        content_type="application/json",
    )
    group.archived_at = None
    group.save(update_fields=["archived_at"])
    Membership.objects.filter(group=group, user=alice).update(left_at=timezone.now())
    left_actor_response = client.put(
        f"/api/groups/{group.id}/settlements/{left_actor_settlement_id}/",
        settlement_payload(alice, bob, alice, settlement_id=left_actor_settlement_id, created_at=created_at, updated_at=stamp(10)),
        content_type="application/json",
    )

    assert archived_response.status_code == 200
    assert archived_response.json()["sync_status"] == "ignored"
    assert left_actor_response.status_code == 400
    assert left_actor_response.json()["code"] == "not_group_member"
    assert Settlement.objects.get(id=archived_settlement_id).amount_cents == 500
    assert Settlement.objects.get(id=left_actor_settlement_id).amount_cents == 500


@pytest.mark.django_db
def test_equal_split_normalizes_stored_participant_values(client):
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    group = create_group_with_members(alice, bob)
    client.force_login(alice)
    payload = expense_payload(alice, alice, [alice, bob])
    payload["shares"] = [{"user": str(alice.id), "value": 0}, {"user": str(bob.id), "value": -4}]

    response = client.put(f"/api/groups/{group.id}/expenses/{payload['id']}/", payload, content_type="application/json")

    assert response.status_code == 200
    assert {share["value"] for share in response.json()["expense"]["shares"]} == {1}


@pytest.mark.django_db
def test_conflicting_upsert_still_conflicts_before_any_overwrite(client):
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    group = create_group_with_members(alice, bob)
    client.force_login(alice)
    expense_id = uuid4()
    created_at = stamp()
    client.put(
        f"/api/groups/{group.id}/expenses/{expense_id}/",
        expense_payload(alice, alice, [alice], expense_id=expense_id, created_at=created_at, updated_at=stamp(20), title="Original"),
        content_type="application/json",
    )
    group.archived_at = timezone.now()
    group.save(update_fields=["archived_at"])

    response = client.put(
        f"/api/groups/{group.id}/expenses/{expense_id}/",
        expense_payload(bob, alice, [alice], expense_id=expense_id, created_at=created_at, updated_at=stamp(10), title="Conflict"),
        content_type="application/json",
    )

    assert response.status_code == 409
    assert response.json()["sync_status"] == "conflict"
    assert Expense.objects.get(id=expense_id).title == "Original"


@pytest.mark.django_db
def test_batch_push_applies_valid_rows_even_when_another_row_conflicts(client):
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    group = create_group_with_members(alice, bob)
    client.force_login(alice)
    existing_id = uuid4()
    created_at = stamp()
    client.put(
        f"/api/groups/{group.id}/expenses/{existing_id}/",
        expense_payload(alice, alice, [alice], expense_id=existing_id, created_at=created_at, updated_at=created_at),
        content_type="application/json",
    )
    valid_settlement = settlement_payload(alice, bob, alice)

    response = client.post(
        f"/api/groups/{group.id}/sync/push/",
        {
            "expenses": [
                expense_payload(bob, alice, [alice], expense_id=existing_id, created_at=created_at, updated_at=stamp(10)),
            ],
            "settlements": [valid_settlement],
        },
        content_type="application/json",
    )

    assert response.status_code == 200
    assert response.json()["expenses"][0]["sync_status"] == "conflict"
    assert response.json()["settlements"][0]["sync_status"] == "created"
    assert Settlement.objects.filter(id=valid_settlement["id"]).exists()


@pytest.mark.django_db
def test_pull_returns_rows_newer_than_since(client):
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    group = create_group_with_members(alice, bob)
    client.force_login(alice)
    old_time = timezone.now() - timezone.timedelta(days=1)
    new_time = timezone.now()
    Expense.objects.create(
        id=uuid4(),
        group=group,
        title="Old",
        amount_cents=100,
        date=old_time.date(),
        payer=alice,
        split_type=Expense.SplitType.EQUAL,
        created_by=alice,
        created_at=old_time,
        updated_by=alice,
        updated_at=old_time,
    )
    expected = Settlement.objects.create(
        id=uuid4(),
        group=group,
        from_user=bob,
        to_user=alice,
        amount_cents=500,
        created_by=alice,
        created_at=new_time,
        updated_by=alice,
        updated_at=new_time,
    )

    response = client.get(f"/api/groups/{group.id}/sync/pull/?since={old_time.isoformat().replace('+00:00', 'Z')}")

    assert response.status_code == 200
    assert response.json()["expenses"] == []
    assert response.json()["settlements"][0]["id"] == str(expected.id)


@pytest.mark.django_db
def test_sync_push_and_pull_preserve_expense_icon(client):
    """Return an allowed expense icon from batch push and incremental pull."""
    alice = create_user("icon-sync@example.com")
    group = create_group_with_members(alice)
    client.force_login(alice)
    payload = expense_payload(alice, alice, [alice])
    payload["icon"] = "coffee"

    push_response = client.post(
        f"/api/groups/{group.id}/sync/push/",
        {"expenses": [payload]},
        content_type="application/json",
    )
    pull_response = client.get(
        f"/api/groups/{group.id}/sync/pull/?since={stamp(-1)}"
    )

    assert push_response.status_code == 200
    assert push_response.json()["expenses"][0]["row"]["icon"] == "coffee"
    assert pull_response.status_code == 200
    assert pull_response.json()["expenses"][0]["icon"] == "coffee"
