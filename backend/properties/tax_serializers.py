from rest_framework import serializers
from .tax_models import PropertyTax, TaxReminder, COUNTRY_TAX_PRESETS


class TaxReminderSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxReminder
        fields = ('id', 'remind_at', 'sent', 'sent_at')
        read_only_fields = fields


class PropertyTaxSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    monthly_equivalent = serializers.SerializerMethodField()
    property_name = serializers.CharField(source='property.name', read_only=True)
    reminders = TaxReminderSerializer(many=True, read_only=True)

    class Meta:
        model = PropertyTax
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')

    def get_display_name(self, obj):
        return obj.get_display_name()

    def get_status(self, obj):
        return obj.get_status()

    def get_monthly_equivalent(self, obj):
        return obj.get_monthly_equivalent()

    def create(self, validated_data):
        tax = super().create(validated_data)
        from .tax_services import sync_reminders
        sync_reminders(tax)
        return tax

    def update(self, instance, validated_data):
        tax = super().update(instance, validated_data)
        from .tax_services import sync_reminders
        sync_reminders(tax)
        return tax
