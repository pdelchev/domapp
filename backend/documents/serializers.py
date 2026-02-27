from rest_framework import serializers
from .models import Document


class DocumentSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True)

    class Meta:
        model = Document
        fields = '__all__'