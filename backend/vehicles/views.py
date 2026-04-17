"""
# ═══ VEHICLES VIEWS ═══
# REST API endpoints for vehicle CRUD, obligations, files, and analytics.
#
# ENDPOINTS:
#   /api/vehicles/                        — Vehicle list/create
#   /api/vehicles/<id>/                   — Vehicle detail/update/delete
#   /api/vehicles/summary/                — Compliance dashboard data
#   /api/vehicles/cost-report/            — Annual cost breakdown (?year=)
#   /api/vehicles/expiring/               — Upcoming expirations (?days=30)
#   /api/vehicles/<id>/obligations/       — Obligations for a vehicle
#   /api/vehicles/<id>/presets/           — Create BG preset obligations
#   /api/vehicles/obligations/<id>/       — Obligation detail/update/delete
#   /api/vehicles/obligations/<id>/renew/ — Quick-renew an obligation
#   /api/vehicles/obligations/<id>/files/ — Upload files to obligation
#   /api/vehicles/obligations/files/<id>/ — Delete uploaded file
"""

from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.http import HttpResponse, Http404
from datetime import timedelta

from .models import Vehicle, VehicleObligation, ObligationFile
from .serializers import (
    VehicleSerializer, VehicleListSerializer,
    VehicleObligationSerializer, VehicleObligationListSerializer,
    ObligationFileSerializer,
)
from .services import (
    sync_reminders, renew_obligation, create_bg_presets,
    get_cost_report, get_compliance_summary,
)
from .calendar_export import export_calendar_for_vehicle, export_calendar_for_user


class ObjectPermissionMixin:
    """Mixin to filter querysets by per-object permissions."""

    def filter_by_object_permissions(self, qs, object_type: str):
        """Filter queryset by user's per-object permissions."""
        user = self.request.user
        if user.role == 'admin':
            return qs
        allowed_ids = getattr(user, f'allowed_{object_type}_ids', [])
        if not allowed_ids:
            return qs
        return qs.filter(id__in=allowed_ids)

    def check_object_permission(self, obj, object_type: str):
        """Check if user has access to a specific object."""
        user = self.request.user
        if user.role == 'admin':
            return
        allowed_ids = getattr(user, f'allowed_{object_type}_ids', [])
        if not allowed_ids:
            return
        if obj.id not in allowed_ids:
            raise Http404(f'You do not have access to this {object_type}')


class VehicleViewSet(ObjectPermissionMixin, viewsets.ModelViewSet):
    """
    CRUD for vehicles. Scoped to authenticated user + per-object permissions.
    Filters: ?property=<id>, ?active=true/false
    """
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'list':
            return VehicleListSerializer
        return VehicleSerializer

    def get_queryset(self):
        qs = Vehicle.objects.filter(
            user=self.request.user.get_data_owner()
        ).select_related('linked_property').prefetch_related('obligations')

        # Filter by linked property
        prop_id = self.request.query_params.get('property')
        if prop_id:
            qs = qs.filter(linked_property_id=prop_id)

        # Filter by active status
        active = self.request.query_params.get('active')
        if active == 'true':
            qs = qs.filter(is_active=True)
        elif active == 'false':
            qs = qs.filter(is_active=False)

        # Filter by per-object permissions
        qs = self.filter_by_object_permissions(qs, 'vehicle')
        return qs

    def retrieve(self, request, *args, **kwargs):
        """Check permission before returning object."""
        response = super().retrieve(request, *args, **kwargs)
        obj = self.get_object()
        self.check_object_permission(obj, 'vehicle')
        return response

    def perform_create(self, serializer):
        # Check for duplicate plate number
        plate = serializer.validated_data.get('plate_number', '')
        user = self.request.user.get_data_owner()
        if plate and Vehicle.objects.filter(user=user, plate_number=plate).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'plate_number': 'A vehicle with this plate number already exists.'})
        serializer.save(user=user)

    @action(detail=True, methods=['get'], url_path='export-calendar')
    def export_calendar(self, request, pk=None):
        """
        §API: GET /api/vehicles/<id>/export-calendar/
        Export vehicle's obligations as iCalendar (.ics) file.
        """
        vehicle = self.get_object()
        ics_content = export_calendar_for_vehicle(vehicle)

        response = HttpResponse(ics_content, content_type='text/calendar; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{vehicle.name or vehicle.plate_number}.ics"'
        return response

    @action(detail=False, methods=['get'], url_path='export-calendar-all')
    def export_calendar_all(self, request):
        """
        §API: GET /api/vehicles/export-calendar-all/
        Export all user's vehicles' obligations as iCalendar (.ics) file.
        """
        ics_content = export_calendar_for_user(request.user.get_data_owner())

        response = HttpResponse(ics_content, content_type='text/calendar; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="vehicle-obligations.ics"'
        return response


# ─── VEHICLE OBLIGATIONS ───

class VehicleObligationListCreateView(APIView):
    """
    GET: List obligations for a specific vehicle.
    POST: Create a new obligation for a vehicle.
    Filters: ?type=mtpl&current=true
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, vehicle_id):
        vehicle = get_object_or_404(
            Vehicle, id=vehicle_id, user=request.user.get_data_owner()
        )
        qs = vehicle.obligations.all()

        # Filter by type
        ob_type = request.query_params.get('type')
        if ob_type:
            qs = qs.filter(obligation_type=ob_type)

        # Filter current only
        current = request.query_params.get('current')
        if current == 'true':
            qs = qs.filter(is_current=True)

        serializer = VehicleObligationListSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request, vehicle_id):
        vehicle = get_object_or_404(
            Vehicle, id=vehicle_id, user=request.user.get_data_owner()
        )
        serializer = VehicleObligationSerializer(data={**request.data, 'vehicle': vehicle.id})
        serializer.is_valid(raise_exception=True)
        obligation = serializer.save()

        # Auto-set default reminders if not provided
        if not obligation.reminder_days:
            obligation.reminder_days = obligation.get_default_reminder_days()
            obligation.save(update_fields=['reminder_days'])

        sync_reminders(obligation)
        return Response(VehicleObligationSerializer(obligation).data, status=status.HTTP_201_CREATED)


class VehicleObligationDetailView(APIView):
    """GET/PUT/DELETE for a single obligation."""
    permission_classes = [IsAuthenticated]

    def _get_obligation(self, request, obligation_id):
        return get_object_or_404(
            VehicleObligation,
            id=obligation_id,
            vehicle__user=request.user.get_data_owner()
        )

    def get(self, request, obligation_id):
        ob = self._get_obligation(request, obligation_id)
        return Response(VehicleObligationSerializer(ob).data)

    def put(self, request, obligation_id):
        ob = self._get_obligation(request, obligation_id)
        serializer = VehicleObligationSerializer(ob, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        obligation = serializer.save()
        sync_reminders(obligation)
        return Response(VehicleObligationSerializer(obligation).data)

    def delete(self, request, obligation_id):
        ob = self._get_obligation(request, obligation_id)
        ob.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ObligationRenewView(APIView):
    """
    POST: Quick-renew an obligation.
    Body: { start_date, end_date, cost?, provider?, policy_number? }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, obligation_id):
        ob = get_object_or_404(
            VehicleObligation,
            id=obligation_id,
            vehicle__user=request.user.get_data_owner()
        )
        new_start = request.data.get('start_date')
        new_end = request.data.get('end_date')
        if not new_start or not new_end:
            return Response(
                {'error': 'start_date and end_date are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        new_ob = renew_obligation(
            obligation=ob,
            new_start_date=new_start,
            new_end_date=new_end,
            cost=request.data.get('cost'),
            provider=request.data.get('provider'),
            policy_number=request.data.get('policy_number'),
        )
        return Response(VehicleObligationSerializer(new_ob).data, status=status.HTTP_201_CREATED)


# ─── FILE UPLOADS ───

class ObligationFileUploadView(APIView):
    """
    GET: List files for an obligation.
    POST: Upload file(s) to an obligation (multipart).
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, obligation_id):
        ob = get_object_or_404(
            VehicleObligation,
            id=obligation_id,
            vehicle__user=request.user.get_data_owner()
        )
        serializer = ObligationFileSerializer(ob.files.all(), many=True)
        return Response(serializer.data)

    def post(self, request, obligation_id):
        ob = get_object_or_404(
            VehicleObligation,
            id=obligation_id,
            vehicle__user=request.user.get_data_owner()
        )
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)

        doc = ObligationFile.objects.create(
            obligation=ob,
            file=file_obj,
            label=request.data.get('label', file_obj.name),
        )
        return Response(ObligationFileSerializer(doc).data, status=status.HTTP_201_CREATED)


class ObligationFileDeleteView(APIView):
    """DELETE a single file."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, file_id):
        f = get_object_or_404(
            ObligationFile,
            id=file_id,
            obligation__vehicle__user=request.user.get_data_owner()
        )
        f.file.delete(save=False)
        f.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── PRESETS ───

class VehiclePresetsView(APIView):
    """POST: Create Bulgarian preset obligations for a vehicle."""
    permission_classes = [IsAuthenticated]

    def post(self, request, vehicle_id):
        vehicle = get_object_or_404(
            Vehicle, id=vehicle_id, user=request.user.get_data_owner()
        )
        created = create_bg_presets(vehicle)
        return Response({
            'created': len(created),
            'obligations': VehicleObligationListSerializer(created, many=True).data,
        }, status=status.HTTP_201_CREATED)


# ─── ANALYTICS ───

class VehicleSummaryView(APIView):
    """GET: Compliance dashboard data — counts + upcoming expirations."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = get_compliance_summary(request.user.get_data_owner())
        return Response(data)


class VehicleCostReportView(APIView):
    """GET: Annual cost breakdown. ?year=2026 (defaults to current year)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        year = request.query_params.get('year')
        if year:
            year = int(year)
        data = get_cost_report(request.user.get_data_owner(), year)
        return Response(data)


class VehicleExpiringView(APIView):
    """GET: All obligations expiring within N days. ?days=30"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        days = int(request.query_params.get('days', 30))
        today = timezone.now().date()
        cutoff = today + timedelta(days=days)

        obligations = (
            VehicleObligation.objects
            .filter(
                vehicle__user=request.user.get_data_owner(),
                vehicle__is_active=True,
                is_current=True,
                end_date__gte=today,
                end_date__lte=cutoff,
            )
            .select_related('vehicle')
            .order_by('end_date')
        )

        serializer = VehicleObligationSerializer(obligations, many=True)
        return Response(serializer.data)
