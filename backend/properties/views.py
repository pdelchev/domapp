from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser
from django.http import Http404
from .models import PropertyOwner, Property, Unit
from .serializers import PropertyOwnerSerializer, PropertySerializer, UnitSerializer
from .notary_parser import parse_notary_deed


class ObjectPermissionMixin:
    """Mixin to filter querysets by per-object permissions."""

    def filter_by_object_permissions(self, qs, object_type: str):
        """
        Filter queryset by user's per-object permissions.
        If user has no restrictions (empty allowed_ids list), return all.
        If user has admin role, return all.
        Otherwise, filter by allowed_ids.
        """
        user = self.request.user

        # Admin has no restrictions
        if user.role == 'admin':
            return qs

        # Get allowed IDs based on object type
        allowed_ids = getattr(user, f'allowed_{object_type}_ids', [])

        # Empty list = all objects (backwards compat)
        if not allowed_ids:
            return qs

        # Filter by allowed IDs
        return qs.filter(id__in=allowed_ids)

    def check_object_permission(self, obj, object_type: str):
        """Check if user has access to a specific object. Raise 404 if not."""
        user = self.request.user

        # Admin has no restrictions
        if user.role == 'admin':
            return

        # Get allowed IDs
        allowed_ids = getattr(user, f'allowed_{object_type}_ids', [])

        # Empty list = all objects
        if not allowed_ids:
            return

        # Check if object ID is in allowed list
        if obj.id not in allowed_ids:
            raise Http404(f'You do not have access to this {object_type}')


class PropertyOwnerViewSet(viewsets.ModelViewSet):
    """CRUD for property owners — scoped to the logged-in manager."""
    serializer_class = PropertyOwnerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return PropertyOwner.objects.filter(user=self.request.user.get_data_owner())

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())


class PropertyViewSet(ObjectPermissionMixin, viewsets.ModelViewSet):
    """CRUD for properties — scoped to the logged-in manager + per-object permissions."""
    serializer_class = PropertySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Property.objects.filter(user=self.request.user.get_data_owner()).select_related('owner')
        owner_id = self.request.query_params.get('owner')
        if owner_id:
            qs = qs.filter(owner_id=owner_id)
        # Filter by per-object permissions
        qs = self.filter_by_object_permissions(qs, 'property')
        return qs

    def retrieve(self, request, *args, **kwargs):
        """Check permission before returning object."""
        response = super().retrieve(request, *args, **kwargs)
        obj = self.get_object()
        self.check_object_permission(obj, 'property')
        return response

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())


class ParseNotaryDeedView(APIView):
    """Parse a Bulgarian notary deed PDF and return extracted property fields."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    ALLOWED_EXTENSIONS = ('.pdf', '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif', '.heic')

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)

        if not file.name.lower().endswith(self.ALLOWED_EXTENSIONS):
            return Response(
                {'error': 'Supported formats: PDF, JPG, PNG, WEBP, BMP, TIFF, HEIC'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = parse_notary_deed(file)
        return Response(result)


class UnitViewSet(viewsets.ModelViewSet):
    """CRUD for units — scoped to manager's properties."""
    serializer_class = UnitSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Unit.objects.filter(property__user=self.request.user.get_data_owner())
        property_id = self.request.query_params.get('property')
        if property_id:
            qs = qs.filter(property_id=property_id)
        return qs