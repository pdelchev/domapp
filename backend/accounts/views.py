from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from .serializers import RegisterSerializer, UserSerializer, SubAccountSerializer

User = get_user_model()


class RegisterView(APIView):
    """Register a new user (property manager)."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user).data,
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                }
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MeView(APIView):
    """Get current logged-in user info including permissions."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = UserSerializer(request.user).data
        data['is_admin'] = request.user.role == 'admin'
        data['effective_modules'] = request.user.get_allowed_modules()
        return Response(data)

    def patch(self, request):
        """Update own profile (name, phone, avatar_color)."""
        allowed_fields = {'first_name', 'phone', 'avatar_color'}
        update_data = {k: v for k, v in request.data.items() if k in allowed_fields}
        for field, value in update_data.items():
            setattr(request.user, field, value)
        request.user.save(update_fields=list(update_data.keys()))
        return Response(UserSerializer(request.user).data)


class LogoutView(APIView):
    """Blacklist the refresh token to log out."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({'detail': 'Logged out.'}, status=status.HTTP_200_OK)
        except Exception:
            return Response({'detail': 'Logged out.'}, status=status.HTTP_200_OK)


class SubAccountListView(APIView):
    """List and create sub-accounts under the current user."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List all sub-accounts (delegates) under this user."""
        if request.user.role != 'admin':
            return Response({'error': 'Only admins can manage sub-accounts'}, status=status.HTTP_403_FORBIDDEN)
        subs = User.objects.filter(data_owner=request.user).order_by('first_name')
        return Response(SubAccountSerializer(subs, many=True).data)

    def post(self, request):
        """Create a new sub-account under this user."""
        if request.user.role != 'admin':
            return Response({'error': 'Only admins can create sub-accounts'}, status=status.HTTP_403_FORBIDDEN)
        serializer = SubAccountSerializer(data=request.data, context={'parent_user': request.user})
        if serializer.is_valid():
            user = serializer.save()
            return Response(SubAccountSerializer(user).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SubAccountDetailView(APIView):
    """Update or delete a specific sub-account."""
    permission_classes = [IsAuthenticated]

    def get_sub(self, request, user_id):
        if request.user.role != 'admin':
            return None
        try:
            return User.objects.get(pk=user_id, data_owner=request.user)
        except User.DoesNotExist:
            return None

    def put(self, request, user_id):
        sub = self.get_sub(request, user_id)
        if not sub:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        allowed_fields = {'first_name', 'email', 'phone', 'role', 'allowed_modules',
                          'own_health_data', 'avatar_color'}
        for field, value in request.data.items():
            if field in allowed_fields:
                setattr(sub, field, value)
        if 'password' in request.data and request.data['password']:
            sub.set_password(request.data['password'])
        sub.save()
        return Response(SubAccountSerializer(sub).data)

    def delete(self, request, user_id):
        sub = self.get_sub(request, user_id)
        if not sub:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        sub.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
