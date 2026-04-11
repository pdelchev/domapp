# backend/health/protocol_views.py

"""
PROTOCOL API VIEWS
==================
REST endpoints for:
- Protocols (CRUD + progress tracking)
- Daily logs (CRUD with auto-adherence calculation)
- Recommendations (read-only list + accept/implement)
- Dynamic field generation (what to log today)
- Genetic profile management

All endpoints require IsAuthenticated
User can only access their own data
"""

from rest_framework import viewsets, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils.timezone import now
from django.db.models import Avg
from datetime import timedelta

from .models import (
    HealthProtocol, DailyProtocolLog, ProtocolRecommendation, GeneticProfile
)
from .protocol_serializers import (
    ProtocolListSerializer, ProtocolDetailSerializer,
    DailyProtocolLogSerializer, RecommendationListSerializer,
    RecommendationDetailSerializer, GeneticProfileSerializer
)


class ProtocolViewSet(viewsets.ModelViewSet):
    """
    Manage health protocols

    List: GET /api/health/protocol/protocols/?status=active
    Create: POST /api/health/protocol/protocols/
    Detail: GET /api/health/protocol/protocols/<id>/
    Update: PUT /api/health/protocol/protocols/<id>/
    Partial: PATCH /api/health/protocol/protocols/<id>/
    Delete: DELETE /api/health/protocol/protocols/<id>/

    Actions:
    - progress: GET /api/health/protocol/protocols/<id>/progress/
    - pause: POST /api/health/protocol/protocols/<id>/pause/
    - complete: POST /api/health/protocol/protocols/<id>/complete/
    """
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'retrieve' or self.action == 'create':
            return ProtocolDetailSerializer
        return ProtocolListSerializer

    def get_queryset(self):
        """
        フィルタ: ユーザーのプロトコルのみ
        """
        return HealthProtocol.objects.filter(user=self.request.user).order_by('-start_date')

    def perform_create(self, serializer):
        """
        プロトコル作成時、ユーザーを自動設定
        """
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['get'])
    def progress(self, request, pk=None):
        """
        Get protocol progress metrics

        Returns:
        - adherence_trend: [week1%, week2%, week3%, week4%]
        - current_adherence: today's average
        - expected_outcomes: what we're aiming for
        """
        protocol = self.get_object()

        past_28_days = DailyProtocolLog.objects.filter(
            protocol=protocol,
            date__gte=now().date() - timedelta(days=28)
        ).order_by('date')

        adherence_by_week = []
        for week in range(4):
            week_logs = [
                log for log in past_28_days
                if (now().date() - log.date).days // 7 == week
            ]
            if week_logs:
                avg = sum(log.protocol_adherence_pct for log in week_logs) / len(week_logs)
                adherence_by_week.append(int(avg))

        return Response({
            'protocol_id': protocol.id,
            'protocol_name': protocol.name,
            'adherence_trend': adherence_by_week,
            'current_adherence': protocol.adherence_percentage,
            'expected_outcomes': protocol.expected_outcomes,
            'baseline_biomarkers': protocol.baseline_biomarkers,
        })

    @action(detail=True, methods=['post'])
    def pause(self, request, pk=None):
        """
        一時停止状態に変更
        """
        protocol = self.get_object()
        protocol.status = 'paused'
        protocol.save()
        return Response(ProtocolListSerializer(protocol).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """
        完了状態に変更
        """
        protocol = self.get_object()
        protocol.status = 'completed'
        protocol.save()
        return Response(ProtocolListSerializer(protocol).data)


class DailyProtocolLogViewSet(viewsets.ModelViewSet):
    """
    Daily protocol log management

    List: GET /api/health/protocol/daily-log/?date_from=2024-04-01&date_to=2024-04-30
    Create: POST /api/health/protocol/daily-log/
    Detail: GET /api/health/protocol/daily-log/<id>/
    Update: PATCH /api/health/protocol/daily-log/<id>/
    """
    permission_classes = [IsAuthenticated]
    serializer_class = DailyProtocolLogSerializer

    def get_queryset(self):
        """
        フィルタ: ユーザーの日誌のみ + date range 対応
        """
        qs = DailyProtocolLog.objects.filter(user=self.request.user).order_by('-date')

        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')

        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)

        return qs

    def perform_create(self, serializer):
        """
        日誌作成時、以下を自動実行:
        1. ユーザーを設定
        2. adherence_pct を計算
        3. is_complete フラグを設定
        """
        log = serializer.save(user=self.request.user)

        # プロトコル必須フィールドに基づいてadherence計算
        if log.protocol:
            required_fields = log.protocol.daily_log_fields
            if required_fields:
                completed = 0
                for field in required_fields:
                    value = getattr(log, field, None)
                    if value is not None and value != '' and value != False:
                        completed += 1

                log.protocol_adherence_pct = (completed / len(required_fields)) * 100
                log.is_complete = log.protocol_adherence_pct >= 100
                log.save()


class RecommendationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only recommendations

    List: GET /api/health/protocol/recommendations/?priority=high&category=supplement_adjust
    Detail: GET /api/health/protocol/recommendations/<id>/

    Actions:
    - accept: POST /api/health/protocol/recommendations/<id>/accept/
    - implement: POST /api/health/protocol/recommendations/<id>/implement/
    """
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return RecommendationDetailSerializer
        return RecommendationListSerializer

    def get_queryset(self):
        """
        フィルタ: ユーザーの推奨事項のみ + category, priority 対応
        """
        qs = ProtocolRecommendation.objects.filter(user=self.request.user).order_by('-priority', '-created_at')

        category = self.request.query_params.get('category')
        priority = self.request.query_params.get('priority')

        if category:
            qs = qs.filter(category=category)
        if priority:
            qs = qs.filter(priority=priority)

        return qs

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        """
        ユーザーが推奨を受け入れる
        """
        rec = self.get_object()
        rec.is_accepted = True
        rec.save()
        return Response(RecommendationDetailSerializer(rec).data)

    @action(detail=True, methods=['post'])
    def implement(self, request, pk=None):
        """
        ユーザーが推奨を実施開始
        """
        rec = self.get_object()
        rec.is_implemented = True
        rec.implementation_date = now().date()
        rec.save()
        return Response(RecommendationDetailSerializer(rec).data)


class DailyLogFieldsView(generics.GenericAPIView):
    """
    Dynamic form generation

    GET /api/health/protocol/daily-log-fields/

    返却:
    {
        'fields': ['mood', 'energy_level', 'supplements_taken'],
        'count': 3,
        'estimated_time_min': 5
    }
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        本日ログすべきフィールドを返す

        ロジック:
        1. ユーザーのアクティブなプロトコルを取得
        2. 各プロトコルの daily_log_fields を統合
        3. 共通フィールド (mood, energy) を常に含める
        """
        active_protocols = HealthProtocol.objects.filter(
            user=request.user,
            status='active'
        )

        fields = {'mood', 'energy_level', 'stress_level'}  # Always

        for protocol in active_protocols:
            fields.update(protocol.daily_log_fields)

        return Response({
            'fields': sorted(list(fields)),
            'count': len(fields),
            'estimated_time_min': max(3, len(fields) // 2),
        })


class GeneticProfileView(generics.GenericAPIView):
    """
    Genetic profile management

    GET /api/health/protocol/genetic-profile/ - Retrieve or create
    PATCH /api/health/protocol/genetic-profile/ - Update
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        遺伝学プロフィール取得
        存在しない場合は自動作成
        """
        profile, created = GeneticProfile.objects.get_or_create(user=request.user)
        return Response(GeneticProfileSerializer(profile).data)

    def patch(self, request):
        """
        遺伝学プロフィール更新
        """
        profile, created = GeneticProfile.objects.get_or_create(user=request.user)
        serializer = GeneticProfileSerializer(profile, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
