# backend/health/management/commands/create_demo_protocols.py

"""
Management command to create demo protocols for testing

Usage:
    python manage.py create_demo_protocols

Creates:
- Test user (testuser / testpass123)
- Genetic profile
- LDL Reduction Protocol (active)
- Sleep Optimization Protocol (active)
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from health.models import HealthProtocol, GeneticProfile
from datetime import datetime, timedelta

User = get_user_model()


class Command(BaseCommand):
    help = 'Create demo protocols for testing'

    def handle(self, *args, **options):
        # Get or create test user
        user, created = User.objects.get_or_create(
            username='testuser',
            defaults={
                'email': 'test@example.com',
                'first_name': 'Test',
                'last_name': 'User'
            }
        )

        if created:
            user.set_password('testpass123')
            user.save()
            self.stdout.write(self.style.SUCCESS(f'✅ Created user: {user.username}'))
        else:
            self.stdout.write(f'User already exists: {user.username}')

        # Create genetic profile
        genetic_profile, _ = GeneticProfile.objects.get_or_create(
            user=user,
            defaults={
                'cardiovascular_risk': 65,
                'metabolic_risk': 55,
                'inflammation_risk': 60,
                'longevity_potential': 70,
                'nutrient_absorption': {
                    'folate': 'MTHFR slow methylator - need 5-MTHF',
                    'vitamin_b12': 'normal',
                    'iron': 'normal',
                    'vitamin_d': 'higher requirements'
                },
                'cyp_metabolizer_status': {
                    'CYP2D6': 'normal',
                    'CYP3A4': 'normal',
                    'CYP2C9': 'slow'
                },
                'recommended_supplements': [
                    {'supplement': 'Folate (5-MTHF)', 'dose': '1000 mcg', 'reason': 'MTHFR slow'},
                    {'supplement': 'Omega-3', 'dose': '2g EPA/DHA', 'reason': 'Cardiovascular'},
                    {'supplement': 'Magnesium', 'dose': '400mg', 'reason': 'Sleep support'},
                ]
            }
        )

        self.stdout.write('✅ Genetic profile created/updated')

        # Create LDL Protocol
        ldl_protocol, created = HealthProtocol.objects.get_or_create(
            user=user,
            name='LDL Reduction Protocol',
            defaults={
                'description': 'Lower LDL cholesterol through supplements and diet following Mediterranean style eating',
                'status': 'active',
                'end_date': datetime.now().date() + timedelta(days=84),
                'daily_log_fields': ['mood', 'energy_level', 'supplements_taken', 'exercise_type', 'diet_notes'],
                'daily_requirements': {
                    'supplements': [
                        {'name': 'Red Yeast Rice', 'dose': '1200mg daily', 'reason': 'Clinical evidence for LDL -30%'},
                        {'name': 'Plant Sterols', 'dose': '2g daily', 'reason': 'Blocks cholesterol absorption'},
                        {'name': 'Omega-3', 'dose': '2g EPA/DHA', 'reason': 'Cardiovascular support'},
                    ],
                    'diet': ['Mediterranean diet emphasis', 'Limit saturated fat <10%', 'Include fatty fish 2-3x/week'],
                    'exercise': '30min cardio 4x/week, keep HR <140',
                    'sleep': '7-9 hours consistent sleep',
                },
                'baseline_biomarkers': {
                    'LDL': 180,
                    'HDL': 35,
                    'Triglycerides': 150,
                },
                'expected_outcomes': {
                    'LDL': {'baseline': 180, 'target': 100, 'timeline_weeks': 12},
                    'HDL': {'baseline': 35, 'target': 45, 'timeline_weeks': 12},
                },
                'confidence_score': 0.92,
                'evidence_sources': [
                    'Red Yeast Rice clinical trials 2023',
                    'Mediterranean diet evidence (PREDIMED)',
                    'User genetic profile low CV risk'
                ]
            }
        )

        if created:
            self.stdout.write(self.style.SUCCESS(f'✅ Created protocol: {ldl_protocol.name}'))
        else:
            self.stdout.write(f'Protocol already exists: {ldl_protocol.name}')

        # Create Sleep Protocol
        sleep_protocol, created = HealthProtocol.objects.get_or_create(
            user=user,
            name='Sleep Optimization Protocol',
            defaults={
                'description': 'Improve sleep quality and duration to support recovery and reduce inflammation',
                'status': 'active',
                'end_date': datetime.now().date() + timedelta(days=42),
                'daily_log_fields': ['mood', 'sleep_hours', 'sleep_quality', 'stress_level', 'supplements_taken'],
                'daily_requirements': {
                    'supplements': [
                        {'name': 'Magnesium Glycinate', 'dose': '400mg 2 hours before bed', 'reason': 'Promotes relaxation'},
                        {'name': 'L-Theanine', 'dose': '200mg before bed', 'reason': 'Non-drowsy relaxation'},
                    ],
                    'sleep': '7-9 hours, consistent bedtime (±30min)',
                    'avoid': 'Caffeine after 2pm, screens 1hr before bed',
                    'environment': 'Dark room, cool temp (18-19°C), white noise if needed',
                },
                'baseline_biomarkers': {
                    'sleep_hours': 6,
                    'sleep_quality': 5,
                },
                'expected_outcomes': {
                    'sleep_hours': {'baseline': 6, 'target': 7.5, 'timeline_weeks': 4},
                    'sleep_quality': {'baseline': 5, 'target': 8, 'timeline_weeks': 4},
                },
                'confidence_score': 0.85,
                'evidence_sources': [
                    'Magnesium glycinate sleep studies',
                    'Sleep hygiene best practices',
                    'User response to similar protocols'
                ]
            }
        )

        if created:
            self.stdout.write(self.style.SUCCESS(f'✅ Created protocol: {sleep_protocol.name}'))
        else:
            self.stdout.write(f'Protocol already exists: {sleep_protocol.name}')

        self.stdout.write(self.style.SUCCESS('\n✅ Demo protocols setup complete!\n'))
        self.stdout.write('Test Credentials:')
        self.stdout.write(f'  Username: {user.username}')
        self.stdout.write(f'  Password: testpass123')
        self.stdout.write(f'  Email: {user.email}')
        self.stdout.write('\nActive Protocols:')
        self.stdout.write(f'  1. {ldl_protocol.name}')
        self.stdout.write(f'  2. {sleep_protocol.name}')
        self.stdout.write('\nNext steps:')
        self.stdout.write('  1. Start servers: ./start.sh')
        self.stdout.write('  2. Login at http://localhost:3000')
        self.stdout.write('  3. Go to /health/checkin/protocol')
