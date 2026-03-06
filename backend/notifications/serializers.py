from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='related_property.name', read_only=True, default=None)

    class Meta:
        model = Notification
        fields = ['id', 'type', 'title', 'message', 'related_object_id', 'related_property',
                  'property_name', 'read_status', 'created_at']
        read_only_fields = ('user', 'type', 'title', 'message', 'related_object_id',
                            'related_property', 'created_at')
