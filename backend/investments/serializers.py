from rest_framework import serializers
from .models import Investment


class InvestmentSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True, default=None)

    class Meta:
        model = Investment
        fields = '__all__'
        read_only_fields = ['user']
