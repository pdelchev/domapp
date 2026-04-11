# backend/health/management/commands/test_insights.py

"""
Test AI insights generation

Usage:
    python manage.py test_insights                  # For testuser
    python manage.py test_insights --user=<username>
    python manage.py test_insights --generate=50    # Generate 50 days of test data

Output:
    - Creates dummy daily logs
    - Generates recommendations
    - Shows sample insights
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils.timezone import now
from datetime import timedelta
from health.models import DailyProtocolLog, HealthProtocol
from health.recommendation_service import RecommendationEngine
import random

User = get_user_model()


class Command(BaseCommand):
    help = 'Test AI insights generation'

    def add_arguments(self, parser):
        parser.add_argument('--user', type=str, default='testuser', help='Username')
        parser.add_argument('--generate', type=int, default=14, help='Days of test data')

    def handle(self, *args, **options):
        username = options['user']
        days = options['generate']

        # Get user
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'User {username} not found'))
            return

        self.stdout.write(f'\n🤖 AI INSIGHTS TEST FOR {user.username}\n')
        self.stdout.write('=' * 60)

        # Get active protocol
        protocol = HealthProtocol.objects.filter(
            user=user,
            status='active'
        ).first()

        if not protocol:
            self.stdout.write(self.style.ERROR('No active protocol found'))
            return

        self.stdout.write(f'Protocol: {protocol.name}\n')

        # Generate test data
        self.stdout.write(f'📊 Generating {days} days of test data...\n')

        for i in range(days):
            date = now().date() - timedelta(days=days - i - 1)

            # Create log with varying adherence
            mood = random.randint(4, 9)
            energy = random.randint(4, 9)
            stress = random.randint(2, 7)

            # Simulate weekend dips
            if date.weekday() >= 5:  # Weekends
                adherence = random.randint(30, 70)
            else:  # Weekdays
                adherence = random.randint(70, 100)

            log = DailyProtocolLog.objects.create(
                user=user,
                protocol=protocol,
                date=date,
                mood=mood,
                energy_level=energy,
                stress_level=stress,
                weight_kg=85.0 + random.uniform(-1, 1),
                systolic_bp=130 + random.randint(-10, 10),
                diastolic_bp=80 + random.randint(-5, 5),
                sleep_hours=6.5 + random.uniform(-1, 2),
                sleep_quality=random.randint(4, 8),
                supplements_taken={
                    'Red Yeast Rice': {'taken': random.choice([True, False]), 'time': '08:00'},
                    'Magnesium': {'taken': random.choice([True, False]), 'time': '21:00'},
                    'Omega-3': {'taken': random.choice([True, False]), 'time': '12:00'},
                },
                exercise_type='cardio' if random.random() > 0.3 else 'yoga',
                exercise_duration_min=30 if random.random() > 0.3 else 0,
                protocol_adherence_pct=adherence,
            )

            if i % 5 == 0:
                self.stdout.write(f'  ✓ {date} - Adherence: {adherence}%')

        self.stdout.write(f'\n✅ Created {days} test logs\n')

        # Generate insights
        self.stdout.write('🧠 Generating AI insights...\n')
        self.stdout.write('-' * 60)

        engine = RecommendationEngine(user)
        recommendations = engine.generate_recommendations()

        self.stdout.write(f'\n📌 Top Recommendations ({len(recommendations)} generated):\n')

        for i, rec in enumerate(recommendations[:5], 1):
            self.stdout.write(f'\n{i}. [{rec.priority.upper()}] {rec.title}')
            self.stdout.write(f'   Category: {rec.category}')
            self.stdout.write(f'   Evidence: {rec.evidence}')

            if rec.actionable_steps:
                self.stdout.write('   Steps:')
                for step in rec.actionable_steps[:2]:
                    if isinstance(step, dict):
                        self.stdout.write(f'     - {step.get("step")}: {step.get("detail")}')
                    else:
                        self.stdout.write(f'     - {step}')

            if rec.expected_impact:
                self.stdout.write(f'   Expected Impact: {rec.expected_impact}')

        # Summary
        self.stdout.write('\n' + '=' * 60)
        self.stdout.write(f'\n✨ Insights Summary:\n')
        self.stdout.write(f'  Total recommendations: {len(recommendations)}')
        self.stdout.write(f'  Critical: {sum(1 for r in recommendations if r.priority == "critical")}')
        self.stdout.write(f'  High: {sum(1 for r in recommendations if r.priority == "high")}')
        self.stdout.write(f'  Medium: {sum(1 for r in recommendations if r.priority == "medium")}')
        self.stdout.write(f'  Low: {sum(1 for r in recommendations if r.priority == "low")}')

        self.stdout.write(f'\n💾 All recommendations saved to database.\n')
        self.stdout.write(f'   View at: /api/health/protocol/recommendations/\n')

        self.stdout.write(self.style.SUCCESS('\n✅ Test complete!\n'))
