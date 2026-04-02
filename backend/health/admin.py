from django.contrib import admin
from .models import (
    BiomarkerCategory, Biomarker, HealthProfile,
    BloodReport, BloodResult, HealthRecommendation,
)


class BiomarkerInline(admin.TabularInline):
    model = Biomarker
    extra = 0
    fields = ('name', 'abbreviation', 'unit', 'ref_min_male', 'ref_max_male', 'sort_order')


@admin.register(BiomarkerCategory)
class BiomarkerCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'body_system', 'sort_order')
    inlines = [BiomarkerInline]


@admin.register(Biomarker)
class BiomarkerAdmin(admin.ModelAdmin):
    list_display = ('name', 'abbreviation', 'category', 'unit', 'ref_min_male', 'ref_max_male')
    list_filter = ('category',)
    search_fields = ('name', 'abbreviation', 'aliases')


class BloodResultInline(admin.TabularInline):
    model = BloodResult
    extra = 0
    fields = ('biomarker', 'value', 'unit', 'flag', 'deviation_pct')
    readonly_fields = ('flag', 'deviation_pct')


class RecommendationInline(admin.TabularInline):
    model = HealthRecommendation
    extra = 0
    fields = ('category', 'priority', 'title', 'description')


@admin.register(HealthProfile)
class HealthProfileAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'user', 'sex', 'is_primary', 'date_of_birth')
    list_filter = ('sex', 'is_primary')


@admin.register(BloodReport)
class BloodReportAdmin(admin.ModelAdmin):
    list_display = ('profile', 'test_date', 'lab_type', 'overall_score', 'created_at')
    list_filter = ('lab_type',)
    inlines = [BloodResultInline, RecommendationInline]


@admin.register(BloodResult)
class BloodResultAdmin(admin.ModelAdmin):
    list_display = ('report', 'biomarker', 'value', 'unit', 'flag', 'deviation_pct')
    list_filter = ('flag', 'biomarker__category')
