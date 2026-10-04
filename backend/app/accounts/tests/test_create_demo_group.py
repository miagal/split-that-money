"""Tests for the repeatable local demo-group management command."""

import stat
from uuid import uuid4

import pytest
from django.core.management import call_command
from django.utils import timezone

from app.accounts.models import User
from app.expenses.models import Expense
from app.expenses.services import upsert_expense
from app.groups.models import Group, Membership
from app.groups.services import create_group


DEMO_DOMAIN = "@demo.split-that-money.test"
DEMO_GROUP_NAME = "Demo house in Lisbon"


@pytest.mark.django_db
def test_create_demo_group_builds_the_complete_dataset(tmp_path):
    """Create all demo users, memberships, money rows, and private credentials."""
    credentials_path = tmp_path / "demo-credentials.local.md"

    call_command("create_demo_group", credentials_file=credentials_path)

    users = list(User.objects.filter(email__endswith=DEMO_DOMAIN).order_by("email"))
    admin = User.objects.get(email="demo-admin@demo.split-that-money.test")
    group = Group.objects.get(name=DEMO_GROUP_NAME, created_by=admin)
    memberships = group.memberships.filter(left_at__isnull=True)
    expenses = group.expenses.prefetch_related("shares").order_by("created_at")
    settlements = group.settlements.all()

    assert len(users) == 8
    assert memberships.count() == 8
    assert memberships.filter(role=Membership.Role.ADMIN, user=admin).count() == 1
    assert memberships.filter(role=Membership.Role.MEMBER).count() == 7
    assert expenses.count() == 120
    assert set(expenses.values_list("split_type", flat=True)) == {
        Expense.SplitType.EQUAL,
        Expense.SplitType.EXACT,
        Expense.SplitType.SHARES,
        Expense.SplitType.PERCENT,
    }
    assert all(sum(share.amount_cents for share in expense.shares.all()) == expense.amount_cents for expense in expenses)
    assert all(
        later.created_at - earlier.created_at == timezone.timedelta(minutes=1)
        for earlier, later in zip(expenses, expenses[1:])
    )
    assert settlements.count() == 5
    assert all(row.amount_cents > 0 and row.from_user_id != row.to_user_id for row in settlements)

    credentials = credentials_path.read_text()
    assert "demo-admin@demo.split-that-money.test" in credentials
    assert all(user.email in credentials for user in users)
    assert stat.S_IMODE(credentials_path.stat().st_mode) == 0o600


@pytest.mark.django_db
def test_create_demo_group_rerun_is_deterministic_and_scoped(tmp_path):
    """Rebuild only the command-owned money rows and preserve unrelated data."""
    credentials_path = tmp_path / "demo-credentials.local.md"
    outsider = User.objects.create_user(
        "outsider@example.com",
        "secret123",
        first_name="Outside",
        last_name="User",
    )
    external_group = create_group(outsider, DEMO_GROUP_NAME, "EUR", "lucide:house")
    external_expense_id = uuid4()
    timestamp = timezone.now()
    upsert_expense(
        outsider,
        external_group,
        {
            "id": external_expense_id,
            "created_by": outsider.id,
            "created_at": timestamp,
            "updated_at": timestamp,
            "title": "Unrelated expense",
            "amount_cents": 1200,
            "date": timestamp.date(),
            "payer": outsider.id,
            "split_type": Expense.SplitType.EQUAL,
            "icon": "lucide:utensils",
            "note": "Must survive demo rebuilds.",
            "shares": [{"user": outsider.id, "value": 1}],
            "deleted": False,
            "created_on_device": "test-suite",
        },
    )

    call_command("create_demo_group", credentials_file=credentials_path)
    admin = User.objects.get(email="demo-admin@demo.split-that-money.test")
    group = Group.objects.get(name=DEMO_GROUP_NAME, created_by=admin)
    first_expense_ids = list(group.expenses.order_by("created_at").values_list("id", flat=True))
    admin.set_password("temporarily-changed")
    admin.save(update_fields=["password"])

    call_command("create_demo_group", credentials_file=credentials_path)

    group.refresh_from_db()
    admin.refresh_from_db()
    assert list(group.expenses.order_by("created_at").values_list("id", flat=True)) == first_expense_ids
    assert group.expenses.count() == 120
    assert group.settlements.count() == 5
    assert admin.check_password("DemoAdmin!2026")
    assert Group.objects.filter(id=external_group.id).exists()
    assert Expense.objects.filter(id=external_expense_id, group=external_group).exists()
    assert User.objects.filter(id=outsider.id).exists()
