"""API views for group lifecycle behavior.

Views handle HTTP validation and serialization while delegating lifecycle
state changes to services and read visibility to selectors.
"""

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from app.accounts.models import User
from app.core.errors import DomainError
from app.core.responses import error_response
from app.expenses.balances import compute_group_balances, suggest_transfers
from app.groups.models import Group, Membership
from app.groups.permissions import can_manage_group
from app.groups.selectors import visible_groups_for_user
from app.groups.serializers import (
    AddMemberSerializer,
    GroupCreateSerializer,
    GroupPatchSerializer,
    GroupSerializer,
    MemberSearchResultSerializer,
    MembershipSerializer,
)
from app.groups.services import (
    add_member,
    archive_group,
    create_group,
    delete_group,
    leave_group,
    rejoin_group,
    remove_member,
    update_group,
    unarchive_group,
)


class GroupListCreateView(APIView):
    """List visible groups and create new groups."""

    def get(self, request):
        """Return groups visible to the current user."""
        groups = visible_groups_for_user(request.user).prefetch_related("memberships__user")
        return Response(GroupSerializer(groups, many=True).data)

    def post(self, request):
        """Create a group and admin membership for the current user."""
        serializer = GroupCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        group = create_group(request.user, **serializer.validated_data)
        return Response(GroupSerializer(group).data, status=status.HTTP_201_CREATED)


class GroupDetailView(APIView):
    """Retrieve, update, and delete a group."""

    def get(self, request, group_id):
        """Return one visible group."""
        group = get_object_or_404(visible_groups_for_user(request.user), id=group_id)
        return Response(GroupSerializer(group).data)

    def patch(self, request, group_id):
        """Update a group's editable presentation fields through lifecycle services."""
        group = get_object_or_404(Group, id=group_id)
        serializer = GroupPatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            group = update_group(request.user, group, **serializer.validated_data)
        except DomainError as error:
            return _domain_error_response(error)
        return Response(GroupSerializer(group).data)

    def delete(self, request, group_id):
        """Delete an archived group."""
        group = get_object_or_404(Group, id=group_id)
        try:
            delete_group(request.user, group)
        except DomainError as error:
            return _domain_error_response(error)
        return Response(status=status.HTTP_204_NO_CONTENT)


class GroupBalancesView(APIView):
    """Return the current balances for a visible group."""

    def get(self, request, group_id):
        """Return stable user balances in cents."""
        group = get_object_or_404(visible_groups_for_user(request.user), id=group_id)
        balances = compute_group_balances(group)
        return Response(
            {
                "balances": [
                    {"user_id": str(user_id), "amount_cents": amount_cents}
                    for user_id, amount_cents in sorted(balances.items(), key=lambda item: str(item[0]))
                ]
            }
        )


class SuggestedTransfersView(APIView):
    """Return a minimal settlement proposal for a visible group."""

    def get(self, request, group_id):
        """Return stable debtor-to-creditor transfers in cents."""
        group = get_object_or_404(visible_groups_for_user(request.user), id=group_id)
        transfers = suggest_transfers(compute_group_balances(group))
        return Response(
            {
                "transfers": [
                    {
                        "from_user_id": str(transfer["from_user_id"]),
                        "to_user_id": str(transfer["to_user_id"]),
                        "amount_cents": transfer["amount_cents"],
                    }
                    for transfer in transfers
                ]
            }
        )


class AddMemberView(APIView):
    """Add an existing user to a group by email."""

    def post(self, request, group_id):
        """Validate member email and delegate add-member rules."""
        group = get_object_or_404(Group, id=group_id)
        serializer = AddMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            membership = add_member(request.user, group, serializer.validated_data["email"])
        except DomainError as error:
            return _domain_error_response(error)
        return Response(MembershipSerializer(membership).data, status=status.HTTP_201_CREATED)


class MemberSearchView(APIView):
    """Return eligible account-picker results to group managers only."""

    def get(self, request, group_id):
        """Search active non-members by a trimmed, case-insensitive email query."""
        group = get_object_or_404(Group, id=group_id)
        if not can_manage_group(request.user, group):
            return error_response("permission_denied", "You do not have permission to manage this group.", status.HTTP_403_FORBIDDEN)

        query = request.query_params.get("email", "").strip()
        if len(query) < 2:
            return Response([])

        candidates = User.objects.filter(is_active=True, email__icontains=query).exclude(
            id__in=Membership.objects.filter(group=group, left_at__isnull=True).values("user_id")
        ).order_by("email")[:3]
        return Response(MemberSearchResultSerializer(candidates, many=True).data)


class LeaveGroupView(APIView):
    """Allow an active member to leave a group."""

    def post(self, request, group_id):
        """Apply leave rules for the current user."""
        group = get_object_or_404(Group, id=group_id)
        try:
            leave_group(request.user, group)
        except DomainError as error:
            return _domain_error_response(error)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RemoveMemberView(APIView):
    """Allow group managers to remove active members."""

    def post(self, request, group_id, user_id):
        """Apply remove-member rules for the target user."""
        group = get_object_or_404(Group, id=group_id)
        user = get_object_or_404(User, id=user_id)
        try:
            remove_member(request.user, group, user)
        except DomainError as error:
            return _domain_error_response(error)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RejoinGroupView(APIView):
    """Allow a user with a left membership to rejoin."""

    def post(self, request, group_id):
        """Clear the current user's left membership."""
        group = get_object_or_404(Group, id=group_id)
        try:
            membership = rejoin_group(request.user, group)
        except DomainError as error:
            return _domain_error_response(error)
        return Response(MembershipSerializer(membership).data)


class ArchiveGroupView(APIView):
    """Archive a group through lifecycle services."""

    def post(self, request, group_id):
        """Archive the selected group."""
        group = get_object_or_404(Group, id=group_id)
        try:
            group = archive_group(request.user, group)
        except DomainError as error:
            return _domain_error_response(error)
        return Response(GroupSerializer(group).data)


class UnarchiveGroupView(APIView):
    """Unarchive a group through lifecycle services."""

    def post(self, request, group_id):
        """Unarchive the selected group."""
        group = get_object_or_404(Group, id=group_id)
        try:
            group = unarchive_group(request.user, group)
        except DomainError as error:
            return _domain_error_response(error)
        return Response(GroupSerializer(group).data)


def _domain_error_response(error):
    """Map domain errors to stable HTTP error responses."""
    status_code = status.HTTP_403_FORBIDDEN if error.code == "permission_denied" else status.HTTP_400_BAD_REQUEST
    return error_response(error.code, error.message, status_code)
