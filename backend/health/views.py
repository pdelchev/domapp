# ── health/views.py ───────────────────────────────────────────────────
# REST API views for health tracker.
#
# §NAV: models → serializers → [views] → urls → parsers → services → recommendations
# §AUTH: All views require JWT auth. Data scoped by request.user.
# §PERF: select_related/prefetch_related on all querysets.

import os
import tempfile

from rest_framework import viewsets, mixins, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    BiomarkerCategory, Biomarker, HealthProfile,
    BloodReport, BloodResult, HealthRecommendation,
)
from .serializers import (
    BiomarkerCategorySerializer, BiomarkerSerializer,
    HealthProfileSerializer,
    BloodReportListSerializer, BloodReportDetailSerializer, BloodReportCreateSerializer,
    BloodResultSerializer, BloodResultWriteSerializer,
    HealthRecommendationSerializer,
)
from .services import (
    process_parsed_results, get_biomarker_history,
    compare_reports, classify_result,
)
from .parsers import parse_pdf


# ── Biomarker reference endpoints (read-only, no auth needed for ref data) ──

class BiomarkerViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """§REF: List/retrieve canonical biomarker definitions. Read-only."""
    serializer_class = BiomarkerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Biomarker.objects.select_related('category').all()
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category__slug=category)
        return qs


class BiomarkerCategoryViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = BiomarkerCategorySerializer
    permission_classes = [IsAuthenticated]
    queryset = BiomarkerCategory.objects.all()


# ── Health profile CRUD ──────────────────────────────────────────────

class HealthProfileViewSet(viewsets.ModelViewSet):
    """§PROFILE: Manage health profiles (self + family members)."""
    serializer_class = HealthProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            HealthProfile.objects
            .filter(user=self.request.user)
            .prefetch_related('reports')
        )

    def perform_create(self, serializer):
        # §AUTO: First profile auto-marked as primary
        is_first = not HealthProfile.objects.filter(user=self.request.user).exists()
        serializer.save(user=self.request.user, is_primary=is_first)


# ── Blood report CRUD + upload ───────────────────────────────────────

class BloodReportViewSet(viewsets.ModelViewSet):
    """
    §REPORT: List/create/retrieve/update/delete blood reports.
    POST with file → auto-parse PDF → create results.
    POST without file → manual entry (results added separately).
    """
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ('create',):
            return BloodReportCreateSerializer
        if self.action in ('list',):
            return BloodReportListSerializer
        return BloodReportDetailSerializer

    def get_queryset(self):
        qs = (
            BloodReport.objects
            .filter(user=self.request.user)
            .select_related('profile')
            .prefetch_related('results__biomarker__category', 'recommendations')
        )
        # §FILTER: By profile
        profile_id = self.request.query_params.get('profile')
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        return qs

    def perform_create(self, serializer):
        report = serializer.save(user=self.request.user)

        # §PARSE: If PDF uploaded, auto-parse
        if report.file:
            self._parse_and_process(report)

    @staticmethod
    def _parse_and_process(report):
        """§PIPELINE: Parse PDF → match biomarkers → classify → score → recommend."""
        file_path = None
        is_temp = False
        try:
            # §CLOUD: Always write uploaded file to temp — works on local AND cloud storage.
            # Cloud backends (S3/Railway) don't support .path, local does but temp is safe everywhere.
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
                report.file.seek(0)
                for chunk in report.file.chunks():
                    tmp.write(chunk)
                file_path = tmp.name
                is_temp = True

            # Parse
            parsed = parse_pdf(file_path)

            # Save raw parse data for debugging
            report.parsed_raw = {
                'lab_type': parsed['lab_type'],
                'result_count': len(parsed['results']),
                'warnings': parsed.get('warnings', []),
                'preview': parsed.get('raw_text_preview', '')[:300],
            }
            if parsed['lab_type'] != 'other':
                report.lab_type = parsed['lab_type']

            # Save warnings from parser
            report.parse_warnings = parsed.get('warnings', [])
            report.save(update_fields=['parsed_raw', 'lab_type', 'parse_warnings'])

            # Process results
            if parsed['results']:
                sex = report.profile.sex if report.profile else 'male'
                process_parsed_results(report, parsed['results'], sex)
            else:
                report.parse_warnings = parsed.get('warnings', []) or ['No results extracted from PDF']
                report.save(update_fields=['parse_warnings'])

        except Exception as e:
            import traceback
            report.parse_warnings = [f'PDF parsing failed: {str(e)}', traceback.format_exc()[-500:]]
            report.save(update_fields=['parse_warnings'])
        finally:
            if is_temp and file_path and os.path.exists(file_path):
                os.unlink(file_path)


# ── Bulk upload ──────────────────────────────────────────────────────

class BulkUploadView(APIView):
    """
    §BULK: Upload multiple PDFs at once.
    POST with multipart form: files[], profile_id, lab_type (optional).
    Returns list of created report IDs with parse status.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        files = request.FILES.getlist('files')
        profile_id = request.data.get('profile')
        lab_type = request.data.get('lab_type', 'other')
        test_date = request.data.get('test_date')

        if not files:
            return Response({'error': 'No files provided'}, status=400)
        if not profile_id:
            return Response({'error': 'Profile is required'}, status=400)

        # Validate profile ownership
        try:
            profile = HealthProfile.objects.get(id=profile_id, user=request.user)
        except HealthProfile.DoesNotExist:
            return Response({'error': 'Profile not found'}, status=404)

        results = []
        for f in files:
            from datetime import date as date_type
            report = BloodReport.objects.create(
                user=request.user,
                profile=profile,
                test_date=test_date or date_type.today().isoformat(),
                lab_type=lab_type,
                file=f,
                file_name=f.name,
            )

            # Parse each file
            view = BloodReportViewSet()
            view._parse_and_process(report)

            # Refresh from DB
            report.refresh_from_db()
            results.append({
                'id': report.id,
                'file_name': report.file_name,
                'result_count': report.results.count(),
                'overall_score': report.overall_score,
                'parse_warnings': report.parse_warnings,
                'status': 'parsed' if report.results.exists() else 'no_results',
            })

        return Response({'reports': results}, status=201)


# ── Manual result entry ──────────────────────────────────────────────

class ManualResultsView(APIView):
    """
    §MANUAL: Add/update results manually for a report.
    POST: [{biomarker: id, value: float, unit: str}, ...]
    Classifies each result and recomputes report scores.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, report_id):
        try:
            report = BloodReport.objects.get(id=report_id, user=request.user)
        except BloodReport.DoesNotExist:
            return Response({'error': 'Report not found'}, status=404)

        entries = request.data.get('results', [])
        if not entries:
            return Response({'error': 'No results provided'}, status=400)

        sex = report.profile.sex if report.profile else 'male'
        created = []

        for entry in entries:
            biomarker_id = entry.get('biomarker')
            value = entry.get('value')
            unit = entry.get('unit')

            if not all([biomarker_id, value is not None]):
                continue

            try:
                biomarker = Biomarker.objects.get(id=biomarker_id)
            except Biomarker.DoesNotExist:
                continue

            # Use canonical unit if not specified
            if not unit:
                unit = biomarker.unit

            # Classify
            flag, deviation = classify_result(float(value), biomarker, sex)

            result, _ = BloodResult.objects.update_or_create(
                report=report,
                biomarker=biomarker,
                defaults={
                    'value': round(float(value), 2),
                    'unit': unit,
                    'flag': flag,
                    'deviation_pct': deviation,
                }
            )
            created.append(result)

        # Recompute scores
        from .services import compute_report_scores
        from .recommendations import generate_recommendations
        scores = compute_report_scores(report)
        report.overall_score = scores['overall']
        report.system_scores = scores['systems']
        report.save(update_fields=['overall_score', 'system_scores'])
        generate_recommendations(report)

        serializer = BloodResultSerializer(created, many=True)
        return Response({'results': serializer.data}, status=201)

    def put(self, request, report_id):
        """§ALIAS: PUT also accepted for updating results."""
        return self.post(request, report_id)


# ── Biomarker history (trend data) ───────────────────────────────────

class BiomarkerHistoryView(APIView):
    """
    §TREND: Get historical values for a biomarker across all reports for a profile.
    GET /api/health/biomarker-history/<biomarker_id>/?profile=<id>
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, biomarker_id):
        profile_id = request.query_params.get('profile')
        if not profile_id:
            return Response({'error': 'profile parameter required'}, status=400)

        try:
            profile = HealthProfile.objects.get(id=profile_id, user=request.user)
        except HealthProfile.DoesNotExist:
            return Response({'error': 'Profile not found'}, status=404)

        history = get_biomarker_history(profile, biomarker_id)

        # Also return biomarker reference info
        try:
            biomarker = Biomarker.objects.select_related('category').get(id=biomarker_id)
            ref_data = BiomarkerSerializer(biomarker).data
        except Biomarker.DoesNotExist:
            ref_data = None

        return Response({
            'biomarker': ref_data,
            'history': history,
        })


# ── Report comparison ────────────────────────────────────────────────

class CompareReportsView(APIView):
    """
    §COMPARE: Compare two reports side-by-side.
    GET /api/health/compare/?report_a=<id>&report_b=<id>
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        report_a_id = request.query_params.get('report_a')
        report_b_id = request.query_params.get('report_b')

        if not report_a_id or not report_b_id:
            return Response({'error': 'Both report_a and report_b parameters required'}, status=400)

        try:
            report_a = BloodReport.objects.prefetch_related('results__biomarker__category').get(
                id=report_a_id, user=request.user
            )
            report_b = BloodReport.objects.prefetch_related('results__biomarker__category').get(
                id=report_b_id, user=request.user
            )
        except BloodReport.DoesNotExist:
            return Response({'error': 'Report not found'}, status=404)

        comparison = compare_reports(report_a, report_b)

        return Response({
            'report_a': {
                'id': report_a.id,
                'test_date': report_a.test_date.isoformat(),
                'lab_name': report_a.lab_name,
                'overall_score': report_a.overall_score,
            },
            'report_b': {
                'id': report_b.id,
                'test_date': report_b.test_date.isoformat(),
                'lab_name': report_b.lab_name,
                'overall_score': report_b.overall_score,
            },
            'comparison': comparison,
        })


# ── Health dashboard ─────────────────────────────────────────────────

class HealthDashboardView(APIView):
    """
    §DASH: Aggregated health dashboard for a profile.
    Returns latest scores, system breakdown, recent changes, top recommendations.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile_id = request.query_params.get('profile')
        profiles = HealthProfile.objects.filter(user=request.user)

        if not profiles.exists():
            return Response({
                'profiles': [],
                'has_data': False,
            })

        if profile_id:
            try:
                profile = profiles.get(id=profile_id)
            except HealthProfile.DoesNotExist:
                return Response({'error': 'Profile not found'}, status=404)
        else:
            profile = profiles.filter(is_primary=True).first() or profiles.first()

        # Latest report
        latest = (
            BloodReport.objects
            .filter(profile=profile)
            .prefetch_related('results__biomarker__category', 'recommendations')
            .order_by('-test_date')
            .first()
        )

        # Previous report (for comparison)
        previous = (
            BloodReport.objects
            .filter(profile=profile)
            .order_by('-test_date')[1:2]
        )
        prev_report = previous.first() if previous.exists() else None

        profile_data = HealthProfileSerializer(profile).data
        all_profiles = HealthProfileSerializer(profiles, many=True).data

        if not latest:
            return Response({
                'profiles': all_profiles,
                'current_profile': profile_data,
                'has_data': False,
            })

        # Build response
        latest_data = BloodReportDetailSerializer(latest).data

        # Score change from previous
        score_change = None
        if prev_report and prev_report.overall_score and latest.overall_score:
            score_change = latest.overall_score - prev_report.overall_score

        # Top 5 recommendations
        top_recs = HealthRecommendationSerializer(
            latest.recommendations.order_by('priority')[:5], many=True
        ).data

        # Report count
        report_count = BloodReport.objects.filter(profile=profile).count()

        return Response({
            'profiles': all_profiles,
            'current_profile': profile_data,
            'has_data': True,
            'latest_report': latest_data,
            'score_change': score_change,
            'previous_report_id': prev_report.id if prev_report else None,
            'previous_report_date': prev_report.test_date.isoformat() if prev_report else None,
            'report_count': report_count,
            'top_recommendations': top_recs,
        })


class TestPanelView(APIView):
    """Smart quarterly blood test panel: constant base + dynamic additions."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .test_panel import get_recommended_panel

        profile_id = request.query_params.get('profile')
        profiles = HealthProfile.objects.filter(user=request.user)

        if not profiles.exists():
            return Response({'error': 'No health profile found'}, status=404)

        if profile_id:
            try:
                profile = profiles.get(id=profile_id)
            except HealthProfile.DoesNotExist:
                return Response({'error': 'Profile not found'}, status=404)
        else:
            profile = profiles.filter(is_primary=True).first() or profiles.first()

        panel = get_recommended_panel(request.user, profile)
        return Response(panel)


# ── Health Passport Export ──────────────────────────────────────────────

class HealthPassportExportView(APIView):
    """
    §EXPORT: Generate and download health passport PDF.
    GET: Generate passport for a profile with selected sections.
    Query params:
      ?profile=<id>          — Health profile (default: primary or first)
      ?sections=blood,bp,weight — Comma-separated sections to include
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .health_passport import generate_health_passport
        from django.http import HttpResponse

        profile_id = request.query_params.get('profile')
        sections_param = request.query_params.get('sections', 'header,blood,bp,weight,supplements,timeline,risk,recommendations')

        # Get profile
        profiles = HealthProfile.objects.filter(user=request.user)

        if not profiles.exists():
            return Response({'error': 'No health profile found'}, status=404)

        if profile_id:
            try:
                profile = profiles.get(id=profile_id)
            except HealthProfile.DoesNotExist:
                return Response({'error': 'Profile not found'}, status=404)
        else:
            profile = profiles.filter(is_primary=True).first() or profiles.first()

        # Parse sections
        valid_sections = {'header', 'blood', 'bp', 'weight', 'supplements', 'timeline', 'risk', 'recommendations'}
        requested_sections = [s.strip() for s in sections_param.split(',')]
        sections = [s for s in requested_sections if s in valid_sections]

        if not sections:
            sections = list(valid_sections)

        # Generate PDF
        try:
            pdf_bytes = generate_health_passport(profile, sections=sections)

            # Return as download
            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            filename = f"health-passport-{profile.full_name.replace(' ', '-')}-{request.user.id}.pdf"
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response

        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Health passport generation failed: {e}")
            return Response({'error': f'PDF generation failed: {str(e)}'}, status=500)
