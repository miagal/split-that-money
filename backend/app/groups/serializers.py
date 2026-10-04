"""Serializers for group lifecycle API payloads and responses."""

import regex

from rest_framework import serializers

from app.accounts.models import User
from app.accounts.serializers import UserSerializer
from app.groups.models import Group, Membership


GROUP_ICON_VALUES = frozenset(
    {
        "lucide:house",
        "lucide:plane",
        "lucide:shopping-basket",
        "lucide:utensils-crossed",
        "lucide:car-front",
        "lucide:tent-tree",
        "lucide:party-popper",
        "lucide:handshake",
    }
)


def is_one_emoji_grapheme(value: str) -> bool:
    """Return whether a value is one Unicode emoji grapheme.

    Args:
        value: The text after the ``emoji:`` prefix.

    Returns:
        True when the text is one grapheme cluster containing an emoji base,
        regional indicator, or keycap sequence.
    """
    return bool(
        regex.fullmatch(r"\X", value)
        and regex.search(r"\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]\uFE0F?\u20E3", value)
    )


def validate_group_icon(value: str) -> str:
    """Validate a group icon against supported Lucide and emoji formats.

    Args:
        value: A ``lucide:`` allowlist value or ``emoji:`` prefixed grapheme.

    Returns:
        The validated icon unchanged.

    Raises:
        serializers.ValidationError: If the icon is not a supported value.
    """
    if value in GROUP_ICON_VALUES or (
        value.startswith("emoji:") and is_one_emoji_grapheme(value.removeprefix("emoji:"))
    ):
        return value
    raise serializers.ValidationError("Use an allowed Lucide icon or exactly one emoji.")


class MembershipSerializer(serializers.ModelSerializer):
    """Serialize group membership rows with user identity."""

    user = UserSerializer(read_only=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        """Expose stable membership fields."""

        model = Membership
        fields = ["id", "user", "role", "joined_at", "left_at", "is_active"]
        read_only_fields = fields


class GroupSerializer(serializers.ModelSerializer):
    """Serialize group details returned by lifecycle endpoints."""

    memberships = MembershipSerializer(many=True, read_only=True)

    class Meta:
        """Expose stable group fields."""

        model = Group
        fields = ["id", "name", "currency", "icon", "created_by", "created_at", "updated_at", "archived_at", "memberships"]
        read_only_fields = ["id", "created_by", "created_at", "updated_at", "archived_at", "memberships"]


class GroupCreateSerializer(serializers.Serializer):
    """Validate required group creation payload fields."""

    name = serializers.CharField(max_length=150)
    currency = serializers.CharField(max_length=3, min_length=3)
    icon = serializers.CharField(max_length=80, validators=[validate_group_icon])

    def validate_currency(self, value: str) -> str:
        """Normalize an ISO currency code submitted by a create request.

        Args:
            value: The three-character currency code from the request.

        Returns:
            The uppercase currency code stored on the group.
        """
        return value.upper()


class GroupPatchSerializer(serializers.Serializer):
    """Validate group update payloads."""

    name = serializers.CharField(max_length=150, required=False)
    icon = serializers.CharField(max_length=80, required=False, validators=[validate_group_icon])

    def validate(self, attrs):
        """Require at least one editable group field.

        Args:
            attrs: Validated optional patch fields.

        Returns:
            The non-empty patch payload.

        Raises:
            serializers.ValidationError: If the request would change nothing.
        """
        if not attrs:
            raise serializers.ValidationError("Provide a name or icon.")
        return attrs


class AddMemberSerializer(serializers.Serializer):
    """Validate add-member payloads."""

    email = serializers.EmailField()


class MemberSearchResultSerializer(serializers.ModelSerializer):
    """Serialize the narrow account identity used by the member picker."""

    class Meta:
        """Expose only the fields needed to choose an existing account."""

        model = User
        fields = ["id", "email", "first_name", "last_name", "display_name"]
        read_only_fields = fields
