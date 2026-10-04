"""URL routes for expense and settlement sync APIs."""

from django.urls import path

from app.expenses.views import SyncPullView, SyncPushView

urlpatterns = [
    path("push/", SyncPushView.as_view()),
    path("pull/", SyncPullView.as_view()),
]
