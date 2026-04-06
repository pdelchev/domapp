from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone

from .ritual_models import RitualItem, RitualLog, BodyMeasurement
from .ritual_serializers import RitualItemSerializer, RitualLogSerializer, BodyMeasurementSerializer
from .ritual_services import get_ritual_dashboard, toggle_ritual_item, get_adherence_stats, seed_protocol


class RitualItemViewSet(viewsets.ModelViewSet):
    serializer_class = RitualItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = RitualItem.objects.filter(user=self.request.user.get_data_owner())
        profile = self.request.query_params.get('profile')
        if profile:
            qs = qs.filter(profile_id=profile)
        active = self.request.query_params.get('active')
        if active == 'true':
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())


class RitualDashboardView(APIView):
    """GET: Today's ritual with completion status."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile_id = request.query_params.get('profile')
        date_str = request.query_params.get('date')
        date = None
        if date_str:
            from datetime import date as dt_date
            date = dt_date.fromisoformat(date_str)
        data = get_ritual_dashboard(request.user.get_data_owner(), profile_id, date)
        return Response(data)


class RitualToggleView(APIView):
    """POST: Toggle a ritual item's completion for today."""
    permission_classes = [IsAuthenticated]

    def post(self, request, item_id):
        date_str = request.data.get('date')
        date = None
        if date_str:
            from datetime import date as dt_date
            date = dt_date.fromisoformat(date_str)
        log = toggle_ritual_item(item_id, request.user.get_data_owner(), date)
        if not log:
            return Response({'detail': 'Not found'}, status=404)
        return Response(RitualLogSerializer(log).data)


class RitualSeedView(APIView):
    """POST: Seed the default protocol for the user."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile_id = request.data.get('profile')
        profile = None
        if profile_id:
            from .models import HealthProfile
            profile = HealthProfile.objects.filter(id=profile_id, user=request.user.get_data_owner()).first()
        created = seed_protocol(request.user.get_data_owner(), profile)
        return Response({
            'created': len(created),
            'items': RitualItemSerializer(created, many=True).data,
        })


class RitualUploadRxView(APIView):
    """POST: Upload prescription image for a ritual item."""
    permission_classes = [IsAuthenticated]

    def post(self, request, item_id):
        item = RitualItem.objects.filter(id=item_id, user=request.user.get_data_owner()).first()
        if not item:
            return Response({'detail': 'Not found'}, status=404)
        image = request.FILES.get('image')
        if not image:
            return Response({'detail': 'No image provided'}, status=400)
        item.prescription_image = image
        item.save(update_fields=['prescription_image'])
        return Response({
            'id': item.id,
            'prescription_image': item.prescription_image.url if item.prescription_image else None,
        })


class RitualAdherenceView(APIView):
    """GET: Adherence stats over a period."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        days = int(request.query_params.get('days', 30))
        data = get_adherence_stats(request.user.get_data_owner(), days)
        return Response(data)


class BodyMeasurementViewSet(viewsets.ModelViewSet):
    serializer_class = BodyMeasurementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = BodyMeasurement.objects.filter(user=self.request.user.get_data_owner())
        profile = self.request.query_params.get('profile')
        if profile:
            qs = qs.filter(profile_id=profile)
        site = self.request.query_params.get('site')
        if site:
            qs = qs.filter(site=site)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())
