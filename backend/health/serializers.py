# ── health/serializers.py ─────────────────────────────────────────────
# DRF serializers for health tracker API.
#
# §NAV: models → [serializers] → views → urls → parsers → services → recommendations
# §PERF: Lightweight list serializers (no nested content) vs full detail serializers.

from rest_framework import serializers
from .models import (
    BiomarkerCategory, Biomarker, HealthProfile,
    BloodReport, BloodResult, HealthRecommendation,
)


# ── Biomarker serializers ────────────────────────────────────────────

class BiomarkerCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = BiomarkerCategory
        fields = ['id', 'name', 'name_bg', 'slug', 'icon', 'body_system', 'sort_order']


class BiomarkerSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_name_bg = serializers.CharField(source='category.name_bg', read_only=True)
    category_slug = serializers.CharField(source='category.slug', read_only=True)
    body_system = serializers.CharField(source='category.body_system', read_only=True)

    class Meta:
        model = Biomarker
        fields = [
            'id', 'name', 'name_bg', 'abbreviation', 'unit', 'alt_units',
            'category', 'category_name', 'category_name_bg', 'category_slug', 'body_system',
            'ref_min_male', 'ref_max_male', 'ref_min_female', 'ref_max_female',
            'optimal_min', 'optimal_max', 'critical_low', 'critical_high',
            'description', 'description_bg',
            'high_meaning', 'high_meaning_bg',
            'low_meaning', 'low_meaning_bg',
            'improve_tips', 'improve_tips_bg',
            'sort_order',
        ]


class BiomarkerCompactSerializer(serializers.ModelSerializer):
    """§PERF: Lightweight biomarker data for embedding in results."""
    body_system = serializers.CharField(source='category.body_system', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_name_bg = serializers.CharField(source='category.name_bg', read_only=True)
    category_icon = serializers.CharField(source='category.icon', read_only=True)

    class Meta:
        model = Biomarker
        fields = [
            'id', 'name', 'name_bg', 'abbreviation', 'unit',
            'body_system', 'category_name', 'category_name_bg', 'category_icon',
            'ref_min_male', 'ref_max_male', 'ref_min_female', 'ref_max_female',
            'optimal_min', 'optimal_max',
            'description', 'description_bg',
            'high_meaning', 'high_meaning_bg',
            'low_meaning', 'low_meaning_bg',
            'improve_tips', 'improve_tips_bg',
        ]


# ── Health profile serializers ───────────────────────────────────────

class HealthProfileSerializer(serializers.ModelSerializer):
    report_count = serializers.SerializerMethodField()
    latest_report_date = serializers.SerializerMethodField()
    latest_score = serializers.SerializerMethodField()

    class Meta:
        model = HealthProfile
        fields = [
            'id', 'full_name', 'date_of_birth', 'sex', 'is_primary', 'notes',
            'report_count', 'latest_report_date', 'latest_score',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_report_count(self, obj):
        return obj.reports.count()

    def get_latest_report_date(self, obj):
        latest = obj.reports.order_by('-test_date').first()
        return latest.test_date.isoformat() if latest else None

    def get_latest_score(self, obj):
        latest = obj.reports.order_by('-test_date').first()
        return latest.overall_score if latest else None


# ── Blood result serializers ─────────────────────────────────────────

class BloodResultSerializer(serializers.ModelSerializer):
    """§DETAIL: Full result with biomarker info for report detail page."""
    biomarker_detail = BiomarkerCompactSerializer(source='biomarker', read_only=True)

    class Meta:
        model = BloodResult
        fields = [
            'id', 'biomarker', 'biomarker_detail',
            'value', 'unit', 'flag', 'deviation_pct', 'ref_range_text',
        ]


class BloodResultWriteSerializer(serializers.ModelSerializer):
    """§WRITE: For manual entry / editing results."""
    class Meta:
        model = BloodResult
        fields = ['biomarker', 'value', 'unit']


# ── Recommendation serializer ────────────────────────────────────────

class HealthRecommendationSerializer(serializers.ModelSerializer):
    class Meta:
        model = HealthRecommendation
        fields = [
            'id', 'category', 'priority', 'title', 'title_bg',
            'description', 'description_bg', 'related_biomarkers', 'created_at',
        ]


# ── Blood report serializers ─────────────────────────────────────────

class BloodReportListSerializer(serializers.ModelSerializer):
    """§PERF: Lightweight for report list — no nested results."""
    profile_name = serializers.CharField(source='profile.full_name', read_only=True)
    result_count = serializers.SerializerMethodField()
    flag_summary = serializers.SerializerMethodField()

    class Meta:
        model = BloodReport
        fields = [
            'id', 'profile', 'profile_name', 'test_date', 'lab_name', 'lab_type',
            'file_name', 'overall_score', 'system_scores',
            'result_count', 'flag_summary',
            'created_at',
        ]

    def get_result_count(self, obj):
        return obj.results.count()

    def get_flag_summary(self, obj):
        """§SUMMARY: Count of results by flag category for quick overview."""
        results = obj.results.all()
        summary = {'optimal': 0, 'normal': 0, 'borderline': 0, 'abnormal': 0, 'critical': 0}
        for r in results:
            if r.flag == 'optimal':
                summary['optimal'] += 1
            elif r.flag == 'normal':
                summary['normal'] += 1
            elif r.flag in ('borderline_high', 'borderline_low'):
                summary['borderline'] += 1
            elif r.flag in ('high', 'low'):
                summary['abnormal'] += 1
            elif r.flag in ('critical_high', 'critical_low'):
                summary['critical'] += 1
        return summary


class BloodReportDetailSerializer(serializers.ModelSerializer):
    """§FULL: Complete report with all results and recommendations."""
    profile_name = serializers.CharField(source='profile.full_name', read_only=True)
    profile_sex = serializers.CharField(source='profile.sex', read_only=True)
    results = BloodResultSerializer(many=True, read_only=True)
    recommendations = HealthRecommendationSerializer(many=True, read_only=True)
    fasting_warnings = serializers.SerializerMethodField()
    retest_suggestion = serializers.SerializerMethodField()

    class Meta:
        model = BloodReport
        fields = [
            'id', 'profile', 'profile_name', 'profile_sex',
            'test_date', 'lab_name', 'lab_type',
            'file', 'file_name', 'notes',
            'overall_score', 'system_scores',
            'results', 'recommendations',
            'fasting_warnings', 'retest_suggestion',
            'parse_warnings',
            'created_at', 'updated_at',
        ]

    def get_fasting_warnings(self, obj):
        from .services import check_fasting_validity
        return check_fasting_validity(obj)

    def get_retest_suggestion(self, obj):
        from .recommendations import suggest_retest_date
        return suggest_retest_date(obj)


class BloodReportCreateSerializer(serializers.ModelSerializer):
    """§CREATE: For uploading new reports (with or without PDF)."""
    class Meta:
        model = BloodReport
        fields = ['profile', 'test_date', 'lab_name', 'lab_type', 'file', 'notes']

    def validate_profile(self, value):
        """§PERM: Ensure profile belongs to requesting user."""
        request = self.context.get('request')
        if request and value.user != request.user:
            raise serializers.ValidationError('Profile does not belong to you.')
        return value
