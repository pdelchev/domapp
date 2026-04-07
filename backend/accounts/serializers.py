from rest_framework import serializers
from django.contrib.auth import get_user_model

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ('id', 'email', 'username', 'full_name', 'phone', 'password')

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password'],
            first_name=validated_data.get('full_name', ''),
            phone=validated_data.get('phone', ''),
        )
        return user


class UserSerializer(serializers.ModelSerializer):
    allowed_modules = serializers.JSONField(required=False)

    class Meta:
        model = User
        fields = ('id', 'email', 'username', 'first_name', 'phone', 'role',
                  'allowed_modules', 'own_health_data', 'avatar_color')


class SubAccountSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating sub-accounts under a parent user."""
    password = serializers.CharField(write_only=True, min_length=8, required=False)
    allowed_modules = serializers.JSONField(required=False)

    class Meta:
        model = User
        fields = ('id', 'email', 'username', 'first_name', 'phone', 'role',
                  'allowed_modules', 'own_health_data', 'avatar_color', 'password')
        read_only_fields = ('id',)

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        parent = self.context['parent_user']
        user = User(
            username=validated_data.get('username', ''),
            email=validated_data.get('email', ''),
            first_name=validated_data.get('first_name', ''),
            phone=validated_data.get('phone', ''),
            role=validated_data.get('role', 'viewer'),
            allowed_modules=validated_data.get('allowed_modules', []),
            own_health_data=validated_data.get('own_health_data', True),
            avatar_color=validated_data.get('avatar_color', 'indigo'),
            data_owner=parent,
        )
        if password:
            user.set_password(password)
        user.save()
        return user
