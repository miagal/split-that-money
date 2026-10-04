"""Custom user model for email-based authentication."""

import uuid

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from app.accounts.managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    """Application user account with email as the unique login identifier."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    @property
    def display_name(self) -> str:
        """Return the product display name derived from first and last name."""
        return f"{self.first_name} {self.last_name}".strip()

    def __str__(self) -> str:
        """Return the stable account handle for admin and logs."""
        return self.email
