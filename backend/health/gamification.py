"""
Gamification: badges, weekly challenges, milestones.

§ARCHITECTURE:
  - BADGES defined in code (below) — not in DB.
  - Achievement table persists only the first-time unlock so the UI can show
    a one-shot toast. Badge metadata (title, icon, description) is looked up
    from BADGES by code on every read.
  - Weekly challenges rotate deterministically by ISO week number so every
    user on the same week sees the same challenge (easier to reason about
    than per-user challenge state).
  - Progress is computed from existing data (DailyLog, DoseLog,
    BPReading, WeightReading, BloodReport) — no new event log table.

§NAV: daily_models.Achievement → gamification.py → daily_views.gamification_view
"""

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Callable, Optional

from django.db.models import Avg, Count, Q

from .daily_models import (
    DailyLog, DoseLog, SupplementSchedule, Achievement,
)


# ──────────────────────────────────────────────────────────────
# §CATALOG: Badges
# ──────────────────────────────────────────────────────────────

@dataclass
class BadgeDef:
    code: str
    title: str
    title_bg: str
    description: str
    description_bg: str
    icon: str
    tier: str  # bronze / silver / gold / platinum
    category: str  # streak / adherence / wellness / milestone


BADGES: list[BadgeDef] = [
    # Streak milestones (current consecutive check-in days)
    BadgeDef('streak_3', 'Getting Started', 'Започваш',
             '3-day check-in streak', '3 дни подред',
             '🔥', 'bronze', 'streak'),
    BadgeDef('streak_7', 'Week Warrior', 'Седмичен войн',
             '7-day check-in streak', '7 дни подред',
             '🔥', 'silver', 'streak'),
    BadgeDef('streak_30', 'Monthly Monk', 'Месечен монах',
             '30-day check-in streak', '30 дни подред',
             '🏆', 'gold', 'streak'),
    BadgeDef('streak_100', 'Centurion', 'Центурион',
             '100-day check-in streak', '100 дни подред',
             '💎', 'platinum', 'streak'),

    # Lifetime check-in totals
    BadgeDef('total_30', 'Consistent', 'Постоянство',
             '30 total check-ins', '30 общо дневни проверки',
             '📋', 'bronze', 'milestone'),
    BadgeDef('total_100', 'Century Club', 'Клуб 100',
             '100 total check-ins', '100 общо дневни проверки',
             '📋', 'silver', 'milestone'),
    BadgeDef('total_365', 'Full Year', 'Цяла година',
             '365 total check-ins', '365 общо дневни проверки',
             '📋', 'gold', 'milestone'),

    # Adherence milestones (dose compliance)
    BadgeDef('perfect_day', 'Perfect Day', 'Перфектен ден',
             '100% adherence for a day', '100% прием за един ден',
             '✅', 'bronze', 'adherence'),
    BadgeDef('perfect_week', 'Perfect Week', 'Перфектна седмица',
             '100% adherence 7 days in a row', '100% прием 7 дни подред',
             '⭐', 'gold', 'adherence'),
    BadgeDef('adherence_80', 'Reliable', 'Надежден',
             '80%+ adherence over 30 days', '80%+ прием за 30 дни',
             '💊', 'silver', 'adherence'),

    # Wellness habits
    BadgeDef('hydration_hero', 'Hydration Hero', 'Хидратация',
             '2L+ water for 7 days', '2L+ вода 7 дни',
             '💧', 'silver', 'wellness'),
    BadgeDef('mood_master', 'Good Vibes', 'Добро настроение',
             'Mood ≥4 for 7 days', 'Настроение ≥4 за 7 дни',
             '😊', 'silver', 'wellness'),
    BadgeDef('sleep_champion', 'Sleep Champion', 'Шампион по сън',
             '7h+ sleep for 7 days', '7ч+ сън 7 дни',
             '😴', 'silver', 'wellness'),

    # Milestone one-offs
    BadgeDef('first_checkin', 'First Step', 'Първа стъпка',
             'Completed your first check-in', 'Първа дневна проверка',
             '🎯', 'bronze', 'milestone'),
    BadgeDef('first_blood_report', 'Baseline Set', 'Базова линия',
             'Uploaded your first blood test', 'Първо кръвно изследване',
             '🩸', 'bronze', 'milestone'),
    BadgeDef('pill_pro_100', 'Pill Pro', 'Майстор на хапчетата',
             '100 doses logged as taken', '100 дози взети',
             '💊', 'silver', 'milestone'),
]

BADGES_BY_CODE = {b.code: b for b in BADGES}


# ──────────────────────────────────────────────────────────────
# §CATALOG: Weekly Challenges
# ──────────────────────────────────────────────────────────────

@dataclass
class ChallengeDef:
    code: str
    title: str
    title_bg: str
    description: str
    description_bg: str
    icon: str
    goal: int
    unit: str  # 'days', 'readings', 'ml', 'pct'
    metric: str  # internal key for progress_fn


CHALLENGES: list[ChallengeDef] = [
    ChallengeDef('weekly_checkin_7', 'Full Week', 'Пълна седмица',
                 'Complete the daily wizard every day this week',
                 'Завърши дневната проверка всеки ден',
                 '📋', 7, 'days', 'checkin_days'),
    ChallengeDef('weekly_adherence_90', 'High Adherence', 'Висок прием',
                 'Hit 90%+ dose adherence on 5 days',
                 '90%+ прием за 5 дни',
                 '💊', 5, 'days', 'adherence_days_90'),
    ChallengeDef('weekly_water_2l', 'Stay Hydrated', 'Хидратация',
                 'Average 2000ml water per day this week',
                 'Средно 2000мл вода на ден',
                 '💧', 2000, 'ml', 'avg_water'),
    ChallengeDef('weekly_bp_3', 'BP Monitor', 'Мониторинг налягане',
                 'Log 3 blood pressure readings this week',
                 '3 измервания на налягане',
                 '❤️', 3, 'readings', 'bp_readings'),
    ChallengeDef('weekly_sleep_7h', 'Sleep Priority', 'Приоритет сън',
                 'Sleep 7h+ on 5 days',
                 'Спи 7ч+ за 5 дни',
                 '😴', 5, 'days', 'sleep_days_7h'),
    ChallengeDef('weekly_mood_good', 'Feel Good', 'Добро настроение',
                 'Mood ≥4 on 5 days this week',
                 'Настроение ≥4 за 5 дни',
                 '😊', 5, 'days', 'mood_days_4'),
]


def current_week_bounds(today: Optional[date] = None) -> tuple[date, date, int]:
    """Return (monday, sunday, iso_week) for the current ISO week."""
    today = today or date.today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    iso_week = today.isocalendar().week
    return monday, sunday, iso_week


def current_challenge(today: Optional[date] = None) -> ChallengeDef:
    """Deterministically pick this week's challenge by ISO week number."""
    _, _, iso_week = current_week_bounds(today)
    return CHALLENGES[iso_week % len(CHALLENGES)]


# ──────────────────────────────────────────────────────────────
# §CORE: Compute earned state from raw data
# ──────────────────────────────────────────────────────────────

def _earned_badges(user, profile) -> set[str]:
    """Evaluate every badge definition against the user's data."""
    from .models import BloodReport
    from .bp_models import BPReading

    earned: set[str] = set()
    today = date.today()
    week_ago = today - timedelta(days=6)
    month_ago = today - timedelta(days=29)

    # ── Streak + totals
    logs = list(
        DailyLog.objects
        .filter(user=user, profile=profile, wizard_completed=True)
        .order_by('-date')
        .values_list('date', 'dose_adherence_pct', 'water_ml', 'mood', 'sleep_hours')[:400]
    )
    total_checkins = len(logs)

    if total_checkins >= 1:
        earned.add('first_checkin')
    if total_checkins >= 30:
        earned.add('total_30')
    if total_checkins >= 100:
        earned.add('total_100')
    if total_checkins >= 365:
        earned.add('total_365')

    # Current streak (walks back from today; allows yesterday if today blank)
    current_streak = 0
    cursor = today
    idx = 0
    dates = [row[0] for row in logs]
    if dates:
        if dates[0] == today:
            current_streak = 1
            cursor = today - timedelta(days=1)
            idx = 1
        elif dates[0] == today - timedelta(days=1):
            current_streak = 1
            cursor = today - timedelta(days=2)
            idx = 1
        while idx < len(dates) and dates[idx] == cursor:
            current_streak += 1
            cursor -= timedelta(days=1)
            idx += 1

    if current_streak >= 3:
        earned.add('streak_3')
    if current_streak >= 7:
        earned.add('streak_7')
    if current_streak >= 30:
        earned.add('streak_30')
    if current_streak >= 100:
        earned.add('streak_100')

    # ── Adherence: per-day and rolling
    # Perfect day: any day with adherence 100%
    if any(row[1] == 100 for row in logs):
        earned.add('perfect_day')

    # Perfect week: 7 consecutive days with 100% adherence
    consec_100 = 0
    for row in logs:
        if row[1] == 100:
            consec_100 += 1
            if consec_100 >= 7:
                earned.add('perfect_week')
                break
        else:
            consec_100 = 0

    # 30-day average adherence ≥ 80%
    last_30 = [row[1] for row in logs if row[0] >= month_ago]
    if len(last_30) >= 20 and (sum(last_30) / len(last_30)) >= 80:
        earned.add('adherence_80')

    # ── Wellness: 7 consecutive qualifying days
    def consecutive_qualifying(getter, threshold, op='gte') -> int:
        best = run = 0
        for row in logs:
            val = getter(row)
            if val is None:
                run = 0
                continue
            ok = val >= threshold if op == 'gte' else val <= threshold
            if ok:
                run += 1
                best = max(best, run)
            else:
                run = 0
        return best

    if consecutive_qualifying(lambda r: r[2], 2000) >= 7:
        earned.add('hydration_hero')
    if consecutive_qualifying(lambda r: r[3], 4) >= 7:
        earned.add('mood_master')
    if consecutive_qualifying(lambda r: float(r[4]) if r[4] else None, 7) >= 7:
        earned.add('sleep_champion')

    # ── Milestone one-offs
    if BloodReport.objects.filter(user=user).exists():
        earned.add('first_blood_report')

    total_doses_taken = DoseLog.objects.filter(
        schedule__supplement__user=user, taken=True
    ).count()
    if total_doses_taken >= 100:
        earned.add('pill_pro_100')

    return earned


# ──────────────────────────────────────────────────────────────
# §CORE: Weekly challenge progress
# ──────────────────────────────────────────────────────────────

def _challenge_progress(user, profile, challenge: ChallengeDef) -> int:
    """Compute raw progress value for the given challenge this week."""
    from .bp_models import BPReading

    monday, sunday, _ = current_week_bounds()
    week_logs = DailyLog.objects.filter(
        user=user, profile=profile,
        date__gte=monday, date__lte=sunday,
    )

    if challenge.metric == 'checkin_days':
        return week_logs.filter(wizard_completed=True).count()

    if challenge.metric == 'adherence_days_90':
        return week_logs.filter(dose_adherence_pct__gte=90).count()

    if challenge.metric == 'avg_water':
        avg = week_logs.aggregate(a=Avg('water_ml'))['a'] or 0
        return int(avg)

    if challenge.metric == 'bp_readings':
        return BPReading.objects.filter(
            user=user, profile=profile,
            measured_at__date__gte=monday, measured_at__date__lte=sunday,
        ).count()

    if challenge.metric == 'sleep_days_7h':
        return week_logs.filter(sleep_hours__gte=7).count()

    if challenge.metric == 'mood_days_4':
        return week_logs.filter(mood__gte=4).count()

    return 0


# ──────────────────────────────────────────────────────────────
# §API: Public entry point — called by the view
# ──────────────────────────────────────────────────────────────

def compute_gamification(user, profile) -> dict:
    """
    Return the full gamification payload for the UI.

    §SIDE_EFFECT: Persists newly-unlocked badges to Achievement so the
                  toast only fires once per badge per user.
    §OUTPUT: {
        badges: [{code, title, icon, tier, category, earned, unlocked_at}],
        earned_count, total_count,
        challenge: {code, title, icon, goal, progress, unit, pct, complete},
        new_unlocks: [{code, title, icon, title_bg}],  # ← show toast
    }
    """
    earned_codes = _earned_badges(user, profile)

    # Persist new unlocks
    existing = set(
        Achievement.objects.filter(user=user, code__in=earned_codes)
        .values_list('code', flat=True)
    )
    new_codes = earned_codes - existing
    new_unlocks = []
    if new_codes:
        Achievement.objects.bulk_create(
            [Achievement(user=user, code=c) for c in new_codes],
            ignore_conflicts=True,
        )

    # Pull unlock timestamps for earned badges
    unlocked_at_map = dict(
        Achievement.objects.filter(user=user, code__in=earned_codes)
        .values_list('code', 'unlocked_at')
    )

    badges = []
    for b in BADGES:
        is_earned = b.code in earned_codes
        badges.append({
            'code': b.code,
            'title': b.title,
            'title_bg': b.title_bg,
            'description': b.description,
            'description_bg': b.description_bg,
            'icon': b.icon,
            'tier': b.tier,
            'category': b.category,
            'earned': is_earned,
            'unlocked_at': unlocked_at_map.get(b.code).isoformat() if is_earned and unlocked_at_map.get(b.code) else None,
        })
        if b.code in new_codes:
            new_unlocks.append({
                'code': b.code,
                'title': b.title,
                'title_bg': b.title_bg,
                'icon': b.icon,
                'tier': b.tier,
            })

    # Current challenge
    chal = current_challenge()
    progress = _challenge_progress(user, profile, chal)
    pct = min(100, round((progress / chal.goal) * 100)) if chal.goal else 0
    monday, sunday, iso_week = current_week_bounds()

    return {
        'badges': badges,
        'earned_count': len(earned_codes),
        'total_count': len(BADGES),
        'challenge': {
            'code': chal.code,
            'title': chal.title,
            'title_bg': chal.title_bg,
            'description': chal.description,
            'description_bg': chal.description_bg,
            'icon': chal.icon,
            'goal': chal.goal,
            'progress': progress,
            'unit': chal.unit,
            'pct': pct,
            'complete': progress >= chal.goal,
            'week_start': monday.isoformat(),
            'week_end': sunday.isoformat(),
            'iso_week': iso_week,
        },
        'new_unlocks': new_unlocks,
    }


def mark_unlocks_seen(user, codes: list[str]) -> int:
    """Mark toast-shown badges as seen so the UI stops surfacing them."""
    return Achievement.objects.filter(
        user=user, code__in=codes, seen=False
    ).update(seen=True)
