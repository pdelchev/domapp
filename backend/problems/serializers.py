from rest_framework import serializers
from .models import Problem


class ProblemSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True)

    class Meta:
        model = Problem
        fields = [
            'id', 'property', 'property_name', 'title', 'description',
            'category', 'priority', 'status', 'reported_by',
            'estimated_cost', 'actual_cost', 'assigned_to',
            'resolution_notes', 'resolved_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = ('user', 'created_at', 'updated_at')
