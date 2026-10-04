"""API views for public backend configuration."""

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from app.core.config import PUBLIC_CONFIG_VARS, settings


@method_decorator(ensure_csrf_cookie, name="dispatch")
class PublicConfigView(APIView):
    """Return safe feature flags for unauthenticated clients."""

    permission_classes = [AllowAny]

    def get(self, request):
        """Return values explicitly whitelisted for clients."""
        return Response({name: getattr(settings, name) for name in PUBLIC_CONFIG_VARS})
