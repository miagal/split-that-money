"""Admin user-management URL routes."""

from django.urls import path

from app.accounts.views import AdminUserDetailView, AdminUserListCreateView, DeactivateUserView, ReactivateUserView, ResetPasswordView

urlpatterns = [
    path("", AdminUserListCreateView.as_view(), name="admin-user-list-create"),
    path("<uuid:user_id>/", AdminUserDetailView.as_view(), name="admin-user-detail"),
    path("<uuid:user_id>/reset-password/", ResetPasswordView.as_view(), name="admin-user-reset-password"),
    path("<uuid:user_id>/deactivate/", DeactivateUserView.as_view(), name="admin-user-deactivate"),
    path("<uuid:user_id>/reactivate/", ReactivateUserView.as_view(), name="admin-user-reactivate"),
]
