from rest_framework import serializers
from .models import Measurement, FoodEntry, DailyRitual


class MeasurementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Measurement
        fields = '__all__'
        read_only_fields = ['user', 'created_at']


class FoodEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = FoodEntry
        fields = '__all__'
        read_only_fields = ['user', 'created_at']


class DailyRitualSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyRitual
        fields = '__all__'
        read_only_fields = ['user', 'created_at']
