"""Tests for group and membership model basics."""

import pytest
from django.db import IntegrityError, transaction

from app.accounts.models import User
from app.groups.models import Group, Membership


@pytest.mark.django_db
def test_group_creator_can_be_admin_member():
    user = User.objects.create_user("person@example.com", "secret123", first_name="Person", last_name="Example")
    group = Group.objects.create(name="Trip", currency="EUR", created_by=user)
    membership = Membership.objects.create(group=group, user=user, role=Membership.Role.ADMIN)

    assert membership.is_active
    assert membership.role == Membership.Role.ADMIN
    assert str(group) == "Trip"


@pytest.mark.django_db
def test_user_has_only_one_membership_per_group():
    user = User.objects.create_user("person@example.com", "secret123", first_name="Person", last_name="Example")
    group = Group.objects.create(name="Trip", currency="EUR", created_by=user)
    Membership.objects.create(group=group, user=user, role=Membership.Role.ADMIN)

    with pytest.raises(Exception):
        Membership.objects.create(group=group, user=user, role=Membership.Role.MEMBER)


@pytest.mark.django_db
def test_group_has_only_one_active_admin():
    admin = User.objects.create_user("admin@example.com", "secret123", first_name="Admin", last_name="User")
    second_user = User.objects.create_user("second@example.com", "secret123", first_name="Second", last_name="User")
    group = Group.objects.create(name="Trip", currency="EUR", created_by=admin)
    Membership.objects.create(group=group, user=admin, role=Membership.Role.ADMIN)

    with pytest.raises(IntegrityError), transaction.atomic():
        Membership.objects.create(group=group, user=second_user, role=Membership.Role.ADMIN)
