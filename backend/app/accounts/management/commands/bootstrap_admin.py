"""Create the bootstrap system administrator if it does not exist."""

from django.core.management.base import BaseCommand

from app.accounts.models import User
from app.core.config import settings


class Command(BaseCommand):
    """Create the configured bootstrap admin user once."""

    help = "Create the configured bootstrap admin user if it does not exist."

    def handle(self, *args, **options):
        """Create a superuser from configured bootstrap settings."""
        if not settings.BOOTSTRAP_ADMIN_ENABLED:
            self.stdout.write("Bootstrap admin is disabled.")
            return

        email = User.objects.normalize_email(settings.BOOTSTRAP_ADMIN_EMAIL)
        if User.objects.filter(email=email).exists():
            self.stdout.write(f"Bootstrap admin already exists: {email}")
            return

        User.objects.create_superuser(
            email=email,
            password=settings.BOOTSTRAP_ADMIN_PASSWORD,
            first_name=settings.BOOTSTRAP_ADMIN_FIRST_NAME,
            last_name=settings.BOOTSTRAP_ADMIN_LAST_NAME,
        )
        self.stdout.write(f"Bootstrap admin created: {email}")
