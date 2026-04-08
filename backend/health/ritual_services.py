"""
# ═══ RITUAL SERVICES ═══
# Pre-load protocol, adherence stats, measurement progress.
"""

from datetime import timedelta, time
from django.utils import timezone
from django.db.models import Count, Q

from .ritual_models import RitualItem, RitualLog, BodyMeasurement


def seed_protocol(user, profile=None):
    """
    Pre-load the full health protocol for the user.
    Only creates items that don't already exist.
    """
    if RitualItem.objects.filter(user=user).exists():
        return []

    items = [
        # === MORNING ===
        {'name': 'Wake + Hydrate', 'category': 'hydration', 'dose': '500ml water', 'scheduled_time': time(6, 30), 'timing': 'morning', 'sort_order': 10, 'color': 'blue'},
        {'name': 'Olmesta A Plus 40/10/12.5', 'category': 'medication', 'dose': '0.5 tablet', 'instructions': 'BP medication — morning (Olmesartan 40 + Amlodipine 10 + HCTZ 12.5)', 'scheduled_time': time(7, 0), 'timing': 'morning', 'sort_order': 20, 'color': 'red', 'warning': 'CoQ10 also lowers BP — monitor for dizziness', 'prescription_note': 'Д-р Иванка Гоновска (кардиолог)\nDoctors Gonovski, Пловдив, ж.к. Тракия, ул. Шипка 23\nУИН: 2300013756\nRp: Olmesta A Plus 40/10/12.5 — 1/2 x 1т сутрин'},
        {'name': 'Febuxostat 80mg', 'category': 'medication', 'dose': '1 tablet', 'instructions': 'Gout — daily, uric acid lowering', 'scheduled_time': time(7, 0), 'timing': 'morning', 'sort_order': 25, 'color': 'red', 'prescription_note': 'Д-р Кр. Груновски (ортопед-травматолог)\n16.12.2024\nRp: Febuxostat 80mg — 1т дневно'},
        {'name': 'Saxenda Injection', 'category': 'injection', 'dose': 'Week 1-4: 0.6mg → Week 5-8: 1.2mg → Week 9-12: 1.8mg → Week 13-16: 2.4mg → Week 17+: 3.0mg', 'instructions': 'Fasted — no food until 13:00. Inject subcutaneously in abdomen/thigh. Rotate injection site daily.', 'scheduled_time': time(9, 0), 'timing': 'morning', 'sort_order': 30, 'color': 'purple'},

        # === FASTED WINDOW ===
        {'name': 'NMN', 'category': 'supplement', 'dose': '500mg (1 capsule)', 'instructions': 'Fasted — water only, does not break fast. Take with water on empty stomach for best absorption.', 'scheduled_time': time(10, 0), 'timing': 'fasted', 'sort_order': 40, 'color': 'indigo'},
        {'name': 'Spermidine', 'category': 'supplement', 'dose': '1mg (1 capsule)', 'instructions': 'Fasted — autophagy support (Sinclair). Take with water only.', 'scheduled_time': time(10, 0), 'timing': 'fasted', 'sort_order': 45, 'color': 'indigo'},

        # === DEEP WORK ===
        {'name': 'Deep Work Block', 'category': 'work', 'dose': '', 'instructions': 'Focus time — no meetings', 'scheduled_time': time(9, 30), 'timing': 'morning', 'sort_order': 50, 'color': 'gray'},

        # === FIRST MEAL (13:00) ===
        {'name': 'First Meal', 'category': 'meal', 'dose': '', 'instructions': 'Break fast — include healthy fats for supplement absorption', 'scheduled_time': time(13, 0), 'timing': 'with_meal_1', 'sort_order': 60, 'color': 'green'},
        {'name': 'Vitamin D3 + K2', 'category': 'supplement', 'dose': 'D3 4000IU + K2 200mcg', 'instructions': 'With food (fat-soluble)', 'scheduled_time': time(13, 0), 'timing': 'with_meal_1', 'sort_order': 70, 'color': 'yellow'},
        {'name': 'Omega-3', 'category': 'supplement', 'dose': '1000mg EPA+DHA (2 softgels)', 'instructions': 'With food — fat improves absorption. Take with first meal.', 'scheduled_time': time(13, 0), 'timing': 'with_meal_1', 'sort_order': 71, 'color': 'yellow'},
        {'name': 'Zinc', 'category': 'supplement', 'dose': '25mg (1 tablet zinc picolinate)', 'instructions': 'With food — separated from Febuxostat by 6h. Supports testosterone + immune.', 'scheduled_time': time(13, 0), 'timing': 'with_meal_1', 'sort_order': 72, 'color': 'yellow', 'warning': 'Take 6h after Febuxostat to avoid absorption interference'},
        {'name': 'Boron', 'category': 'supplement', 'dose': '3mg (1 capsule)', 'instructions': 'With food. Supports testosterone, bone health, reduces inflammation.', 'scheduled_time': time(13, 0), 'timing': 'with_meal_1', 'sort_order': 73, 'color': 'yellow'},
        {'name': 'Coenzyme Q10', 'category': 'supplement', 'dose': '250mg ubiquinol (1 softgel)', 'instructions': 'With food (fat-soluble). Ubiquinol form preferred over ubiquinone — 3-4x better absorption.', 'scheduled_time': time(13, 0), 'timing': 'with_meal_1', 'sort_order': 74, 'color': 'yellow', 'warning': 'Also lowers BP — synergy with Olmesta A Plus, monitor'},
        {'name': 'Resveratrol', 'category': 'supplement', 'dose': '500mg trans-resveratrol (1 capsule)', 'instructions': 'With food + fat — pairs with NMN for NAD+ synergy (Sinclair protocol).', 'scheduled_time': time(13, 0), 'timing': 'with_meal_1', 'sort_order': 75, 'color': 'yellow'},
        {'name': 'Vitamin C', 'category': 'supplement', 'dose': '500mg (1 tablet)', 'instructions': 'With food. Helps lower uric acid by 0.5mg/dL. Supports immune + iron absorption.', 'scheduled_time': time(13, 0), 'timing': 'with_meal_1', 'sort_order': 76, 'color': 'yellow'},

        # === WORK BLOCK 2 ===
        {'name': 'Work Block 2', 'category': 'work', 'dose': '', 'instructions': 'Afternoon productivity', 'scheduled_time': time(14, 0), 'timing': 'anytime', 'sort_order': 80, 'color': 'gray'},

        # === PRE-WORKOUT (conditional) ===
        {'name': 'L-Citrulline Malate', 'category': 'supplement', 'dose': '8g powder (1 scoop) in 200ml water', 'instructions': '30-45 min before gym or 60-90 min before sex. Mix with water, stir well. Boosts nitric oxide → better blood flow + pump.', 'scheduled_time': time(15, 30), 'timing': 'pre_workout', 'condition': 'gym_day', 'sort_order': 90, 'color': 'blue'},
        {'name': 'Panax Ginseng', 'category': 'supplement', 'dose': '300mg standardized extract (1 capsule)', 'instructions': '30-45 min before gym or sex. Boosts energy + performance. SKIP on gout flare days.', 'scheduled_time': time(15, 30), 'timing': 'pre_workout', 'condition': 'gym_day', 'sort_order': 91, 'color': 'blue', 'warning': 'Can raise BP — monitor. Pause during gout flares'},

        # === GYM ===
        {'name': 'Gym / Training', 'category': 'exercise', 'dose': '45-60 min', 'instructions': 'Strength training 3-4x/week', 'scheduled_time': time(16, 0), 'timing': 'anytime', 'condition': 'gym_day', 'sort_order': 100, 'color': 'green'},

        # === LAST MEAL ===
        {'name': 'Last Meal', 'category': 'meal', 'dose': '', 'instructions': 'Light meal — low-purine foods preferred. Eating window closes.', 'scheduled_time': time(17, 30), 'timing': 'with_meal_2', 'sort_order': 110, 'color': 'green'},

        # === SOCIAL/FAMILY ===
        {'name': 'Social / Family Time', 'category': 'social', 'dose': '', 'instructions': 'Disconnect from work — quality time', 'scheduled_time': time(18, 0), 'timing': 'evening', 'sort_order': 120, 'color': 'purple'},

        # === EVENING ===
        {'name': 'Moxonidine 0.4mg', 'category': 'medication', 'dose': '0.5 tablet', 'instructions': 'BP medication — evening', 'scheduled_time': time(20, 0), 'timing': 'evening', 'sort_order': 130, 'color': 'red', 'warning': 'Additive BP lowering with Mg Taurate — monitor for low BP', 'prescription_note': 'Д-р Иванка Кулевска Головска (кардиолог)\nУИН: 2300013756\nRp: Мокедин 0.4mg — 0.5 x от вечер'},

        # === BEDTIME ===
        {'name': 'Magnesium Taurate', 'category': 'supplement', 'dose': '400mg elemental Mg (2-3 tablets depending on brand)', 'instructions': 'Before bed — supports sleep, heart rhythm, reduces BP. Taurate form best for cardiovascular + calming effect.', 'scheduled_time': time(21, 0), 'timing': 'bedtime', 'sort_order': 140, 'color': 'indigo', 'warning': 'Also lowers BP — additive with evening Moxonidine'},
        {'name': 'Glycine', 'category': 'supplement', 'dose': '3g powder (1 teaspoon) in water', 'instructions': 'Before bed — improves sleep quality, supports collagen synthesis (Sinclair). Mix in warm water or take capsules.', 'scheduled_time': time(21, 0), 'timing': 'bedtime', 'sort_order': 141, 'color': 'indigo'},

        # === SLEEP ===
        {'name': 'Sleep', 'category': 'sleep', 'dose': '7-8 hours', 'instructions': 'Lights out by 22:00 — aim for 22:00-06:30', 'scheduled_time': time(22, 0), 'timing': 'bedtime', 'sort_order': 150, 'color': 'gray'},

        # === AS NEEDED (gout flare) ===
        {'name': 'Arcoxia 120mg', 'category': 'medication', 'dose': '1 tablet/day, max 5 days', 'instructions': 'ONLY during gout flare — NSAID anti-inflammatory', 'scheduled_time': None, 'timing': 'anytime', 'condition': 'as_needed', 'sort_order': 190, 'color': 'red', 'prescription_note': 'Д-р Кр. Груновски (ортопед-травматолог)\n16.12.2024\nRp: Arcoxia 120mg — 5 дни по 1 таблетка'},
        {'name': 'Sanaxa Gel', 'category': 'medication', 'dose': '3x daily, topical', 'instructions': 'ONLY during gout flare — apply to affected joint', 'scheduled_time': None, 'timing': 'anytime', 'condition': 'as_needed', 'sort_order': 191, 'color': 'red', 'prescription_note': 'Д-р Кр. Груновски (ортопед-травматолог)\n16.12.2024\nRp: Sanaxa gel — 3 пъти дневно'},

        # === HYDRATION (anytime) ===
        {'name': 'Water Intake', 'category': 'hydration', 'dose': '2.5-3.0 L total', 'instructions': 'Track throughout the day', 'scheduled_time': None, 'timing': 'anytime', 'sort_order': 200, 'color': 'blue'},
    ]

    created = []
    for item_data in items:
        item = RitualItem.objects.create(
            user=user,
            profile=profile,
            **item_data,
        )
        created.append(item)

    return created


def get_ritual_dashboard(user, profile_id=None, date=None):
    """Get today's ritual items with completion status."""
    if date is None:
        date = timezone.now().date()

    filters = {'user': user, 'is_active': True}
    if profile_id:
        filters['profile_id'] = profile_id

    items = RitualItem.objects.filter(**filters)
    logs = {
        log.item_id: log
        for log in RitualLog.objects.filter(item__in=items, date=date)
    }

    result = []
    for item in items:
        log = logs.get(item.id)
        result.append({
            'id': item.id,
            'name': item.name,
            'category': item.category,
            'category_display': item.get_category_display(),
            'dose': item.dose,
            'instructions': item.instructions,
            'scheduled_time': item.scheduled_time.strftime('%H:%M') if item.scheduled_time else None,
            'timing': item.timing,
            'condition': item.condition,
            'warning': item.warning,
            'color': item.color,
            'sort_order': item.sort_order,
            'prescription_note': item.prescription_note,
            'prescription_image': item.prescription_image.url if item.prescription_image else None,
            'completed': log.completed if log else False,
            'completed_at': log.completed_at.isoformat() if log and log.completed_at else None,
            'skipped': log.skipped if log else False,
            'log_id': log.id if log else None,
        })

    # Stats
    total = len([r for r in result if r['condition'] == 'daily' or r['condition'] == 'gym_day'])
    done = len([r for r in result if r['completed']])

    return {
        'date': date.isoformat(),
        'items': result,
        'total': total,
        'completed': done,
        'pct': round(done / total * 100) if total > 0 else 0,
    }


def toggle_ritual_item(item_id, user, date=None):
    """Toggle completion of a ritual item for a date."""
    if date is None:
        date = timezone.now().date()

    item = RitualItem.objects.filter(id=item_id, user=user).first()
    if not item:
        return None

    log, created = RitualLog.objects.get_or_create(
        item=item, date=date,
        defaults={'completed': True, 'completed_at': timezone.now()},
    )
    if not created:
        log.completed = not log.completed
        log.completed_at = timezone.now() if log.completed else None
        log.save()

    return log


def get_adherence_stats(user, days=30):
    """Get adherence stats over a period."""
    today = timezone.now().date()
    start = today - timedelta(days=days)

    daily_items = RitualItem.objects.filter(
        user=user, is_active=True, condition='daily'
    ).count()

    if daily_items == 0:
        return {'days': days, 'avg_pct': 0, 'streak': 0, 'daily': []}

    logs = RitualLog.objects.filter(
        item__user=user,
        item__is_active=True,
        item__condition='daily',
        date__gte=start,
        date__lte=today,
    )

    by_date = {}
    for log in logs:
        d = log.date.isoformat()
        if d not in by_date:
            by_date[d] = {'done': 0, 'total': daily_items}
        if log.completed:
            by_date[d]['done'] += 1

    daily = []
    streak = 0
    for i in range(days, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        entry = by_date.get(d, {'done': 0, 'total': daily_items})
        pct = round(entry['done'] / entry['total'] * 100) if entry['total'] > 0 else 0
        daily.append({'date': d, 'pct': pct})
        if i == 0 or pct >= 80:
            streak += 1
        else:
            streak = 0

    avg_pct = round(sum(d['pct'] for d in daily) / len(daily)) if daily else 0

    return {
        'days': days,
        'avg_pct': avg_pct,
        'streak': streak,
        'daily': daily[-14:],  # Last 14 days for display
    }
