"""URL routes for settlement APIs."""

from django.urls import path

from app.expenses.views import SettlementUpsertView

urlpatterns = [
    path("<uuid:settlement_id>/", SettlementUpsertView.as_view()),
]
