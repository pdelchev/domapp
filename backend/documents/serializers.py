from rest_framework import serializers
from django.utils import timezone
from .models import Document


class DocumentSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True)
    expiry_status = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            'id', 'property', 'property_name', 'file', 'file_name',
            'document_type', 'label', 'expiry_date', 'expiry_status',
            'notes', 'file_size', 'uploaded_at', 'replaces',
        ]
        read_only_fields = ('file_size', 'uploaded_at')

    def get_expiry_status(self, obj):
        """
        Compute expiry status:
        - 'expired' — expiry_date is in the past
        - 'expiring_soon' — expiry_date within 30 days
        - 'valid' — expiry_date > 30 days away
        - None — no expiry_date set
        """
        if not obj.expiry_date:
            return None
        today = timezone.now().date()
        days = (obj.expiry_date - today).days
        if days < 0:
            return 'expired'
        if days <= 30:
            return 'expiring_soon'
        return 'valid'

    def get_file_name(self, obj):
        if obj.file:
            name = obj.file.name.split('/')[-1]
            return name
        return None
