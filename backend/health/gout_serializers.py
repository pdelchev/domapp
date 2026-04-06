from rest_framework import serializers
from .gout_models import GoutAttack, AttackTrigger, UricAcidReading, MedicalProcedure


class AttackTriggerSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttackTrigger
        fields = ('id', 'category', 'name', 'notes')


class GoutAttackSerializer(serializers.ModelSerializer):
    triggers = AttackTriggerSerializer(many=True, read_only=True)
    duration_days = serializers.SerializerMethodField()
    is_resolved = serializers.SerializerMethodField()
    joint_display = serializers.CharField(source='get_joint_display', read_only=True)
    side_display = serializers.CharField(source='get_side_display', read_only=True)
    medication_display = serializers.SerializerMethodField()

    class Meta:
        model = GoutAttack
        fields = '__all__'
        read_only_fields = ('user', 'created_at', 'updated_at')

    def get_duration_days(self, obj):
        return obj.get_duration_days()

    def get_is_resolved(self, obj):
        return obj.get_is_resolved()

    def get_medication_display(self, obj):
        if obj.medication:
            return obj.get_medication_display()
        return ''


class GoutAttackCreateSerializer(serializers.ModelSerializer):
    """Create serializer that also accepts nested triggers."""
    triggers = AttackTriggerSerializer(many=True, required=False)

    class Meta:
        model = GoutAttack
        fields = '__all__'
        read_only_fields = ('user', 'created_at', 'updated_at')

    def create(self, validated_data):
        triggers_data = validated_data.pop('triggers', [])
        attack = GoutAttack.objects.create(**validated_data)
        for trigger in triggers_data:
            AttackTrigger.objects.create(attack=attack, **trigger)
        return attack

    def update(self, instance, validated_data):
        triggers_data = validated_data.pop('triggers', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if triggers_data is not None:
            instance.triggers.all().delete()
            for trigger in triggers_data:
                AttackTrigger.objects.create(attack=instance, **trigger)
        return instance


class UricAcidReadingSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()

    class Meta:
        model = UricAcidReading
        fields = '__all__'
        read_only_fields = ('user', 'created_at')

    def get_status(self, obj):
        return obj.get_status()


class MedicalProcedureSerializer(serializers.ModelSerializer):
    procedure_type_display = serializers.CharField(source='get_procedure_type_display', read_only=True)
    joint_display = serializers.SerializerMethodField()

    class Meta:
        model = MedicalProcedure
        fields = '__all__'
        read_only_fields = ('user', 'created_at')

    def get_joint_display(self, obj):
        return obj.get_joint_display() if obj.joint else ''
