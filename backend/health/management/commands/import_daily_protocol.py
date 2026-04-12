"""
Management command to bulk-import user's daily protocol supplements.
Usage: python manage.py import_daily_protocol --user <user_id>
"""

from datetime import date
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from health.models import Intervention, HealthProfile

User = get_user_model()

# Your complete daily protocol
DAILY_PROTOCOL = [
    # Morning 09:00 - Fasted
    {
        'name': 'Saxenda (GLP-1)',
        'category': 'medication',
        'dose': '1.2 mg',
        'frequency': 'daily',
        'reminder_times': ['09:30'],
        'evidence_grade': 'A',
        'notes': 'Fasted, morning injection. For weight management + metabolic health.',
    },
    {
        'name': 'NMN (NAD+ precursor)',
        'category': 'supplement',
        'dose': '250-500 mg',
        'frequency': 'daily',
        'reminder_times': ['09:00'],
        'evidence_grade': 'B',
        'notes': 'Fasted, morning. Supports mitochondrial function, NAD+ levels.',
        'target_metrics': ['energy', 'hrv', 'sleep_quality'],
    },
    {
        'name': 'Panax Ginseng',
        'category': 'supplement',
        'dose': '1-2 capsules',
        'frequency': 'daily',
        'reminder_times': ['09:00'],
        'evidence_grade': 'B',
        'notes': 'Fasted: 1 cap. Training days: 2 caps. Adaptogen for stress + physical performance.',
        'target_metrics': ['energy', 'training_capacity'],
    },

    # First meal 13:00 - With fat
    {
        'name': 'Vitamin D3 + K2',
        'category': 'supplement',
        'dose': 'D3: 2000-4000 IU, K2: 100 mcg',
        'frequency': 'daily',
        'reminder_times': ['13:00'],
        'evidence_grade': 'A',
        'notes': 'With fat meal. Bone health, cardiovascular, immunity.',
        'target_metrics': ['calcium_metabolism', 'cardiovascular_health'],
    },
    {
        'name': 'Zinc Bisglycinate',
        'category': 'supplement',
        'dose': '15-20 mg elemental',
        'frequency': 'daily',
        'reminder_times': ['13:00'],
        'evidence_grade': 'A',
        'notes': 'With meal. Highly absorbable form. Immunity, male fertility, wound healing.',
        'target_metrics': ['immune_function'],
    },
    {
        'name': 'Boron',
        'category': 'supplement',
        'dose': '3 mg',
        'frequency': 'daily',
        'reminder_times': ['13:00'],
        'evidence_grade': 'B',
        'notes': 'With meal. Testosterone, bone density, joint health.',
        'target_metrics': ['testosterone', 'bone_health'],
    },
    {
        'name': 'CoQ10 (Ubiquinol)',
        'category': 'supplement',
        'dose': '100-200 mg',
        'frequency': 'daily',
        'reminder_times': ['13:00'],
        'evidence_grade': 'A',
        'notes': 'With fat meal (enhanced absorption). Mitochondrial energy, heart, BP support.',
        'target_metrics': ['bp_control', 'energy', 'cardiovascular_health'],
    },
    {
        'name': 'Omega-3 (Fish Oil / EPA-DHA)',
        'category': 'supplement',
        'dose': '2-3g EPA+DHA',
        'frequency': 'daily',
        'reminder_times': ['13:00'],
        'evidence_grade': 'A',
        'notes': 'With meal. Anti-inflammatory, cardiovascular, brain health, triglycerides.',
        'target_metrics': ['triglycerides', 'inflammation', 'cardiovascular_health'],
    },

    # Last meal 18:00
    {
        'name': 'Magnesium Taurate',
        'category': 'supplement',
        'dose': '2 capsules (1 with meal + 1 before sleep)',
        'frequency': 'twice_daily',
        'reminder_times': ['18:00', '21:30'],
        'evidence_grade': 'A',
        'notes': '1 cap at dinner, 1 cap before bed. Cardioprotective, BP support, sleep, muscle relaxation.',
        'target_metrics': ['bp_diastolic', 'sleep_quality', 'muscle_recovery'],
    },

    # Pre-gym/sex - Optional
    {
        'name': 'L-Citrulline',
        'category': 'supplement',
        'dose': '6-8g powder',
        'frequency': 'as_needed',
        'reminder_times': [],
        'evidence_grade': 'A',
        'notes': 'Training days or before sex. 45-60 min before activity, fasted. Nitric oxide, blood flow, performance.',
        'target_metrics': ['training_performance', 'erectile_function'],
    },
]

class Command(BaseCommand):
    help = 'Bulk-import daily protocol supplements for a user'

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
            profile = HealthProfile.objects.create(
                user=user,
                full_name=user.get_full_name() or user.username,
                is_primary=True,
            )
            self.stdout.write(self.style.SUCCESS(f'Created primary profile: {profile.full_name}'))

        self.stdout.write(f'\nImporting {len(DAILY_PROTOCOL)} supplements for {user.username}...')
        self.stdout.write(f'Profile: {profile.full_name}\n')

        created_count = 0
        skipped_count = 0

        for item in DAILY_PROTOCOL:
            exists = Intervention.objects.filter(
                user=user,
                name__iexact=item['name'],
                ended_on__isnull=True,  # Only check active ones
            ).exists()

            if exists:
                self.stdout.write(self.style.WARNING(f'  ⊘ {item["name"]} — already exists'))
                skipped_count += 1
                continue

            if not options['dry_run']:
                intervention = Intervention.objects.create(
                    user=user,
                    profile=profile,
                    name=item['name'],
                    category=item['category'],
                    dose=item.get('dose', ''),
                    frequency=item.get('frequency', 'daily'),
                    reminder_times=item.get('reminder_times', []),
                    started_on=date.today(),
                    hypothesis=item.get('hypothesis', ''),
                    target_metrics=item.get('target_metrics', []),
                    evidence_grade=item.get('evidence_grade', 'B'),
                    notes=item.get('notes', ''),
                )
                self.stdout.write(self.style.SUCCESS(f'  ✓ {item["name"]}'))
                created_count += 1
            else:
                self.stdout.write(f'  ✓ {item["name"]} (would create)')
                created_count += 1

        self.stdout.write('\n' + '=' * 60)
        self.stdout.write(self.style.SUCCESS(f'Summary: {created_count} created, {skipped_count} skipped'))
        if options['dry_run']:
            self.stdout.write(self.style.WARNING('(Dry-run: no changes saved)'))
