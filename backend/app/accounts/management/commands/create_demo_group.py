"""Create a repeatable local demo group and its private login reference.

The command uses the same group and money services as the API, rebuilding only
the reserved demo group's records so it can safely be rerun during development.
"""

from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from django.core.management.base import BaseCommand
from django.db import transaction

from app.accounts.models import User
from app.expenses.models import Expense
from app.expenses.services import upsert_expense, upsert_settlement
from app.groups.models import Group, Membership
from app.groups.services import add_member, create_group


DEMO_GROUP_NAME = "Demo house in Lisbon"
DEMO_IDENTITIES = (
    ("admin", "Maya", "Costa", "demo-admin@demo.split-that-money.test", "DemoAdmin!2026"),
    ("member", "Leo", "Martin", "demo-leo@demo.split-that-money.test", "DemoLeo!2026"),
    ("member", "Nora", "Silva", "demo-nora@demo.split-that-money.test", "DemoNora!2026"),
    ("member", "Sam", "Miller", "demo-sam@demo.split-that-money.test", "DemoSam!2026"),
    ("member", "Ines", "Ramos", "demo-ines@demo.split-that-money.test", "DemoInes!2026"),
    ("member", "Jonas", "Weber", "demo-jonas@demo.split-that-money.test", "DemoJonas!2026"),
    ("member", "Ava", "Brown", "demo-ava@demo.split-that-money.test", "DemoAva!2026"),
    ("member", "Noah", "Fischer", "demo-noah@demo.split-that-money.test", "DemoNoah!2026"),
)
EXPENSE_DETAILS = (
    ("Groceries", 8420, "shopping-basket"),
    ("Morning coffee", 1860, "coffee"),
    ("Dinner by the river", 12640, "utensils-crossed"),
    ("Train tickets", 7950, "ticket"),
    ("Apartment supplies", 4590, "shopping-basket"),
    ("Taxi home", 2740, "car-front"),
    ("Guest room", 18900, "bed-double"),
    ("Birthday drinks", 9720, "party-popper"),
)
SPLIT_TYPES = (
    Expense.SplitType.EQUAL,
    Expense.SplitType.EXACT,
    Expense.SplitType.SHARES,
    Expense.SplitType.PERCENT,
)
STARTED_AT = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)


class Command(BaseCommand):
    """Build the reserved local demo dataset on demand."""

    help = "Create or rebuild the local demo group and write its credentials."

    def add_arguments(self, parser):
        """Register the required local credential-file destination."""
        parser.add_argument("--credentials-file", required=True, type=Path)

    def handle(self, *args, **options):
        """Create deterministic demo accounts, memberships, and money rows."""
        with transaction.atomic():
            users = self._get_demo_users()
            group = self._get_demo_group(users[0])
            group.expenses.all().delete()
            group.settlements.all().delete()
            self._reset_memberships(group, users)
            self._create_expenses(group, users)
            self._create_settlements(group, users)

        self._write_credentials(options["credentials_file"])
        self.stdout.write(self.style.SUCCESS(f"Demo group ready: {DEMO_GROUP_NAME}"))

    @staticmethod
    def _get_demo_users():
        """Create missing reserved users and restore every declared password."""
        users = []
        for _role, first_name, last_name, email, password in DEMO_IDENTITIES:
            user, _created = User.objects.get_or_create(
                email=email,
                defaults={"first_name": first_name, "last_name": last_name},
            )
            user.set_password(password)
            user.save(update_fields=["password"])
            users.append(user)
        return users

    @staticmethod
    def _get_demo_group(admin):
        """Reuse the admin-owned demo group or create it through domain services."""
        group = Group.objects.filter(name=DEMO_GROUP_NAME, created_by=admin).first()
        if group is None:
            return create_group(admin, DEMO_GROUP_NAME, "EUR", "lucide:house")
        if group.archived_at is not None:
            group.archived_at = None
            group.save(update_fields=["archived_at", "updated_at"])
        return group

    @staticmethod
    def _reset_memberships(group, users):
        """Keep exactly one active admin and the seven declared demo members."""
        user_ids = [user.id for user in users]
        group.memberships.exclude(user_id__in=user_ids).delete()
        group.memberships.exclude(user=users[0]).filter(role=Membership.Role.ADMIN).update(role=Membership.Role.MEMBER)
        admin_membership, _created = Membership.objects.get_or_create(
            group=group,
            user=users[0],
            defaults={"role": Membership.Role.ADMIN},
        )
        admin_membership.role = Membership.Role.ADMIN
        admin_membership.left_at = None
        admin_membership.save(update_fields=["role", "left_at"])
        for user in users[1:]:
            add_member(users[0], group, user.email)

    def _create_expenses(self, group, users):
        """Create 120 varied expenses through the normal expense service."""
        for index in range(120):
            upsert_expense(users[0], group, self._expense_payload(index, users))

    @staticmethod
    def _expense_payload(index, users):
        """Build one fixed expense payload with a valid supported split."""
        title, base_amount, icon = EXPENSE_DETAILS[index % len(EXPENSE_DETAILS)]
        split_type = SPLIT_TYPES[index % len(SPLIT_TYPES)]
        participant_count = 2 + index % 7
        participants = [users[(index + offset) % len(users)] for offset in range(participant_count)]
        amount_cents = base_amount + (index // len(EXPENSE_DETAILS)) * 137
        if split_type == Expense.SplitType.EXACT:
            values = _distributed_values(amount_cents, participant_count)
        elif split_type == Expense.SplitType.PERCENT:
            values = _distributed_values(100, participant_count)
        elif split_type == Expense.SplitType.SHARES:
            values = list(range(1, participant_count + 1))
        else:
            values = [1] * participant_count
        timestamp = STARTED_AT + timedelta(minutes=index)
        return {
            "id": uuid5(NAMESPACE_URL, f"split-that-money/demo/expense/{index}"),
            "created_by": users[0].id,
            "created_at": timestamp,
            "updated_at": timestamp,
            "title": f"{title} #{index + 1}",
            "amount_cents": amount_cents,
            "date": (STARTED_AT + timedelta(days=index // 3)).date(),
            "payer": users[index % len(users)].id,
            "split_type": split_type,
            "icon": icon,
            "note": "Local demo data",
            "shares": [
                {"user": participant.id, "value": value}
                for participant, value in zip(participants, values)
            ],
            "deleted": False,
            "created_on_device": "demo-data-command",
        }

    @staticmethod
    def _create_settlements(group, users):
        """Create five fixed positive payments between different members."""
        for index, amount_cents in enumerate((1500, 2375, 4200, 6850, 9100)):
            timestamp = STARTED_AT + timedelta(minutes=120 + index)
            upsert_settlement(
                users[0],
                group,
                {
                    "id": uuid5(NAMESPACE_URL, f"split-that-money/demo/settlement/{index}"),
                    "created_by": users[0].id,
                    "created_at": timestamp,
                    "updated_at": timestamp,
                    "from_user": users[index + 1].id,
                    "to_user": users[(index + 3) % len(users)].id,
                    "amount_cents": amount_cents,
                    "deleted": False,
                    "created_on_device": "demo-data-command",
                },
            )

    @staticmethod
    def _write_credentials(path):
        """Write all local-only logins to a private Markdown file."""
        lines = [
            "# Local demo credentials",
            "",
            "Development only. Do not commit or reuse these passwords.",
            "",
            "| Role | Display name | Email | Password |",
            "| --- | --- | --- | --- |",
        ]
        lines.extend(
            f"| {role} | {first_name} {last_name} | {email} | `{password}` |"
            for role, first_name, last_name, email, password in DEMO_IDENTITIES
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        path.chmod(0o600)


def _distributed_values(total, count):
    """Distribute an integer total exactly across a fixed participant count."""
    base, remainder = divmod(total, count)
    return [base + (index < remainder) for index in range(count)]
