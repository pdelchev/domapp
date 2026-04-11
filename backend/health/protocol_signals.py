# backend/health/protocol_signals.py

"""
PROTOCOL SIGNALS
================
Hooks to trigger background tasks on model events

Events:
- DailyProtocolLog.created → Queue insights generation (5s delay)
- HealthProtocol.created → Initialize baseline biomarkers
- ProtocolRecommendation.created → Email notification (optional)
"""

from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import DailyProtocolLog, HealthProtocol
from .protocol_tasks import generate_daily_insights_task


@receiver(post_save, sender=DailyProtocolLog)
def on_daily_log_created(sender, instance, created, **kwargs):
    """
    DailyProtocolLogが作成されたら、5秒後にinsights生成

    フロー:
    1. ユーザーが daily log を save
    2. Signal fired → Celery task queued
    3. 5秒後: RecommendationEngine runs async
    4. Insights saved to log.ai_insights
    5. ProtocolRecommendation objects created
    """
    if created:
        # Queue task with 5 second delay
        generate_daily_insights_task.apply_async(
            args=[instance.id],
            countdown=5  # 5秒待機 (UIレスポンス優先)
        )


@receiver(post_save, sender=HealthProtocol)
def on_protocol_created(sender, instance, created, **kwargs):
    """
    HealthProtocolが作成されたら、baseline biomarkersを初期化

    フロー:
    1. ユーザーがプロトコル作成
    2. Signal fired
    3. 最新の血液検査結果をbaseline_biomarkersに保存
    4. adherence_percentage = 0 (新規)
    """
    if created:
        from .models import BloodReport, BloodResult

        try:
            # Get latest blood report
            latest_report = BloodReport.objects.filter(user=instance.user).latest('test_date')

            # Populate baseline biomarkers from latest report
            results = BloodResult.objects.filter(report=latest_report)
            baseline = {
                result.biomarker.abbreviation: float(result.value)
                for result in results
            }

            instance.baseline_biomarkers = baseline
            instance.save(update_fields=['baseline_biomarkers'])
        except BloodReport.DoesNotExist:
            # No blood report yet, skip initialization
            pass
