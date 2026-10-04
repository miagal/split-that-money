"""API views for session-based account authentication.

These views implement self-registration, login, logout, and current-user
lookup while mapping expected domain failures to stable JSON responses.
"""

from django.contrib.auth import login, logout
from django.db import IntegrityError
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework.exceptions import ValidationError
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from app.accounts.models import User
from app.accounts.permissions import IsSystemAdmin
from app.accounts.serializers import (
    AdminUserCreateSerializer,
    AdminUserPatchSerializer,
    LoginSerializer,
    RegisterSerializer,
    ResetPasswordSerializer,
    UserSerializer,
)
from app.accounts.services import (
    authenticate_for_login,
    create_admin_managed_user,
    register_user,
    reset_user_password,
    set_user_active,
    update_admin_managed_user,
)
from app.core.errors import DomainError
from app.core.responses import error_response


@method_decorator(csrf_protect, name="dispatch")
class RegisterView(APIView):
    """Create a normal user account through self-registration."""

    permission_classes = [AllowAny]

    def post(self, request):
        """Validate registration data and return the created user."""
        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            email_errors = serializer.errors.get("email", [])
            if any(getattr(error, "code", None) == "email_already_exists" for error in email_errors):
                return error_response(
                    "email_already_exists",
                    "An account with this email already exists. Sign in instead or use another email.",
                    status.HTTP_400_BAD_REQUEST,
                    {"email": ["An account with this email already exists."]},
                )
            raise ValidationError(serializer.errors)

        try:
            user = register_user(**serializer.validated_data)
        except DomainError as error:
            return error_response(error.code, error.message, status.HTTP_403_FORBIDDEN)

        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    """Start a Django session for valid email/password credentials."""

    permission_classes = [AllowAny]

    def post(self, request):
        """Authenticate credentials, log the user in, and return that user."""
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            user = authenticate_for_login(**serializer.validated_data)
        except DomainError as error:
            return error_response(error.code, error.message, status.HTTP_400_BAD_REQUEST)

        login(request, user)
        return Response(UserSerializer(user).data)


@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    """End the current Django session."""

    permission_classes = [AllowAny]

    def post(self, request):
        """Log out the current user and return an empty response."""
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """Return the current authenticated user."""

    def get(self, request):
        """Serialize the user attached to the current session."""
        return Response(UserSerializer(request.user).data)


class AdminUserListCreateView(APIView):
    """List and create users for system administrators."""

    permission_classes = [IsSystemAdmin]

    def get(self, request):
        """Return all users ordered by email."""
        users = User.objects.order_by("email")
        return Response(UserSerializer(users, many=True).data)

    def post(self, request):
        """Create a user independently from self-registration settings."""
        serializer = AdminUserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            user = create_admin_managed_user(**serializer.validated_data)
        except IntegrityError as error:
            raise ValidationError({"email": ["A user with this email already exists."]}) from error

        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class AdminUserDetailView(APIView):
    """Retrieve and update a user for system administrators."""

    permission_classes = [IsSystemAdmin]

    def get(self, request, user_id):
        """Return one user by id."""
        user = get_object_or_404(User, id=user_id)
        return Response(UserSerializer(user).data)

    def patch(self, request, user_id):
        """Update only allowed admin-editable user fields."""
        user = get_object_or_404(User, id=user_id)
        serializer = AdminUserPatchSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        try:
            update_admin_managed_user(user, serializer.validated_data)
        except IntegrityError as error:
            raise ValidationError({"email": ["A user with this email already exists."]}) from error

        return Response(UserSerializer(user).data)


class ResetPasswordView(APIView):
    """Reset a user's password."""

    permission_classes = [IsSystemAdmin]

    def post(self, request, user_id):
        """Set the user's password to the supplied value."""
        user = get_object_or_404(User, id=user_id)
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reset_user_password(user, serializer.validated_data["password"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeactivateUserView(APIView):
    """Deactivate a user account."""

    permission_classes = [IsSystemAdmin]

    def post(self, request, user_id):
        """Mark the user inactive without deleting the row."""
        user = get_object_or_404(User, id=user_id)
        set_user_active(user, False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReactivateUserView(APIView):
    """Reactivate a user account."""

    permission_classes = [IsSystemAdmin]

    def post(self, request, user_id):
        """Mark the user active again."""
        user = get_object_or_404(User, id=user_id)
        set_user_active(user, True)
        return Response(status=status.HTTP_204_NO_CONTENT)
