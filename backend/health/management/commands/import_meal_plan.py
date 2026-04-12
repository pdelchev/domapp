"""
Management command to import daily meal plan synchronized with supplements.
Usage: python manage.py import_meal_plan --user <user_id>
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from health.models import MealTiming, HealthProfile, Intervention

User = get_user_model()

# Your complete daily meal plan synchronized with supplement timing
MEAL_PLAN = [
    {
        'time_slot': '09:00',
        'meal_name': 'Breakfast (Optional)',
        'meal_name_bg': 'Закуска (опционално)',
        'description': 'Light breakfast if hungry. Primary focus: hydration + Saxenda fasted.',
        'description_bg': 'Лека закуска ако си гладен. Фокус: хидратация + Saxenda натощак.',
        'nutritional_focus': ['hydration'],
        'water_ml': 500,
        'suggested_foods': ['water', 'tea', 'black coffee'],
        'suggested_foods_bg': ['вода', 'чай', 'черно кафе'],
        'notes': 'Saxenda works best fasted. If eating, keep it light.',
        'notes_bg': 'Saxenda работи най-добре натощак. Ако ядеш, държи се лека.',
    },
    {
        'time_slot': '13:00',
        'meal_name': 'Lunch (with Fat)',
        'meal_name_bg': 'Обяд (с масло)',
        'description': 'Main meal with healthy fats for fat-soluble vitamin absorption (D3, K2, CoQ10, Omega-3). Include: olive oil, fish, eggs, avocado, nuts.',
        'description_bg': 'Главно хранене със здравословни мазнини за абсорбция на витамини (D3, K2, CoQ10, Omega-3). Включи: маслиново масло, риба, яйца, авокадо, орехи.',
        'nutritional_focus': ['fat', 'protein', 'carbs'],
        'water_ml': 400,
        'suggested_foods': ['olive oil', 'fish', 'eggs', 'avocado', 'nuts', 'green vegetables'],
        'suggested_foods_bg': ['маслиново масло', 'риба', 'яйца', 'авокадо', 'орехи', 'зелени зеленчуци'],
        'notes': 'Critical meal: all fat-soluble supplements taken here. Cook with olive oil or eat raw fats.',
        'notes_bg': 'Критично хранене: всички мазнинорастворими добавки тук. Готви с маслиново масло или яж сурови мазнини.',
    },
    {
        'time_slot': '18:00',
        'meal_name': 'Dinner',
        'meal_name_bg': 'Вечеря',
        'description': 'Balanced dinner. Include magnesium-rich foods (leafy greens, pumpkin seeds). Take Magnesium Taurate with meal.',
        'description_bg': 'Балансирана вечеря. Включи храни богати на магнезий (листна зеленина, семки от тиква). Вземи Magnesium Taurate със хранене.',
        'nutritional_focus': ['magnesium', 'protein'],
        'water_ml': 300,
        'suggested_foods': ['spinach', 'kale', 'pumpkin seeds', 'dark chocolate', 'beans'],
        'suggested_foods_bg': ['спанак', 'кейл', 'семки от тиква', 'тъмен шоколад', 'боб'],
        'notes': 'Magnesium supports sleep + muscle relaxation. Don\'t take stimulants after this meal.',
        'notes_bg': 'Магнезий подкрепя сън + релаксация на мускулите. Не приемай стимуланти след това.',
    },
    {
        'time_slot': '21:30',
        'meal_name': 'Pre-Sleep (Water + Supplement)',
        'meal_name_bg': 'Преди съня (Вода + Добавка)',
        'description': 'Final magnesium dose + water. Prepare for sleep. Dim lights, no screens.',
        'description_bg': 'Финална доза магнезий + вода. Подготов се за сън. Намали светлината, без екрани.',
        'nutritional_focus': ['hydration', 'magnesium'],
        'water_ml': 200,
        'suggested_foods': [],
        'suggested_foods_bg': [],
        'notes': 'Magnesium + sleep protocol. Helps with sleep quality and recovery.',
        'notes_bg': 'Магнезий + протокол за сън. Помага със качеството на сън и възстановяване.',
    },
]

class Command(BaseCommand):
    help = 'Import daily meal plan synchronized with supplements'

    def add_arguments(self, parser):
        parser.add_argument('--user', type=int, help='User ID to import for')
        parser.add_argument('--dry-run', action='store_true', help='Preview without saving')

    def handle(self, *args, **options):
        if not options['user']:
            self.stdout.write(self.style.ERROR('--user argument required'))
            return

        try:
            user = User.objects.get(id=options['user'])
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'User {options["user"]} not found'))
            return

        # Get or create primary profile
        profile = HealthProfile.objects.filter(user=user, is_primary=True).first()
        if not profile:
            self.stdout.write(self.style.ERROR('No primary profile found'))
            return

        # Build supplement ID map
        supplement_map = {
            '09:00': [],  # No supplements taken fasted
            '13:00': [  # Fat-soluble vitamins + minerals
                'Vitamin D3 + K2',
                'Zinc Bisglycinate',
                'Boron',
                'CoQ10 (Ubiquinol)',
                'Omega-3 (Fish Oil / EPA-DHA)',
            ],
            '18:00': ['Magnesium Taurate'],
            '21:30': ['Magnesium Taurate'],
        }

        # Map supplement names to IDs
        for time_slot, supplement_names in supplement_map.items():
            supplement_ids = []
            for name in supplement_names:
                iv = Intervention.objects.filter(user=user, name__icontains=name, ended_on__isnull=True).first()
                if iv:
                    supplement_ids.append(iv.id)
            supplement_map[time_slot] = supplement_ids

        self.stdout.write(f'\nImporting meal plan for {user.username}...')
        self.stdout.write(f'Profile: {profile.full_name}\n')

        created_count = 0
        skipped_count = 0

        for item in MEAL_PLAN:
            time_slot = item['time_slot']
            exists = MealTiming.objects.filter(
                user=user,
                profile=profile,
                time_slot=time_slot,
                is_active=True,
            ).exists()

            if exists:
                self.stdout.write(self.style.WARNING(f'  ⊘ {time_slot} {item["meal_name"]} — already exists'))
                skipped_count += 1
                continue

            if not options['dry_run']:
                meal = MealTiming.objects.create(
                    user=user,
                    profile=profile,
                    time_slot=time_slot,
                    meal_name=item['meal_name'],
                    meal_name_bg=item.get('meal_name_bg', ''),
                    description=item.get('description', ''),
                    description_bg=item.get('description_bg', ''),
                    nutritional_focus=item.get('nutritional_focus', []),
                    supplement_ids=supplement_map.get(time_slot, []),
                    water_ml=item.get('water_ml'),
                    suggested_foods=item.get('suggested_foods', []),
                    suggested_foods_bg=item.get('suggested_foods_bg', []),
                    notes=item.get('notes', ''),
                    notes_bg=item.get('notes_bg', ''),
                )
                self.stdout.write(self.style.SUCCESS(f'  ✓ {time_slot} {item["meal_name"]}'))
                created_count += 1
            else:
                self.stdout.write(f'  ✓ {time_slot} {item["meal_name"]} (would create)')
                created_count += 1

        self.stdout.write('\n' + '=' * 60)
        self.stdout.write(self.style.SUCCESS(f'Summary: {created_count} created, {skipped_count} skipped'))
        if options['dry_run']:
            self.stdout.write(self.style.WARNING('(Dry-run: no changes saved)'))
