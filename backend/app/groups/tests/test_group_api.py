"""Tests for group lifecycle API behavior."""

import pytest
from django.utils import timezone

from app.accounts.models import User
from app.expenses.models import Expense, ExpenseShare, Settlement
from app.groups.models import Group, Membership


def create_user(email):
    """Create a test user with stable required profile fields."""
    return User.objects.create_user(email, "secret123", first_name="Test", last_name="User")


@pytest.mark.django_db
def test_create_group_requires_and_returns_icon(client):
    """Require an icon and return the selected Lucide icon on creation."""
    user = User.objects.create_user("person@example.com", "secret123", first_name="Person", last_name="Example")
    client.force_login(user)

    missing_icon_response = client.post("/api/groups/", {"name": "Trip", "currency": "EUR"}, content_type="application/json")

    assert missing_icon_response.status_code == 400

    response = client.post(
        "/api/groups/",
        {"name": "Trip", "currency": "EUR", "icon": "lucide:plane"},
        content_type="application/json",
    )

    assert response.status_code == 201
    group = Group.objects.get(name="Trip")
    assert response.json()["id"] == str(group.id)
    assert response.json()["icon"] == "lucide:plane"
    assert Membership.objects.get(group=group, user=user).role == Membership.Role.ADMIN


@pytest.mark.django_db
def test_create_group_accepts_one_emoji_grapheme_icon(client):
    """Accept a single emoji grapheme, including a zero-width-joiner sequence."""
    user = create_user("emoji@example.com")
    client.force_login(user)

    response = client.post(
        "/api/groups/",
        {"name": "Family", "currency": "EUR", "icon": "emoji:👨‍👩‍👧‍👦"},
        content_type="application/json",
    )

    assert response.status_code == 201
    assert response.json()["icon"] == "emoji:👨‍👩‍👧‍👦"


@pytest.mark.django_db
def test_group_admin_updates_name_and_icon(client):
    """Persist both editable group presentation fields through one patch."""
    admin = create_user("group-update@example.com")
    group = Group.objects.create(name="Trip", currency="EUR", icon="lucide:house", created_by=admin)
    Membership.objects.create(group=group, user=admin, role=Membership.Role.ADMIN)
    client.force_login(admin)

    response = client.patch(
        f"/api/groups/{group.id}/",
        {"name": "Updated trip", "icon": "lucide:plane"},
        content_type="application/json",
    )

    assert response.status_code == 200
    group.refresh_from_db()
    assert group.name == "Updated trip"
    assert group.icon == "lucide:plane"


@pytest.mark.django_db
@pytest.mark.parametrize("icon", ["lucide:ghost", "emoji:", "emoji:🏠🏠", "house"])
def test_create_group_rejects_invalid_icon(client, icon):
    """Reject icons outside the Lucide allowlist or one-emoji-grapheme format."""
    user = create_user("invalid-icon@example.com")
    client.force_login(user)

    response = client.post(
        "/api/groups/",
        {"name": "Trip", "currency": "EUR", "icon": icon},
        content_type="application/json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "code": "validation_error",
        "message": "Please correct the highlighted fields.",
        "fields": {"icon": ["Use an allowed Lucide icon or exactly one emoji."]},
    }


@pytest.mark.django_db
def test_admin_adds_existing_user_by_email(client):
    admin = User.objects.create_user("admin@example.com", "secret123", first_name="Admin", last_name="User")
    member = User.objects.create_user("member@example.com", "secret123", first_name="Member", last_name="User")
    group = Group.objects.create(name="Trip", currency="EUR", created_by=admin)
    Membership.objects.create(group=group, user=admin, role=Membership.Role.ADMIN)
    client.force_login(admin)

    response = client.post(f"/api/groups/{group.id}/members/", {"email": member.email}, content_type="application/json")

    assert response.status_code == 201
    assert Membership.objects.filter(group=group, user=member).exists()


@pytest.mark.django_db
def test_group_admin_searches_active_non_members_by_email(client):
    """Return only active accounts outside the group matching the email query."""
    admin = create_user("admin@example.com")
    current_member = create_user("active-member@example.com")
    candidate = User.objects.create_user(
        "available@example.com", "secret123", first_name="Available", last_name="Person"
    )
    inactive_account = User.objects.create_user(
        "inactive-available@example.com", "secret123", first_name="Inactive", last_name="Person", is_active=False
    )
    group = Group.objects.create(name="Trip", currency="EUR", created_by=admin)
    Membership.objects.create(group=group, user=admin, role=Membership.Role.ADMIN)
    Membership.objects.create(group=group, user=current_member)
    client.force_login(admin)

    response = client.get(f"/api/groups/{group.id}/members/search/?email=AV")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": str(candidate.id),
            "email": "available@example.com",
            "first_name": "Available",
            "last_name": "Person",
            "display_name": "Available Person",
        }
    ]
    assert inactive_account.is_active is False


@pytest.mark.django_db
def test_member_account_search_excludes_active_group_members_and_inactive_accounts(client):
    """Exclude candidates who are current members or inactive accounts."""
    admin = create_user("admin@example.com")
    current_member = create_user("member-available@example.com")
    inactive_account = User.objects.create_user(
        "inactive-available@example.com", "secret123", first_name="Inactive", last_name="Person", is_active=False
    )
    group = Group.objects.create(name="Trip", currency="EUR", created_by=admin)
    Membership.objects.create(group=group, user=admin, role=Membership.Role.ADMIN)
    Membership.objects.create(group=group, user=current_member)
    client.force_login(admin)

    response = client.get(f"/api/groups/{group.id}/members/search/?email=av")

    assert response.status_code == 200
    assert response.json() == []
    assert inactive_account.is_active is False


@pytest.mark.django_db
@pytest.mark.parametrize("query", ["", " ", "a", " a "])
def test_member_account_search_requires_two_trimmed_characters(client, query):
    """Do not expose matches for an empty or one-character effective query."""
    admin = create_user("admin@example.com")
    create_user("available@example.com")
    group = Group.objects.create(name="Trip", currency="EUR", created_by=admin)
    Membership.objects.create(group=group, user=admin, role=Membership.Role.ADMIN)
    client.force_login(admin)

    response = client.get(f"/api/groups/{group.id}/members/search/", {"email": query})

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.django_db
def test_member_account_search_caps_matching_accounts_at_three(client):
    """Bound picker results after matching and order them consistently by email."""
    admin = create_user("admin@example.com")
    User.objects.bulk_create([
        User(email=f"candidate-{number:02d}@example.com", first_name="Candidate", last_name=str(number))
        for number in range(12)
    ])
    group = Group.objects.create(name="Trip", currency="EUR", created_by=admin)
    Membership.objects.create(group=group, user=admin, role=Membership.Role.ADMIN)
    client.force_login(admin)

    response = client.get(f"/api/groups/{group.id}/members/search/", {"email": " candidate "})

    assert response.status_code == 200
    assert [account["email"] for account in response.json()] == [
        "candidate-00@example.com", "candidate-01@example.com", "candidate-02@example.com",
    ]


@pytest.mark.django_db
def test_regular_active_member_cannot_search_member_accounts(client):
    """Reject non-admin group members with the stable permission envelope."""
    admin = create_user("admin@example.com")
    member = create_user("member@example.com")
    group = Group.objects.create(name="Trip", currency="EUR", created_by=admin)
    Membership.objects.create(group=group, user=admin, role=Membership.Role.ADMIN)
    Membership.objects.create(group=group, user=member)
    client.force_login(member)

    response = client.get(f"/api/groups/{group.id}/members/search/?email=av")

    assert response.status_code == 403
    assert response.json() == {
        "code": "permission_denied",
        "message": "You do not have permission to manage this group.",
    }


@pytest.mark.django_db
def test_list_groups_shows_only_active_memberships(client):
    user = create_user("person@example.com")
    visible = Group.objects.create(name="Trip", currency="EUR", created_by=user)
    hidden = Group.objects.create(name="House", currency="USD", created_by=user)
    Membership.objects.create(group=visible, user=user, role=Membership.Role.ADMIN)
    client.force_login(user)

    response = client.get("/api/groups/")

    assert response.status_code == 200
    assert [group["id"] for group in response.json()] == [str(visible.id)]
    assert Group.objects.filter(id=hidden.id).exists()


@pytest.mark.django_db
def test_system_admin_can_list_read_rename_and_add_members_without_membership(client):
    owner = create_user("owner@example.com")
    candidate = create_user("candidate@example.com")
    system_admin = User.objects.create_superuser(
        "operator@example.com", "secret123", first_name="System", last_name="Admin"
    )
    group = Group.objects.create(name="Trip", currency="EUR", created_by=owner)
    Membership.objects.create(group=group, user=owner, role=Membership.Role.ADMIN)
    assert not Membership.objects.filter(group=group, user=system_admin).exists()
    client.force_login(system_admin)

    assert [item["id"] for item in client.get("/api/groups/").json()] == [str(group.id)]
    assert client.get(f"/api/groups/{group.id}/").status_code == 200
    response = client.patch(
        f"/api/groups/{group.id}/", {"name": "Updated trip"}, content_type="application/json"
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Updated trip"
    response = client.post(
        f"/api/groups/{group.id}/members/", {"email": candidate.email}, content_type="application/json"
    )
    assert response.status_code == 201


@pytest.mark.django_db
def test_active_member_leaves_uninvolved_group_and_membership_is_deleted(client):
    user = create_user("person@example.com")
    group = Group.objects.create(name="Trip", currency="EUR", created_by=user)
    Membership.objects.create(group=group, user=user, role=Membership.Role.ADMIN)
    client.force_login(user)

    response = client.post(f"/api/groups/{group.id}/leave/")

    assert response.status_code == 204
    assert not Membership.objects.filter(group=group, user=user).exists()
    assert not Group.objects.filter(id=group.id).exists()


@pytest.mark.django_db
def test_archive_blocks_member_addition(client):
    admin = create_user("admin@example.com")
    member = create_user("member@example.com")
    group = Group.objects.create(name="Trip", currency="EUR", created_by=admin)
    Membership.objects.create(group=group, user=admin, role=Membership.Role.ADMIN)
    client.force_login(admin)
    client.post(f"/api/groups/{group.id}/archive/")

    response = client.post(f"/api/groups/{group.id}/members/", {"email": member.email}, content_type="application/json")

    assert response.status_code == 400
    assert response.json()["code"] == "group_archived"
    assert not Membership.objects.filter(group=group, user=member).exists()


@pytest.mark.django_db
def test_left_member_rejoins_without_unarchiving(client):
    user = create_user("person@example.com")
    group = Group.objects.create(name="Trip", currency="EUR", created_by=user)
    Membership.objects.create(group=group, user=user, role=Membership.Role.MEMBER, left_at=timezone.now())
    group.archived_at = timezone.now()
    group.save(update_fields=["archived_at"])
    client.force_login(user)

    response = client.post(f"/api/groups/{group.id}/rejoin/")

    assert response.status_code == 200
    membership = Membership.objects.get(group=group, user=user)
    group.refresh_from_db()
    assert membership.left_at is None
    assert membership.role == Membership.Role.ADMIN
    assert group.archived_at is not None


@pytest.mark.django_db
def test_rejoining_former_admin_does_not_create_a_second_active_admin(client):
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    group = Group.objects.create(name="Trip", currency="EUR", created_by=alice)
    Membership.objects.create(group=group, user=alice, role=Membership.Role.ADMIN)
    Membership.objects.create(group=group, user=bob)
    now = timezone.now()
    Expense.objects.create(
        group=group,
        title="Dinner",
        amount_cents=1000,
        date=now.date(),
        payer=alice,
        split_type=Expense.SplitType.EQUAL,
        created_by=alice,
        created_at=now,
        updated_by=alice,
        updated_at=now,
    )
    client.force_login(alice)
    client.post(f"/api/groups/{group.id}/leave/")

    response = client.post(f"/api/groups/{group.id}/rejoin/")

    assert response.status_code == 200
    assert Membership.objects.get(group=group, user=alice).role == Membership.Role.MEMBER
    assert list(Membership.objects.filter(group=group, left_at__isnull=True, role=Membership.Role.ADMIN)) == [
        Membership.objects.get(group=group, user=bob)
    ]


@pytest.mark.django_db
def test_adding_former_admin_does_not_create_a_second_active_admin(client):
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    group = Group.objects.create(name="Trip", currency="EUR", created_by=alice)
    Membership.objects.create(group=group, user=alice, role=Membership.Role.ADMIN, left_at=timezone.now())
    Membership.objects.create(group=group, user=bob, role=Membership.Role.ADMIN)
    client.force_login(bob)

    response = client.post(f"/api/groups/{group.id}/members/", {"email": alice.email}, content_type="application/json")

    assert response.status_code == 201
    assert Membership.objects.get(group=group, user=alice).role == Membership.Role.MEMBER


@pytest.mark.django_db
def test_involved_left_member_can_read_group_history(client):
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    group = Group.objects.create(name="Trip", currency="EUR", created_by=alice)
    Membership.objects.create(group=group, user=alice, role=Membership.Role.ADMIN, left_at=timezone.now())
    Membership.objects.create(group=group, user=bob)
    now = timezone.now()
    expense = Expense.objects.create(
        group=group,
        title="Dinner",
        amount_cents=1000,
        date=now.date(),
        payer=alice,
        split_type=Expense.SplitType.EQUAL,
        created_by=alice,
        created_at=now,
        updated_by=alice,
        updated_at=now,
    )
    client.force_login(alice)

    list_response = client.get("/api/groups/")
    group_response = client.get(f"/api/groups/{group.id}/")
    expense_response = client.get(f"/api/groups/{group.id}/expenses/{expense.id}/")

    assert [item["id"] for item in list_response.json()] == [str(group.id)]
    assert group_response.status_code == 200
    assert expense_response.status_code == 200


@pytest.mark.django_db
def test_uninvolved_left_member_cannot_read_group_with_an_active_member(client):
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    group = Group.objects.create(name="Trip", currency="EUR", created_by=bob)
    Membership.objects.create(group=group, user=alice, left_at=timezone.now())
    Membership.objects.create(group=group, user=bob, role=Membership.Role.ADMIN)
    client.force_login(alice)

    list_response = client.get("/api/groups/")
    detail_response = client.get(f"/api/groups/{group.id}/")

    assert list_response.json() == []
    assert detail_response.status_code == 404


@pytest.mark.django_db
def test_delete_requires_archived_group(client):
    admin = create_user("admin@example.com")
    group = Group.objects.create(name="Trip", currency="EUR", created_by=admin)
    Membership.objects.create(group=group, user=admin, role=Membership.Role.ADMIN)
    client.force_login(admin)

    response = client.delete(f"/api/groups/{group.id}/")

    assert response.status_code == 400
    assert response.json()["code"] == "group_not_archived"
    assert Group.objects.filter(id=group.id).exists()


@pytest.mark.django_db
def test_active_member_can_get_group_balances(client):
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    group = Group.objects.create(name="Trip", currency="EUR", created_by=alice)
    Membership.objects.create(group=group, user=alice, role=Membership.Role.ADMIN)
    Membership.objects.create(group=group, user=bob)
    now = timezone.now()
    expense = Expense.objects.create(
        group=group,
        title="Dinner",
        amount_cents=1000,
        date=now.date(),
        payer=alice,
        split_type=Expense.SplitType.EXACT,
        created_by=alice,
        created_at=now,
        updated_by=alice,
        updated_at=now,
    )
    ExpenseShare.objects.create(expense=expense, user=bob, value=1000, amount_cents=1000)
    Settlement.objects.create(
        group=group,
        from_user=bob,
        to_user=alice,
        amount_cents=400,
        created_by=bob,
        created_at=now,
        updated_by=bob,
        updated_at=now,
    )
    client.force_login(alice)

    response = client.get(f"/api/groups/{group.id}/balances/")

    assert response.status_code == 200
    assert {item["user_id"]: item["amount_cents"] for item in response.json()["balances"]} == {
        str(alice.id): 600,
        str(bob.id): -600,
    }


@pytest.mark.django_db
def test_active_member_can_get_suggested_transfers(client):
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    group = Group.objects.create(name="Trip", currency="EUR", created_by=alice)
    Membership.objects.create(group=group, user=alice, role=Membership.Role.ADMIN)
    Membership.objects.create(group=group, user=bob)
    now = timezone.now()
    expense = Expense.objects.create(
        group=group,
        title="Dinner",
        amount_cents=1000,
        date=now.date(),
        payer=alice,
        split_type=Expense.SplitType.EXACT,
        created_by=alice,
        created_at=now,
        updated_by=alice,
        updated_at=now,
    )
    ExpenseShare.objects.create(expense=expense, user=bob, value=1000, amount_cents=1000)
    client.force_login(bob)

    response = client.get(f"/api/groups/{group.id}/suggested-transfers/")

    assert response.status_code == 200
    assert response.json() == {
        "transfers": [
            {
                "from_user_id": str(bob.id),
                "to_user_id": str(alice.id),
                "amount_cents": 1000,
            }
        ]
    }
