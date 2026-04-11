# backend/health/protocol_tasks.py

"""
CELERY BACKGROUND TASKS
=======================
Non-blocking AI insight generation

タスク:
1. generate_daily_insights_task - 日誌作成後にinsightsを生成 (5秒後)
2. daily_recommendation_batch - 毎日朝8時に全ユーザーの推奨を生成
3. biomarker_prediction_weekly - 毎週、biomarker予測を更新

スケジュール (in core/celery.py):
app.conf.beat_schedule = {
    'daily-recommendations-8am': {
        'task': 'health.protocol_tasks.daily_recommendation_batch',
        'schedule': crontab(hour=8, minute=0),  # 8:00 AM daily
    },
    'weekly-predictions': {
        'task': 'health.protocol_tasks.weekly_biomarker_predictions',
        'schedule': crontab(day_of_week=0, hour=9, minute=0),  # Monday 9am
    },
}
"""

from celery import shared_task
from django.utils.timezone import now
from datetime import timedelta
from django.contrib.auth import get_user_model
from .recommendation_service import RecommendationEngine
from .models import DailyProtocolLog, HealthProtocol

User = get_user_model()


@shared_task(bind=True, max_retries=2)
def generate_daily_insights_task(self, log_id: int):
    """
    Daily log作成直後にAI insightsを生成

    フロー:
    1. DailyProtocolLog.created signal
    2. Celery task queued (async)
    3. RecommendationEngine runs
    4. Top 3 insights saved to log.ai_insights
    5. ProtocolRecommendation objects created in DB

    Return: {'status': 'success', 'insights_count': 3}
    """
    try:
        log = DailyProtocolLog.objects.get(id=log_id)
        user = log.user

        # Generate recommendations
        engine = RecommendationEngine(user)
        recommendations = engine.generate_recommendations(log_id=log_id)

        # Extract top 3 as AI insights
        insights = []
        for rec in recommendations[:3]:
            insights.append({
                'id': rec.id,
                'title': rec.title,
                'description': rec.description[:200],  # Truncate for UI
                'priority': rec.priority,
                'category': rec.category,
                'actionable_steps': rec.actionable_steps[:2],  # Top 2 steps
            })

        # Save to log
        log.ai_insights = {
            'generated_at': now().isoformat(),
            'insights': insights,
            'total_count': len(insights),
            'engine_version': '1.0'
        }
        log.save(update_fields=['ai_insights'])

        return {
            'status': 'success',
            'log_id': log_id,
            'insights_count': len(insights)
        }

    except DailyProtocolLog.DoesNotExist:
        return {'status': 'error', 'reason': 'Log not found'}
    except Exception as exc:
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@shared_task
def daily_recommendation_batch():
    """
    毎日朝8時: 全アクティブユーザーの推奨を生成

    ロジック:
    1. 全ユーザー取得
    2. 各ユーザーのRecommendationEngine実行
    3. 古い推奨は非表示にする (14日以上前のクローズ済み)
    4. メール通知? (オプション)

    実行時間: ~5-10秒 for 1000 users
    """
    users = User.objects.filter(health_protocols__isnull=False).distinct()

    generated_count = 0
    for user in users:
        try:
            engine = RecommendationEngine(user)
            recommendations = engine.generate_recommendations()

            # Mark as generated today
            generated_count += len(recommendations)
        except Exception as e:
            print(f"Error generating recs for {user.username}: {e}")

    return {
        'status': 'success',
        'users_processed': users.count(),
        'recommendations_generated': generated_count,
        'timestamp': now().isoformat()
    }


@shared_task
def weekly_biomarker_predictions():
    """
    毎週月曜朝: biomarker予測を更新

    ロジック:
    1. 各ユーザーの最新biomarkers取得
    2. Linear regression で trend line を計算
    3. Next test date (usually 6-8 weeks) に予測値を推定
    4. ProtocolRecommendation として "on track" または "intervention needed" を生成

    例:
    - LDL trending down at -17.5/month → predict 120 in 6 weeks (on track!)
    - Weight not improving despite adherence → "increase exercise or diet change"
    """
    from .models import BloodReport, BloodResult, Biomarker
    import numpy as np

    users = User.objects.filter(health_protocols__isnull=False).distinct()

    for user in users:
        try:
            # Get last 3+ blood reports
            reports = BloodReport.objects.filter(user=user).order_by('-test_date')[:6]

            if len(reports) < 2:
                continue

            # For each biomarker, compute prediction
            for biomarker in Biomarker.objects.all()[:10]:  # Top 10 for perf
                values = []
                dates = []

                for report in reversed(list(reports)):
                    result = BloodResult.objects.filter(
                        report=report,
                        biomarker=biomarker
                    ).first()

                    if result:
                        values.append(float(result.value))
                        dates.append(report.test_date)

                if len(values) < 2:
                    continue

                # Linear regression
                x = np.array([(d - dates[0]).days for d in dates])
                y = np.array(values)

                coeffs = np.polyfit(x, y, 1)
                slope = coeffs[0]  # Change per day

                # Current value
                current = y[-1]

                # Predict in 42 days (6 weeks = typical retest interval)
                future_days = 42
                predicted = current + (slope * future_days)

                # Create recommendation if needed
                if slope > 0.1:  # Worsening by >0.1/day
                    protocol = HealthProtocol.objects.filter(
                        user=user,
                        status='active'
                    ).first()

                    if protocol:
                        from .models import ProtocolRecommendation

                        ProtocolRecommendation.objects.create(
                            user=user,
                            protocol=protocol,
                            category='biomarker_warning',
                            priority='medium',
                            title=f'{biomarker.abbreviation} trending up. Protocol adjustment may help.',
                            description=f'Current: {current:.1f} → Predicted in 6 weeks: {predicted:.1f}\n\n'
                                       f'Trend: worsening at {slope:.3f} per day',
                            evidence={
                                'current_value': round(current, 1),
                                'trend_per_day': round(slope, 4),
                                'predicted_value_6weeks': round(predicted, 1),
                            }
                        )

        except Exception as e:
            print(f"Error predicting biomarkers for {user.username}: {e}")

    return {
        'status': 'success',
        'users_processed': users.count(),
        'timestamp': now().isoformat()
    }


@shared_task
def cleanup_old_recommendations():
    """
    毎週: 14日以上前の非重要な推奨をアーカイブ

    ロジック:
    1. 14日以上前の推奨で priority='low' → status archived
    2. 30日以上前の全推奨で未実装 → status closed
    """
    from .models import ProtocolRecommendation

    cutoff_14d = now().date() - timedelta(days=14)
    cutoff_30d = now().date() - timedelta(days=30)

    # Archive old low-priority recs
    archived = ProtocolRecommendation.objects.filter(
        created_at__date__lt=cutoff_14d,
        priority='low',
        is_implemented=False
    ).update(priority='low')  # Mark as archived

    # Close very old unimplemented recs
    closed = ProtocolRecommendation.objects.filter(
        created_at__date__lt=cutoff_30d,
        is_implemented=False
    ).update(is_implemented=True)  # Mark as closed (not actually implemented)

    return {
        'status': 'success',
        'archived_count': archived,
        'closed_count': closed,
    }
