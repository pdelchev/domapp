"""
# ═══ GOUT SERVICES ═══
# Dashboard aggregation, trigger pattern analysis, risk assessment.
"""

from datetime import timedelta
from collections import Counter
from django.utils import timezone
from django.db.models import Avg, Count, Q

from .gout_models import GoutAttack, AttackTrigger, UricAcidReading, MedicalProcedure


def get_gout_dashboard(user, profile_id=None):
    """
    Main dashboard data: recent attacks, uric acid trend, trigger patterns, stats.
    """
    filters = {'user': user}
    if profile_id:
        filters['profile_id'] = profile_id

    attacks = GoutAttack.objects.filter(**filters)
    readings = UricAcidReading.objects.filter(**filters)
    procedures = MedicalProcedure.objects.filter(**filters)

    total_attacks = attacks.count()
    last_attack = attacks.first()
    recent_attacks = attacks[:5]

    # Uric acid
    latest_ua = readings.first()
    ua_readings = list(readings[:10].values('measured_at', 'value'))

    # Attack frequency (last 12 months)
    one_year_ago = timezone.now().date() - timedelta(days=365)
    attacks_12m = attacks.filter(onset_date__gte=one_year_ago).count()

    # Most affected joints
    joint_counts = (
        attacks.values('joint')
        .annotate(count=Count('id'))
        .order_by('-count')[:5]
    )

    # Average severity
    avg_severity = attacks.aggregate(avg=Avg('severity'))['avg']

    # Trigger analysis
    trigger_analysis = get_trigger_patterns(user, profile_id)

    # Days since last attack
    days_since = None
    if last_attack:
        days_since = (timezone.now().date() - last_attack.onset_date).days

    # Procedures count
    total_procedures = procedures.count()
    recent_procedures = procedures[:3]

    return {
        'total_attacks': total_attacks,
        'attacks_12_months': attacks_12m,
        'days_since_last': days_since,
        'avg_severity': round(avg_severity, 1) if avg_severity else None,
        'last_attack': {
            'id': last_attack.id,
            'onset_date': last_attack.onset_date.isoformat(),
            'joint': last_attack.joint,
            'joint_display': last_attack.get_joint_display(),
            'severity': last_attack.severity,
            'is_resolved': last_attack.get_is_resolved(),
        } if last_attack else None,
        'latest_uric_acid': {
            'value': float(latest_ua.value),
            'measured_at': latest_ua.measured_at.isoformat(),
            'status': latest_ua.get_status(),
        } if latest_ua else None,
        'uric_acid_trend': [
            {'date': r['measured_at'].isoformat(), 'value': float(r['value'])}
            for r in reversed(ua_readings)
        ],
        'joint_distribution': [
            {'joint': j['joint'], 'count': j['count']}
            for j in joint_counts
        ],
        'trigger_patterns': trigger_analysis,
        'total_procedures': total_procedures,
    }


def get_trigger_patterns(user, profile_id=None):
    """
    Analyze trigger frequency across all attacks.
    Returns top triggers by category with attack correlation %.
    """
    filters = {'attack__user': user}
    if profile_id:
        filters['attack__profile_id'] = profile_id

    triggers = AttackTrigger.objects.filter(**filters)
    total_attacks = GoutAttack.objects.filter(user=user).count()
    if total_attacks == 0:
        return {'food': [], 'drink': [], 'activity': []}

    result = {}
    for category in ['food', 'drink', 'activity']:
        cat_triggers = (
            triggers.filter(category=category)
            .values('name')
            .annotate(count=Count('id'))
            .order_by('-count')[:8]
        )
        result[category] = [
            {
                'name': t['name'],
                'count': t['count'],
                'pct': round(t['count'] / total_attacks * 100),
            }
            for t in cat_triggers
        ]

    return result


def get_gout_statistics(user, profile_id=None, days=365):
    """
    Detailed statistics for the statistics page.
    """
    filters = {'user': user}
    if profile_id:
        filters['profile_id'] = profile_id

    cutoff = timezone.now().date() - timedelta(days=days)
    attacks = GoutAttack.objects.filter(**filters, onset_date__gte=cutoff)

    # Monthly breakdown
    monthly = {}
    for attack in attacks:
        key = attack.onset_date.strftime('%Y-%m')
        monthly[key] = monthly.get(key, 0) + 1

    # Average duration
    resolved = attacks.filter(resolved_date__isnull=False)
    durations = [a.get_duration_days() for a in resolved]
    avg_duration = round(sum(durations) / len(durations), 1) if durations else None

    # Medication effectiveness
    med_stats = (
        attacks.exclude(medication='')
        .values('medication')
        .annotate(
            count=Count('id'),
            avg_severity=Avg('severity'),
        )
        .order_by('-count')
    )

    # Severity trend
    severity_trend = [
        {
            'date': a.onset_date.isoformat(),
            'severity': a.severity,
            'joint': a.joint,
        }
        for a in attacks.order_by('onset_date')
    ]

    return {
        'period_days': days,
        'total_attacks': attacks.count(),
        'avg_duration_days': avg_duration,
        'monthly_breakdown': monthly,
        'medication_stats': [
            {
                'medication': m['medication'],
                'count': m['count'],
                'avg_severity': round(m['avg_severity'], 1),
            }
            for m in med_stats
        ],
        'severity_trend': severity_trend,
    }
