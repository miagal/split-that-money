#!/usr/bin/env python
"""Command-line entrypoint for Django management tasks."""

import os
import sys


def main() -> None:
    """Run Django's management command dispatcher."""
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "app.settings")

    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
