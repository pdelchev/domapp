from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Avg
from django.utils import timezone
from datetime import timedelta
from .models import Measurement, FoodEntry, DailyRitual
from .serializers import MeasurementSerializer, FoodEntrySerializer, DailyRitualSerializer


class MeasurementViewSet(viewsets.ModelViewSet):
    serializer_class = MeasurementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Measurement.objects.filter(user=self.request.user.get_health_owner())
        mtype = self.request.query_params.get('type')
        if mtype:
            qs = qs.filter(measurement_type=mtype)
        date_from = self.request.query_params.get('from')
        if date_from:
            qs = qs.filter(measured_at__date__gte=date_from)
        date_to = self.request.query_params.get('to')
        if date_to:
            qs = qs.filter(measured_at__date__lte=date_to)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_health_owner())


class FoodEntryViewSet(viewsets.ModelViewSet):
    serializer_class = FoodEntrySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = FoodEntry.objects.filter(user=self.request.user.get_health_owner())
        date = self.request.query_params.get('date')
        if date:
            qs = qs.filter(eaten_at__date=date)
        meal = self.request.query_params.get('meal')
        if meal:
            qs = qs.filter(meal_type=meal)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_health_owner())


class DailyRitualViewSet(viewsets.ModelViewSet):
    serializer_class = DailyRitualSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = DailyRitual.objects.filter(user=self.request.user.get_health_owner())
        date = self.request.query_params.get('date')
        if date:
            qs = qs.filter(date=date)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_health_owner())


class HealthSummaryView(APIView):
    """Today's summary — calories, water, measurements, ritual completion."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user.get_health_owner()
        today = timezone.now().date()

        # Today's food
        food_today = FoodEntry.objects.filter(user=user, eaten_at__date=today)
        totals = food_today.aggregate(
            calories=Sum('calories'), protein=Sum('protein'),
            carbs=Sum('carbs'), fat=Sum('fat'), fiber=Sum('fiber')
        )

        # Today's ritual
        ritual = DailyRitual.objects.filter(user=user, date=today).first()

        # Latest measurements
        latest = {}
        for mtype in ['blood_pressure', 'weight', 'glucose', 'uric_acid', 'heart_rate']:
            m = Measurement.objects.filter(user=user, measurement_type=mtype).first()
            if m:
                latest[mtype] = {
                    'value': float(m.value),
                    'value2': float(m.value2) if m.value2 else None,
                    'unit': m.unit,
                    'measured_at': m.measured_at.isoformat(),
                }

        # 7-day averages
        week_ago = today - timedelta(days=7)
        week_food = FoodEntry.objects.filter(user=user, eaten_at__date__gte=week_ago)
        week_avg = week_food.aggregate(avg_cal=Avg('calories'))

        return Response({
            'today': {
                'calories': totals['calories'] or 0,
                'protein': float(totals['protein'] or 0),
                'carbs': float(totals['carbs'] or 0),
                'fat': float(totals['fat'] or 0),
                'fiber': float(totals['fiber'] or 0),
                'food_count': food_today.count(),
            },
            'ritual': DailyRitualSerializer(ritual).data if ritual else None,
            'latest_measurements': latest,
            'week_avg_calories': round(float(week_avg['avg_cal'] or 0)),
        })
