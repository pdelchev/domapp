"""
Seed 9 biomarker-focused health supplements to user's cabinet.
These supplements are tailored for metabolic health, liver support, BP control, and gout prevention.

Usage:
  python manage.py seed_health_supplements
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from health.daily_models import Supplement

User = get_user_model()

HEALTH_SUPPLEMENTS = [
    {
        'name': 'Vitamin D3',
        'dose': '2000-4000 IU',
        'category': 'supplement',
        'form': 'capsule',
        'description': 'Immune support + insulin sensitivity + liver health',
    },
    {
        'name': 'Omega-3 Fish Oil',
        'dose': '2000mg (EPA+DHA)',
        'category': 'supplement',
        'form': 'capsule',
        'description': 'Anti-inflammatory + liver support + triglyceride control',
    },
    {
        'name': 'Milk Thistle (Silymarin)',
        'dose': '140mg x2 daily',
        'category': 'herb',
        'form': 'capsule',
        'description': 'Liver detoxification + ALT/AST normalization',
    },
    {
        'name': 'Magnesium Glycinate',
        'dose': '400mg',
        'category': 'mineral',
        'form': 'capsule',
        'description': 'Blood pressure + insulin sensitivity + uric acid control',
    },
    {
        'name': 'Zinc',
        'dose': '25mg',
        'category': 'mineral',
        'form': 'capsule',
        'description': 'Immune support + glucose metabolism + protein synthesis',
    },
    {
        'name': 'Berberine',
        'dose': '500mg x2',
        'category': 'supplement',
        'form': 'capsule',
        'description': 'Glucose control + metabolic improvement (natural metformin)',
    },
    {
        'name': 'Cherry Extract',
        'dose': '500mg',
        'category': 'supplement',
        'form': 'capsule',
        'description': 'Uric acid reduction + antioxidant + inflammation control',
    },
    {
        'name': 'CoQ10 (Heart Formula)',
        'dose': '100-200mg',
        'category': 'supplement',
        'form': 'capsule',
        'description': 'Blood pressure + cardiovascular + heart function',
    },
    {
        'name': 'Potassium',
        'dose': '3500-5000mg (from food)',
        'category': 'mineral',
        'form': 'tablet',
        'description': 'Blood pressure + electrolyte balance + sodium counterbalance',
    },
]


class Command(BaseCommand):
    help = 'Seed 9 biomarker-focused health supplements to admin user cabinet'

    def add_arguments(self, parser):
        parser.add_argument('--user-id', type=int, default=1, help='User ID to add supplements to (default: 1)')

    def handle(self, *args, **options):
        user_id = options['user_id']

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'User with ID {user_id} not found'))
            return

        created_count = 0
        skipped_count = 0

        for supp_data in HEALTH_SUPPLEMENTS:
            # Delete existing duplicates for this name
            Supplement.objects.filter(user=user, name=supp_data['name']).delete()

            # Create the supplement
            supp = Supplement.objects.create(
                user=user,
                name=supp_data['name'],
                strength=supp_data['dose'],
                category=supp_data['category'],
                form=supp_data['form'],
                notes=supp_data['description'],
                is_active=True,
            )
            created = True

            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'✓ Created: {supp.name}'))
            else:
                skipped_count += 1
                self.stdout.write(self.style.WARNING(f'⊘ Already exists: {supp.name}'))

        self.stdout.write(self.style.SUCCESS(f'\n✅ Complete! Created: {created_count}, Skipped: {skipped_count}'))
