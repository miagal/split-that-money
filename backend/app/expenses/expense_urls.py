"""URL routes for expense APIs."""

from django.urls import path

from app.expenses.views import ExpenseUpsertView

urlpatterns = [
    path("<uuid:expense_id>/", ExpenseUpsertView.as_view()),
]
