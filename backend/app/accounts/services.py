"""Domain services for account registration and login.

The functions in this module keep product-rule checks out of the HTTP
views and expose expected failures as structured domain errors.
"""

from django.contrib.auth import authenticate

from app.accounts.models import User
from app.core.config import settings
from app.core.errors import DomainError


def register_user(email: str, password: str, first_name: str, last_name: str) -> User:
    """Create a normal user when self-registration is enabled.

    Args:
        email: User email address, also used as the login identifier.
        password: Plain-text password to hash before storing.
        first_name: User's first name.
        last_name: User's last name.

    Returns:
        The created normal user.

    Raises:
        DomainError: If self-registration is disabled.
    """
    if not settings.ALLOW_SELF_REGISTRATION:
        raise DomainError("registration_disabled", "Self-registration is disabled.")

    return User.objects.create_user(
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
    )


def create_admin_managed_user(email: str, password: str, first_name: str, last_name: str) -> User:
    """Create a user from the admin API regardless of self-registration state."""
    return User.objects.create_user(
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
    )


def update_admin_managed_user(user: User, fields: dict) -> User:
    """Update only admin-editable user fields."""
    allowed_fields = {"email", "first_name", "last_name", "is_staff", "is_superuser", "is_active"}
    update_fields = []

    for field, value in fields.items():
        if field not in allowed_fields:
            continue
        if field == "email":
            value = User.objects.normalize_email(value)
        setattr(user, field, value)
        update_fields.append(field)

    if update_fields:
        user.save(update_fields=update_fields)
    return user


def reset_user_password(user: User, password: str) -> None:
    """Set a new password for a user account."""
    user.set_password(password)
    user.save(update_fields=["password"])


def set_user_active(user: User, is_active: bool) -> None:
    """Activate or deactivate a user account."""
    user.is_active = is_active
    user.save(update_fields=["is_active"])


def authenticate_for_login(email: str, password: str) -> User:
    """Authenticate a user and reactivate matching inactive accounts.

    Args:
        email: User email address.
        password: Plain-text password to verify.

    Returns:
        The authenticated user.

    Raises:
        DomainError: If the credentials do not match a user.
    """
    user = authenticate(username=email, password=password)
    if user is not None:
        return user

    inactive_user = User.objects.filter(email=User.objects.normalize_email(email), is_active=False).first()
    if inactive_user is not None and inactive_user.check_password(password):
        inactive_user.is_active = True
        inactive_user.save(update_fields=["is_active"])
        user = authenticate(username=email, password=password)
        if user is not None:
            return user

    raise DomainError("invalid_credentials", "Invalid email or password.")
