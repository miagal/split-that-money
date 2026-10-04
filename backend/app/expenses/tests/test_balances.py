"""Tests for computed balances, suggested transfers, and involvement."""

import pytest
from django.utils import timezone

from app.accounts.models import User
from app.expenses.balances import compute_group_balances, suggest_transfers
from app.expenses.models import Expense, ExpenseShare, Settlement
from app.expenses.services import user_is_involved_in_group
from app.groups.models import Group, Membership


def create_user(email):
    """Create a test user with stable required profile fields."""
    return User.objects.create_user(email, "secret123", first_name="Test", last_name="User")


@pytest.mark.django_db
def test_group_balances_apply_expenses_settlements_and_tombstones():
    alice = create_user("alice@example.com")
    bob = create_user("bob@example.com")
    carol = create_user("carol@example.com")
    group = Group.objects.create(name="Trip", currency="EUR", created_by=alice)
    for user in (alice, bob, carol):
        Membership.objects.create(group=group, user=user)
    now = timezone.now()

    dinner = Expense.objects.create(
        group=group,
        title="Dinner",
        amount_cents=3000,
        date=now.date(),
        payer=alice,
        split_type=Expense.SplitType.EXACT,
        created_by=alice,
        created_at=now,
        updated_by=alice,
        updated_at=now,
    )
    ExpenseShare.objects.create(expense=dinner, user=alice, value=1000, amount_cents=1000)
    ExpenseShare.objects.create(expense=dinner, user=bob, value=2000, amount_cents=2000)
    Expense.objects.create(
        group=group,
        title="Deleted taxi",
        amount_cents=900,
        date=now.date(),
        payer=bob,
        split_type=Expense.SplitType.EQUAL,
        created_by=bob,
        created_at=now,
        updated_by=bob,
        updated_at=now,
        deleted=True,
    )
    Settlement.objects.create(
        group=group,
        from_user=bob,
        to_user=alice,
        amount_cents=500,
        created_by=bob,
        created_at=now,
        updated_by=bob,
        updated_at=now,
    )
    Settlement.objects.create(
        group=group,
        from_user=alice,
        to_user=bob,
        amount_cents=700,
        created_by=alice,
        created_at=now,
        updated_by=alice,
        updated_at=now,
        deleted=True,
    )

    balances = compute_group_balances(group)

    assert balances == {alice.id: 1500, bob.id: -1500, carol.id: 0}
    assert user_is_involved_in_group(alice, group)
    assert user_is_involved_in_group(bob, group)
    assert not user_is_involved_in_group(carol, group)


def test_suggest_transfers_settles_debtors_to_creditors_in_stable_order():
    user_a = User(id="00000000-0000-0000-0000-00000000000a")
    user_b = User(id="00000000-0000-0000-0000-00000000000b")
    user_c = User(id="00000000-0000-0000-0000-00000000000c")

    result = suggest_transfers({user_a.id: 700, user_b.id: -500, user_c.id: -200})

    assert result == [
        {"from_user_id": user_b.id, "to_user_id": user_a.id, "amount_cents": 500},
        {"from_user_id": user_c.id, "to_user_id": user_a.id, "amount_cents": 200},
    ]


def test_suggest_transfers_matches_largest_balances_before_user_id_order():
    user_a = User(id="00000000-0000-0000-0000-00000000000a")
    user_b = User(id="00000000-0000-0000-0000-00000000000b")
    user_c = User(id="00000000-0000-0000-0000-00000000000c")
    user_d = User(id="00000000-0000-0000-0000-00000000000d")

    result = suggest_transfers({user_a.id: 500, user_b.id: -400, user_c.id: 400, user_d.id: -500})

    assert result == [
        {"from_user_id": user_d.id, "to_user_id": user_a.id, "amount_cents": 500},
        {"from_user_id": user_b.id, "to_user_id": user_c.id, "amount_cents": 400},
    ]
