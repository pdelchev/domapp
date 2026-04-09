from rest_framework import viewsets, status as http_status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .gout_models import GoutAttack, AttackTrigger, UricAcidReading, MedicalProcedure
from .gout_serializers import (
    GoutAttackSerializer, GoutAttackCreateSerializer,
    AttackTriggerSerializer, UricAcidReadingSerializer,
    MedicalProcedureSerializer,
)
from .gout_services import get_gout_dashboard, get_gout_statistics


class GoutAttackViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return GoutAttackCreateSerializer
        return GoutAttackSerializer

    def get_queryset(self):
        qs = GoutAttack.objects.filter(user=self.request.user)
        profile = self.request.query_params.get('profile')
        if profile:
            qs = qs.filter(profile_id=profile)
        joint = self.request.query_params.get('joint')
        if joint:
            qs = qs.filter(joint=joint)
        return qs.prefetch_related('triggers')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def create(self, request, *args, **kwargs):
        """Override to return the read serializer after creation."""
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        self.perform_create(ser)
        read_ser = GoutAttackSerializer(ser.instance)
        return Response(read_ser.data, status=http_status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        ser = self.get_serializer(instance, data=request.data, partial=partial)
        ser.is_valid(raise_exception=True)
        self.perform_update(ser)
        read_ser = GoutAttackSerializer(ser.instance)
        return Response(read_ser.data)


class AttackTriggerViewSet(viewsets.ModelViewSet):
    serializer_class = AttackTriggerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return AttackTrigger.objects.filter(
            attack__user=self.request.user
        )


class UricAcidViewSet(viewsets.ModelViewSet):
    serializer_class = UricAcidReadingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = UricAcidReading.objects.filter(user=self.request.user)
        profile = self.request.query_params.get('profile')
        if profile:
            qs = qs.filter(profile_id=profile)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class MedicalProcedureViewSet(viewsets.ModelViewSet):
    serializer_class = MedicalProcedureSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = MedicalProcedure.objects.filter(user=self.request.user)
        profile = self.request.query_params.get('profile')
        if profile:
            qs = qs.filter(profile_id=profile)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class GoutDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile_id = request.query_params.get('profile')
        data = get_gout_dashboard(request.user, profile_id)
        return Response(data)


class GoutStatisticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile_id = request.query_params.get('profile')
        days = int(request.query_params.get('days', 365))
        data = get_gout_statistics(request.user, profile_id, days)
        return Response(data)
