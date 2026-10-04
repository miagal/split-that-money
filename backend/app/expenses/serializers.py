"""Serializers for expense, settlement, and sync API payloads."""

from rest_framework import serializers

from app.expenses.models import Expense, Settlement


EXPENSE_ICON_VALUES = frozenset(
    {
        "utensils-crossed",
        "coffee",
        "shopping-basket",
        "car-front",
        "ticket",
        "bed-double",
        "party-popper",
    }
)


class ExpenseShareInputSerializer(serializers.Serializer):
    """Validate one participant line in an expense upsert payload."""

    user = serializers.UUIDField()
    value = serializers.IntegerField()


class ExpenseUpsertSerializer(serializers.Serializer):
    """Validate client-owned expense upsert payloads."""

    id = serializers.UUIDField()
    created_by = serializers.UUIDField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()
    title = serializers.CharField(max_length=200)
    amount_cents = serializers.IntegerField()
    date = serializers.DateField()
    payer = serializers.UUIDField()
    split_type = serializers.ChoiceField(choices=Expense.SplitType.choices)
    icon = serializers.ChoiceField(choices=EXPENSE_ICON_VALUES, allow_null=True, required=False, default=None)
    note = serializers.CharField(allow_blank=True, required=False)
    shares = ExpenseShareInputSerializer(many=True)
    deleted = serializers.BooleanField(required=False, default=False)
    created_on_device = serializers.CharField(allow_blank=True, allow_null=True, required=False)


class SettlementUpsertSerializer(serializers.Serializer):
    """Validate client-owned settlement upsert payloads."""

    id = serializers.UUIDField()
    created_by = serializers.UUIDField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()
    from_user = serializers.UUIDField()
    to_user = serializers.UUIDField()
    amount_cents = serializers.IntegerField()
    deleted = serializers.BooleanField(required=False, default=False)
    created_on_device = serializers.CharField(allow_blank=True, allow_null=True, required=False)


class SyncPushSerializer(serializers.Serializer):
    """Validate a batch sync push request."""

    expenses = ExpenseUpsertSerializer(many=True, required=False, default=list)
    settlements = SettlementUpsertSerializer(many=True, required=False, default=list)


class SyncPullQuerySerializer(serializers.Serializer):
    """Validate the incremental pull cursor."""

    since = serializers.DateTimeField()


class ExpenseShareSerializer(serializers.Serializer):
    """Serialize one stored expense share."""

    user = serializers.UUIDField(source="user_id")
    value = serializers.IntegerField()
    amount_cents = serializers.IntegerField()


class ExpenseSerializer(serializers.ModelSerializer):
    """Serialize expense rows for API responses and sync pull."""

    payer = serializers.UUIDField(source="payer_id")
    created_by = serializers.UUIDField(source="created_by_id")
    updated_by = serializers.UUIDField(source="updated_by_id")
    shares = ExpenseShareSerializer(many=True, read_only=True)

    class Meta:
        """Expose stable expense API fields."""

        model = Expense
        fields = [
            "id",
            "title",
            "amount_cents",
            "date",
            "payer",
            "split_type",
            "icon",
            "note",
            "shares",
            "created_by",
            "created_at",
            "updated_by",
            "updated_at",
            "deleted",
            "created_on_device",
        ]


class SettlementSerializer(serializers.ModelSerializer):
    """Serialize settlement rows for API responses and sync pull."""

    from_user = serializers.UUIDField(source="from_user_id")
    to_user = serializers.UUIDField(source="to_user_id")
    created_by = serializers.UUIDField(source="created_by_id")
    updated_by = serializers.UUIDField(source="updated_by_id")

    class Meta:
        """Expose stable settlement API fields."""

        model = Settlement
        fields = [
            "id",
            "from_user",
            "to_user",
            "amount_cents",
            "created_by",
            "created_at",
            "updated_by",
            "updated_at",
            "deleted",
            "created_on_device",
        ]
