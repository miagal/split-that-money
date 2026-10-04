"""Serializers for session-based account authentication APIs.

This module validates registration and login payloads and exposes the
current-user response shape shared by auth endpoints.
"""

from rest_framework import serializers

from app.accounts.models import User


class RegisterSerializer(serializers.Serializer):
    """Validate the fields needed to create a self-registered account."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    first_name = serializers.CharField()
    last_name = serializers.CharField()

    def validate_email(self, value):
        """Normalize the email and identify an existing account for inline feedback."""
        email = User.objects.normalize_email(value)
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError(
                "An account with this email already exists.", code="email_already_exists"
            )
        return email


class LoginSerializer(serializers.Serializer):
    """Validate the credentials used to start a session."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class AdminUserCreateSerializer(serializers.Serializer):
    """Validate system-admin user creation payloads."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    first_name = serializers.CharField()
    last_name = serializers.CharField()

    def validate_email(self, value):
        """Normalize and reject duplicate account emails."""
        email = User.objects.normalize_email(value)
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return email


class AdminUserPatchSerializer(serializers.Serializer):
    """Validate system-admin edits to existing user fields."""

    email = serializers.EmailField(required=False)
    first_name = serializers.CharField(required=False)
    last_name = serializers.CharField(required=False)
    is_staff = serializers.BooleanField(required=False)
    is_superuser = serializers.BooleanField(required=False)
    is_active = serializers.BooleanField(required=False)

    def validate_email(self, value):
        """Normalize and reject email collisions with other users."""
        email = User.objects.normalize_email(value)
        if User.objects.filter(email=email).exclude(id=self.instance.id).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return email


class ResetPasswordSerializer(serializers.Serializer):
    """Validate system-admin password reset payloads."""

    password = serializers.CharField(write_only=True)


class UserSerializer(serializers.ModelSerializer):
    """Serialize the user identity fields returned by account APIs."""

    class Meta:
        """Expose the stable public user fields."""

        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "is_staff",
            "is_superuser",
            "display_name",
        ]
        read_only_fields = fields
