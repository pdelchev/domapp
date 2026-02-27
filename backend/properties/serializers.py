from rest_framework import serializers
from .models import PropertyOwner, Property, Unit


class PropertyOwnerSerializer(serializers.ModelSerializer):
    properties_count = serializers.SerializerMethodField()

    class Meta:
        model = PropertyOwner
        fields = '__all__'
        read_only_fields = ('user', 'created_at')

    def get_properties_count(self, obj):
        return obj.properties.count()


class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = '__all__'


class PropertySerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source='owner.full_name', read_only=True)
    price_per_sqm = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    units = UnitSerializer(many=True, read_only=True)

    class Meta:
        model = Property
        fields = '__all__'
        read_only_fields = ('user', 'created_at')