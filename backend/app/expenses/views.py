"""API views for expense, settlement, and sync endpoints."""

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from app.core.errors import DomainError
from app.core.responses import error_response
from app.expenses.models import Expense, Settlement
from app.expenses.serializers import (
    ExpenseSerializer,
    ExpenseUpsertSerializer,
    SettlementSerializer,
    SettlementUpsertSerializer,
    SyncPullQuerySerializer,
    SyncPushSerializer,
)
from app.expenses.services import (
    pull_sync,
    push_sync,
    tombstone_expense,
    tombstone_settlement,
    upsert_expense,
    upsert_settlement,
)
from app.groups.models import Group
from app.groups.selectors import visible_groups_for_user


class ExpenseUpsertView(APIView):
    """Retrieve, upsert, and tombstone one expense."""

    def get(self, request, group_id, expense_id):
        """Return one visible expense."""
        group = get_object_or_404(visible_groups_for_user(request.user), id=group_id)
        expense = get_object_or_404(Expense.objects.prefetch_related("shares"), id=expense_id, group=group)
        return Response(ExpenseSerializer(expense).data)

    def put(self, request, group_id, expense_id):
        """Apply a client-ID expense upsert."""
        group = get_object_or_404(Group, id=group_id)
        serializer = ExpenseUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        if payload["id"] != expense_id:
            return error_response("id_mismatch", "Expense id must match the URL.", status.HTTP_400_BAD_REQUEST)
        try:
            expense, sync_status = upsert_expense(request.user, group, payload)
        except DomainError as error:
            return _domain_error_response(error)
        response_status = status.HTTP_409_CONFLICT if sync_status == "conflict" else status.HTTP_200_OK
        if sync_status == "conflict":
            return Response({"sync_status": sync_status}, status=response_status)
        return Response({"sync_status": sync_status, "expense": ExpenseSerializer(expense).data}, status=response_status)

    def delete(self, request, group_id, expense_id):
        """Create an expense tombstone."""
        group = get_object_or_404(Group, id=group_id)
        get_object_or_404(Expense, id=expense_id, group=group)
        try:
            tombstone_expense(request.user, group, expense_id)
        except DomainError as error:
            return _domain_error_response(error)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SettlementUpsertView(APIView):
    """Retrieve, upsert, and tombstone one settlement."""

    def get(self, request, group_id, settlement_id):
        """Return one visible settlement."""
        group = get_object_or_404(visible_groups_for_user(request.user), id=group_id)
        settlement = get_object_or_404(Settlement, id=settlement_id, group=group)
        return Response(SettlementSerializer(settlement).data)

    def put(self, request, group_id, settlement_id):
        """Apply a client-ID settlement upsert."""
        group = get_object_or_404(Group, id=group_id)
        serializer = SettlementUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        if payload["id"] != settlement_id:
            return error_response("id_mismatch", "Settlement id must match the URL.", status.HTTP_400_BAD_REQUEST)
        try:
            settlement, sync_status = upsert_settlement(request.user, group, payload)
        except DomainError as error:
            return _domain_error_response(error)
        response_status = status.HTTP_409_CONFLICT if sync_status == "conflict" else status.HTTP_200_OK
        if sync_status == "conflict":
            return Response({"sync_status": sync_status}, status=response_status)
        return Response({"sync_status": sync_status, "settlement": SettlementSerializer(settlement).data}, status=response_status)

    def delete(self, request, group_id, settlement_id):
        """Create a settlement tombstone."""
        group = get_object_or_404(Group, id=group_id)
        get_object_or_404(Settlement, id=settlement_id, group=group)
        try:
            tombstone_settlement(request.user, group, settlement_id)
        except DomainError as error:
            return _domain_error_response(error)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SyncPushView(APIView):
    """Accept batched expense and settlement upserts."""

    def post(self, request, group_id):
        """Apply independent sync rows and return per-row statuses."""
        group = get_object_or_404(Group, id=group_id)
        serializer = SyncPushSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = push_sync(request.user, group, serializer.validated_data["expenses"], serializer.validated_data["settlements"])
        return Response(_serialize_push_result(result))


class SyncPullView(APIView):
    """Return expense and settlement rows updated after a cursor."""

    def get(self, request, group_id):
        """Return incremental sync rows."""
        group = get_object_or_404(visible_groups_for_user(request.user), id=group_id)
        serializer = SyncPullQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        rows = pull_sync(group, serializer.validated_data["since"])
        return Response(
            {
                "expenses": ExpenseSerializer(rows["expenses"], many=True).data,
                "settlements": SettlementSerializer(rows["settlements"], many=True).data,
            }
        )


def _serialize_push_result(result):
    """Serialize domain sync results for the batch push response."""
    return {
        "expenses": [_serialize_push_row(row, ExpenseSerializer) for row in result["expenses"]],
        "settlements": [_serialize_push_row(row, SettlementSerializer) for row in result["settlements"]],
    }


def _serialize_push_row(row, serializer):
    """Serialize one batch row without exposing existing data on conflicts."""
    if "instance" not in row:
        return row
    instance = row.pop("instance")
    return {**row, "row": serializer(instance).data}


def _domain_error_response(error):
    """Map money-domain errors to stable HTTP error responses."""
    if error.code == "permission_denied":
        status_code = status.HTTP_403_FORBIDDEN
    elif error.code == "conflict":
        status_code = status.HTTP_409_CONFLICT
    else:
        status_code = status.HTTP_400_BAD_REQUEST
    return error_response(error.code, error.message, status_code)
