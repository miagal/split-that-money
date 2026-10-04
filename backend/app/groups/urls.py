"""URL routes for group and membership APIs."""

from django.urls import include, path

from app.groups.views import (
    AddMemberView,
    ArchiveGroupView,
    GroupBalancesView,
    GroupDetailView,
    GroupListCreateView,
    LeaveGroupView,
    MemberSearchView,
    RejoinGroupView,
    RemoveMemberView,
    SuggestedTransfersView,
    UnarchiveGroupView,
)

urlpatterns = [
    path("", GroupListCreateView.as_view()),
    path("<uuid:group_id>/", GroupDetailView.as_view()),
    path("<uuid:group_id>/balances/", GroupBalancesView.as_view()),
    path("<uuid:group_id>/suggested-transfers/", SuggestedTransfersView.as_view()),
    path("<uuid:group_id>/members/search/", MemberSearchView.as_view()),
    path("<uuid:group_id>/members/", AddMemberView.as_view()),
    path("<uuid:group_id>/leave/", LeaveGroupView.as_view()),
    path("<uuid:group_id>/members/<uuid:user_id>/remove/", RemoveMemberView.as_view()),
    path("<uuid:group_id>/rejoin/", RejoinGroupView.as_view()),
    path("<uuid:group_id>/archive/", ArchiveGroupView.as_view()),
    path("<uuid:group_id>/unarchive/", UnarchiveGroupView.as_view()),
    path("<uuid:group_id>/expenses/", include("app.expenses.expense_urls")),
    path("<uuid:group_id>/settlements/", include("app.expenses.settlement_urls")),
    path("<uuid:group_id>/sync/", include("app.expenses.sync_urls")),
]
