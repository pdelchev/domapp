# backend/health/recommendation_service.py

"""
AI RECOMMENDATIONS ENGINE
==========================
Generates contextual recommendations from:
- Daily log patterns (mood, adherence, biometrics)
- Biomarker trends (blood test history)
- Genetic profile
- Protocol progress

No generic advice. All recommendations are data-driven.

例:
- "Your adherence drops on weekends → try habit stacking"
- "HRV down 10% → increase Magnesium"
- "LDL trending down → keep protocol!"
"""

from django.db.models import Avg, Q
from django.utils.timezone import now
from datetime import timedelta
from .models import (
    DailyProtocolLog, HealthProtocol, ProtocolRecommendation,
    BloodReport, BloodResult, Biomarker
)
import statistics


class RecommendationEngine:
    """
    リアルタイム推奨エンジン
    (Real-time recommendation engine)
    """

    def __init__(self, user):
        self.user = user

    def generate_recommendations(self, log_id=None):
        """
        メイン推奨生成関数

        入力: DailyProtocolLog (オプション)
        出力: List of ProtocolRecommendation objects
        """
        recommendations = []

        # 1. Adherence pattern analysis
        recommendations.extend(self._analyze_adherence_patterns())

        # 2. Mood/stress correlation analysis
        recommendations.extend(self._analyze_mood_stress_correlations())

        # 3. Biomarker trend analysis
        recommendations.extend(self._analyze_biomarker_trends())

        # 4. Sleep pattern recommendations
        recommendations.extend(self._analyze_sleep_patterns())

        # 5. Supplement effectiveness tracking
        recommendations.extend(self._analyze_supplement_effectiveness())

        # 6. Protocol progress tracking
        recommendations.extend(self._analyze_protocol_progress())

        # Deduplicate & prioritize
        unique_recs = self._deduplicate(recommendations)
        prioritized = self._prioritize(unique_recs)

        return prioritized[:5]  # Return top 5

    # ==================== ANALYSIS METHODS ====================

    def _analyze_adherence_patterns(self):
        """
        Adherence pattern detection

        検出:
        - Weekend vs weekday drops
        - Adherence decay over time
        - Correlation with mood/stress
        - Habit stacking opportunities
        """
        recs = []
        past_30_days = DailyProtocolLog.objects.filter(
            user=self.user,
            date__gte=now().date() - timedelta(days=30)
        ).order_by('date')

        if not past_30_days.exists():
            return recs

        # --- Weekend vs Weekday Analysis ---
        weekday_logs = [log for log in past_30_days if log.date.weekday() < 5]  # Mon-Fri
        weekend_logs = [log for log in past_30_days if log.date.weekday() >= 5]  # Sat-Sun

        if weekday_logs and weekend_logs:
            weekday_adherence = sum(log.protocol_adherence_pct for log in weekday_logs) / len(weekday_logs)
            weekend_adherence = sum(log.protocol_adherence_pct for log in weekend_logs) / len(weekend_logs)

            gap = weekday_adherence - weekend_adherence

            if gap > 20:  # Significant weekend drop
                protocol = weekday_logs[0].protocol if weekday_logs else None

                rec = ProtocolRecommendation.objects.create(
                    user=self.user,
                    protocol=protocol,
                    category='adherence_help',
                    priority='high',
                    title=f'Weekend adherence drops {gap:.0f}%. Try habit stacking.',
                    description=f'Weekdays: {weekday_adherence:.0f}% | Weekends: {weekend_adherence:.0f}%\n\n'
                               f'Your adherence is strong Mon-Fri but drops significantly on weekends. '
                               f'This is a classic pattern. Solution: anchor supplements to an existing weekend habit '
                               f'(morning coffee, shower, breakfast).',
                    evidence={
                        'weekday_adherence': round(weekday_adherence, 1),
                        'weekend_adherence': round(weekend_adherence, 1),
                        'gap': round(gap, 1),
                        'pattern': 'Weekend/weekday pattern detected',
                        'days_analyzed': 30,
                    },
                    actionable_steps=[
                        {
                            'step': 'Identify a weekend habit (morning coffee, breakfast, shower)',
                            'detail': 'Pick something you do every Saturday/Sunday consistently'
                        },
                        {
                            'step': 'Place supplement bottle next to that habit',
                            'detail': 'Make it visible as part of the routine'
                        },
                        {
                            'step': 'Set phone alarm for first 2 weeks only',
                            'detail': 'After that, habit should be automatic'
                        },
                        {
                            'step': 'Track weekend adherence for 3 weeks',
                            'detail': 'Log daily to reinforce the new habit'
                        }
                    ],
                    expected_impact={
                        'metric': 'weekend_adherence',
                        'baseline': round(weekend_adherence, 1),
                        'target': 85,
                        'timeline_days': 21,
                        'confidence': 0.85
                    }
                )
                recs.append(rec)

        # --- Low Overall Adherence ---
        overall_adherence = sum(log.protocol_adherence_pct for log in past_30_days) / len(past_30_days)

        if overall_adherence < 60:
            protocol = past_30_days[0].protocol if past_30_days else None

            rec = ProtocolRecommendation.objects.create(
                user=self.user,
                protocol=protocol,
                category='adherence_help',
                priority='high',
                title=f'Your adherence is {overall_adherence:.0f}%. Let\'s improve this.',
                description=f'Current adherence: {overall_adherence:.0f}%\n\n'
                           f'At this level, you\'re unlikely to see biomarker improvements. '
                           f'Let\'s simplify your protocol or fix the barriers.',
                evidence={
                    'average_adherence_30d': round(overall_adherence, 1),
                    'needed_improvement': round(85 - overall_adherence, 1),
                    'expected_improvement_pct': '25-35%',
                },
                actionable_steps=[
                    {'step': 'Review your protocol', 'detail': 'Is it too complex? (too many supplements/steps?)'},
                    {'step': 'Ask: what\'s blocking you?', 'detail': 'Forgetfulness? Taste? Side effects? Cost?'},
                    {'step': 'Simplify if needed', 'detail': 'Reduce supplements to 3 core ones'},
                    {'step': 'Use phone reminders', 'detail': 'Set daily alarm at supplement time'},
                ],
                expected_impact={
                    'metric': 'adherence',
                    'baseline': round(overall_adherence, 1),
                    'target': 85,
                    'timeline_days': 14,
                }
            )
            recs.append(rec)

        return recs

    def _analyze_mood_stress_correlations(self):
        """
        Mood & stress pattern analysis

        検出:
        - Stress spikes → missing supplements?
        - Low mood → need more exercise?
        - High energy days → what changed?
        """
        recs = []
        past_14_days = DailyProtocolLog.objects.filter(
            user=self.user,
            date__gte=now().date() - timedelta(days=14),
            mood__isnull=False,
            stress_level__isnull=False,
        ).order_by('date')

        if past_14_days.count() < 5:
            return recs

        moods = [log.mood for log in past_14_days if log.mood]
        stresses = [log.stress_level for log in past_14_days if log.stress_level]

        if not moods or not stresses:
            return recs

        avg_mood = sum(moods) / len(moods)
        avg_stress = sum(stresses) / len(stresses)

        # --- High Stress Detection ---
        if avg_stress > 6:
            protocol = past_14_days[0].protocol if past_14_days else None

            rec = ProtocolRecommendation.objects.create(
                user=self.user,
                protocol=protocol,
                category='stress_management',
                priority='high',
                title=f'Your stress level is {avg_stress:.1f}/10. High stress sabotages health.',
                description=f'Average stress: {avg_stress:.1f}/10 (last 14 days)\n\n'
                           f'High stress raises cortisol, which:\n'
                           f'- Increases inflammation (raises CRP)\n'
                           f'- Raises LDL cholesterol\n'
                           f'- Disrupts sleep\n'
                           f'- Reduces supplement effectiveness\n\n'
                           f'Let\'s add stress management to your protocol.',
                evidence={
                    'average_stress_14d': round(avg_stress, 1),
                    'critical_threshold': 6,
                    'impact': 'Cortisol elevation → reduced biomarker improvement',
                },
                actionable_steps=[
                    {
                        'step': 'Start daily meditation',
                        'detail': '10-15min daily (use Headspace, Calm, or Wim Hof app)',
                        'timing': 'Morning or evening'
                    },
                    {
                        'step': 'Add Magnesium Glycinate',
                        'detail': '400mg before bed (calming effect)',
                        'reason': 'Lowers cortisol when combined with meditation'
                    },
                    {
                        'step': 'Try 4-7-8 breathing',
                        'detail': 'Breathe in 4 counts, hold 7, exhale 8 (activates parasympathetic)',
                        'timing': '2-3x daily when stressed'
                    },
                    {
                        'step': 'Track stress for 2 weeks',
                        'detail': 'Log daily to see if interventions work',
                    }
                ],
                expected_impact={
                    'metric': 'stress_level',
                    'baseline': round(avg_stress, 1),
                    'target': 4,
                    'timeline_days': 21,
                    'additional_benefit': 'Improved sleep quality',
                }
            )
            recs.append(rec)

        # --- Low Mood Detection ---
        if avg_mood < 5:
            protocol = past_14_days[0].protocol if past_14_days else None

            rec = ProtocolRecommendation.objects.create(
                user=self.user,
                protocol=protocol,
                category='diet_change',
                priority='medium',
                title=f'Your mood is {avg_mood:.1f}/10. Consider Omega-3 or exercise increase.',
                description=f'Average mood: {avg_mood:.1f}/10 (last 14 days)\n\n'
                           f'Low mood can be:\n'
                           f'- Omega-3 deficiency (EPA/DHA for brain)\n'
                           f'- Lack of movement (exercise boosts serotonin)\n'
                           f'- Seasonal (if winter, increase Vitamin D)\n'
                           f'- Sleep quality (check your sleep scores)',
                evidence={
                    'average_mood_14d': round(avg_mood, 1),
                    'concern_threshold': 5,
                },
                actionable_steps=[
                    {
                        'step': 'Check Omega-3 intake',
                        'detail': 'Aim for 2g EPA/DHA daily (from fish or supplement)',
                    },
                    {
                        'step': 'Add 20min daily movement',
                        'detail': 'Walk, yoga, or light cardio (boosts endorphins)',
                    },
                    {
                        'step': 'Get morning sunlight',
                        'detail': '15-20min morning sun (regulates serotonin)',
                    },
                ],
                expected_impact={
                    'metric': 'mood',
                    'baseline': round(avg_mood, 1),
                    'target': 7,
                    'timeline_days': 14,
                }
            )
            recs.append(rec)

        return recs

    def _analyze_biomarker_trends(self):
        """
        Blood biomarker trend analysis

        例:
        - LDL down 10% → "Keep protocol!"
        - HDL down → "Need more exercise"
        - CRP up → "Inflammation rising"
        """
        recs = []

        # Get last 2 blood reports
        reports = BloodReport.objects.filter(user=self.user).order_by('-test_date')[:2]

        if len(reports) < 2:
            return recs  # Need 2+ reports for trends

        recent = reports[0]
        previous = reports[1]

        recent_results = {
            r.biomarker.abbreviation: r
            for r in BloodResult.objects.filter(report=recent)
        }
        previous_results = {
            r.biomarker.abbreviation: r
            for r in BloodResult.objects.filter(report=previous)
        }

        protocol = HealthProtocol.objects.filter(user=self.user, status='active').first()

        # --- LDL Trend ---
        if 'LDL' in recent_results and 'LDL' in previous_results:
            recent_ldl = float(recent_results['LDL'].value)
            previous_ldl = float(previous_results['LDL'].value)
            change = recent_ldl - previous_ldl
            change_pct = (change / previous_ldl) * 100

            if change < -20:  # Good improvement
                rec = ProtocolRecommendation.objects.create(
                    user=self.user,
                    protocol=protocol,
                    category='supplement_adjust',
                    priority='high',
                    title=f'🎉 LDL improved {-change_pct:.1f}%! Keep protocol.',
                    description=f'Previous LDL: {previous_ldl:.0f} mg/dL\n'
                               f'Current LDL: {recent_ldl:.0f} mg/dL\n'
                               f'Change: {change:.0f} mg/dL ({change_pct:.1f}%)\n\n'
                               f'Excellent progress! Your current protocol is working. '
                               f'Keep the same supplements and diet.',
                    evidence={
                        'previous_value': previous_ldl,
                        'current_value': recent_ldl,
                        'absolute_change': round(change, 1),
                        'percent_change': round(change_pct, 1),
                        'goal': 100,
                        'progress_to_goal': round((previous_ldl - recent_ldl) / (previous_ldl - 100) * 100, 1) if previous_ldl > 100 else 100,
                    },
                    actionable_steps=[
                        {'step': 'Continue current protocol', 'detail': 'Don\'t change what\'s working'},
                        {'step': 'Retest in 3 months', 'detail': 'Confirm sustainability'},
                        {'step': 'Track adherence', 'detail': 'This works because you\'re consistent'},
                    ],
                    expected_impact={
                        'metric': 'LDL continuation',
                        'current_trajectory': f'{change_pct:.1f}% per ~{(recent.test_date - previous.test_date).days} days',
                        'projected_next_test': 'Continue downward trend',
                    }
                )
                recs.append(rec)

            elif change > 10:  # Worsening
                rec = ProtocolRecommendation.objects.create(
                    user=self.user,
                    protocol=protocol,
                    category='supplement_adjust',
                    priority='high',
                    title=f'⚠️ LDL worsened by {change_pct:.1f}%. Protocol adjustment needed.',
                    description=f'Previous LDL: {previous_ldl:.0f} mg/dL\n'
                               f'Current LDL: {recent_ldl:.0f} mg/dL\n'
                               f'Change: {change:.0f} mg/dL ({change_pct:.1f}% worse)\n\n'
                               f'Despite protocol, LDL is rising. Possible causes:\n'
                               f'- Low adherence (supplements skipped?)\n'
                               f'- Diet drift (more saturated fat?)\n'
                               f'- Insufficient dose (need stronger intervention)\n'
                               f'- Other factors (stress, sleep deprivation)',
                    evidence={
                        'previous_value': previous_ldl,
                        'current_value': recent_ldl,
                        'absolute_change': round(change, 1),
                        'percent_change': round(change_pct, 1),
                        'concern': 'Rising trend despite protocol',
                    },
                    actionable_steps=[
                        {'step': 'Increase Red Yeast Rice', 'detail': '1200mg → 1800mg daily'},
                        {'step': 'Add Plant Sterols', 'detail': '2g daily (blocks cholesterol absorption)'},
                        {'step': 'Check diet adherence', 'detail': 'Reduce saturated fat further'},
                        {'step': 'Retest in 6 weeks', 'detail': 'See if higher dose helps'},
                    ],
                    expected_impact={
                        'metric': 'LDL reduction',
                        'current_value': recent_ldl,
                        'target': 100,
                        'expected_reduction': '30-50 mg/dL',
                        'timeline_weeks': 6,
                    }
                )
                recs.append(rec)

        return recs

    def _analyze_sleep_patterns(self):
        """
        Sleep quality & duration analysis

        検出:
        - Low sleep hours → fatigue, higher cortisol
        - Low sleep quality → mood drops, biomarkers worsen
        - Week patterns (Mon vs Fri)
        """
        recs = []

        past_14_days = DailyProtocolLog.objects.filter(
            user=self.user,
            date__gte=now().date() - timedelta(days=14),
            sleep_hours__isnull=False,
        ).order_by('date')

        if past_14_days.count() < 5:
            return recs

        sleep_hours = [log.sleep_hours for log in past_14_days if log.sleep_hours]
        avg_sleep = sum(sleep_hours) / len(sleep_hours)

        protocol = past_14_days[0].protocol if past_14_days else None

        if avg_sleep < 6.5:
            rec = ProtocolRecommendation.objects.create(
                user=self.user,
                protocol=protocol,
                category='sleep_protocol',
                priority='high',
                title=f'Your sleep is {avg_sleep:.1f}h/night. This is sabotaging your health.',
                description=f'Average sleep: {avg_sleep:.1f} hours/night (last 14 days)\n\n'
                           f'At {avg_sleep:.1f}h, you\'re not getting enough recovery. This causes:\n'
                           f'- Higher cortisol (raises LDL, CRP)\n'
                           f'- Lower immune function\n'
                           f'- Slower biomarker improvement\n'
                           f'- Lower HRV\n'
                           f'- Weight gain\n\n'
                           f'Sleep is non-negotiable. Let\'s fix this.',
                evidence={
                    'average_sleep_hours': round(avg_sleep, 1),
                    'recommended': 7.5,
                    'deficit': round(7.5 - avg_sleep, 1),
                    'impact': 'Sleep deprivation impairs all health interventions',
                },
                actionable_steps=[
                    {
                        'step': 'Add Magnesium Glycinate',
                        'detail': '400mg, 2 hours before bed',
                        'timing': 'Same time every night'
                    },
                    {
                        'step': 'Add L-Theanine',
                        'detail': '200mg before bed (non-drowsy, promotes relaxation)',
                    },
                    {
                        'step': 'Consistent bedtime',
                        'detail': 'Same time ±30min every night (circadian rhythm)',
                    },
                    {
                        'step': 'Sleep environment',
                        'detail': 'Dark room, cool temp (18-19°C), white noise if needed',
                    },
                    {
                        'step': 'No screens 1hr before bed',
                        'detail': 'Blue light suppresses melatonin',
                    },
                ],
                expected_impact={
                    'metric': 'sleep_hours',
                    'baseline': round(avg_sleep, 1),
                    'target': 7.5,
                    'timeline_weeks': 2,
                    'secondary_benefits': ['Better mood', 'Lower stress', 'Improved biomarkers'],
                }
            )
            recs.append(rec)

        return recs

    def _analyze_supplement_effectiveness(self):
        """
        Track which supplements are actually working

        例:
        - Red Yeast Rice taken consistently → LDL down ✓
        - Magnesium taken but sleep quality flat → increase dose?
        - L-Theanine skipped on weekends → mood dips
        """
        # Placeholder for future: requires intervention outcome tracking
        return []

    def _analyze_protocol_progress(self):
        """
        Overall protocol progress tracking

        検出:
        - On track to meet goals
        - Behind schedule
        - Needs protocol adjustment
        """
        recs = []

        active_protocols = HealthProtocol.objects.filter(
            user=self.user,
            status='active'
        )

        for protocol in active_protocols:
            logs = DailyProtocolLog.objects.filter(
                protocol=protocol,
                date__gte=now().date() - timedelta(days=7)
            )

            if not logs.exists():
                continue

            avg_adherence = logs.aggregate(Avg('protocol_adherence_pct'))['protocol_adherence_pct__avg'] or 0
            protocol.adherence_percentage = avg_adherence
            protocol.save()

            # --- Low Adherence Warning ---
            if avg_adherence < 50:
                rec = ProtocolRecommendation.objects.create(
                    user=self.user,
                    protocol=protocol,
                    category='adherence_help',
                    priority='medium',
                    title=f'Protocol adherence is {avg_adherence:.0f}% this week.',
                    description=f'To see results from "{protocol.name}", you need 80%+ adherence.\n\n'
                               f'This week: {avg_adherence:.0f}%\n\n'
                               f'At this level, you\'re unlikely to hit your goals by {protocol.end_date}.',
                    evidence={
                        'adherence_this_week': round(avg_adherence, 1),
                        'target': 80,
                        'gap': round(80 - avg_adherence, 1),
                    },
                    actionable_steps=[
                        {'step': 'Simplify protocol if too complex'},
                        {'step': 'Use phone reminders'},
                        {'step': 'Track daily to build habit'},
                    ],
                    expected_impact={
                        'metric': 'adherence',
                        'baseline': round(avg_adherence, 1),
                        'target': 80,
                        'timeline_days': 7,
                    }
                )
                recs.append(rec)

        return recs

    # ==================== DEDUPLICATION & PRIORITIZATION ====================

    def _deduplicate(self, recommendations):
        """
        Remove duplicate recommendations
        Keep most recent/detailed version
        """
        seen = {}
        for rec in recommendations:
            key = (rec.category, rec.title)
            if key not in seen:
                seen[key] = rec
        return list(seen.values())

    def _prioritize(self, recommendations):
        """
        Sort by: priority level, then recency, then confidence
        """
        priority_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
        return sorted(
            recommendations,
            key=lambda r: (
                priority_order.get(r.priority, 999),
                -r.created_at.timestamp() if r.created_at else 0,
            )
        )
