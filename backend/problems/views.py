from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone
from django.db.models import Count, Q
from .models import Problem
from .serializers import ProblemSerializer


class ProblemViewSet(viewsets.ModelViewSet):
    """Full CRUD for problems. Supports filtering by property, status, priority, category."""
    serializer_class = ProblemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Problem.objects.filter(user=self.request.user.get_data_owner()).select_related('property')

        # Filter by property
        prop_id = self.request.query_params.get('property')
        if prop_id:
            qs = qs.filter(property_id=prop_id)

        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        # Filter by priority
        priority = self.request.query_params.get('priority')
        if priority:
            qs = qs.filter(priority=priority)

        # Filter by category
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)

        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())

    def perform_update(self, serializer):
        # Auto-set resolved_at when status changes to resolved/closed
        instance = serializer.instance
        new_status = serializer.validated_data.get('status', instance.status)
        if new_status in ('resolved', 'closed') and instance.status not in ('resolved', 'closed'):
            serializer.save(resolved_at=timezone.now())
        elif new_status in ('open', 'in_progress') and instance.status in ('resolved', 'closed'):
            serializer.save(resolved_at=None)
        else:
            serializer.save()


class ProblemSummaryView(APIView):
    """Counts by status and priority for dashboard display."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Problem.objects.filter(user=request.user.get_data_owner())

        # Active = not resolved/closed
        active = qs.filter(status__in=['open', 'in_progress'])

        by_status = dict(qs.values_list('status').annotate(count=Count('id')).values_list('status', 'count'))
        by_priority = dict(active.values_list('priority').annotate(count=Count('id')).values_list('priority', 'count'))

        return Response({
            'total_active': active.count(),
            'by_status': {
                'open': by_status.get('open', 0),
                'in_progress': by_status.get('in_progress', 0),
                'resolved': by_status.get('resolved', 0),
                'closed': by_status.get('closed', 0),
            },
            'by_priority': {
                'emergency': by_priority.get('emergency', 0),
                'high': by_priority.get('high', 0),
                'medium': by_priority.get('medium', 0),
                'low': by_priority.get('low', 0),
            },
        })
