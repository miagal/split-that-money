"""URL routes for public configuration endpoints."""

from django.urls import path

from app.core.views import PublicConfigView

urlpatterns = [
    path("public/", PublicConfigView.as_view(), name="public-config"),
]
