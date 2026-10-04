"""Root URL configuration for the Split That Money API."""

from django.urls import include, path

urlpatterns = [
    path("api/config/", include("app.core.urls")),
    path("api/auth/", include("app.accounts.urls")),
    path("api/admin/users/", include("app.accounts.admin_urls")),
    path("api/groups/", include("app.groups.urls")),
]
