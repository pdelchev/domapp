from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser
from .models import PropertyOwner, Property, Unit
from .serializers import PropertyOwnerSerializer, PropertySerializer, UnitSerializer
from .notary_parser import parse_notary_deed


class PropertyOwnerViewSet(viewsets.ModelViewSet):
    """CRUD for property owners — scoped to the logged-in manager."""
    serializer_class = PropertyOwnerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return PropertyOwner.objects.filter(user=self.request.user.get_data_owner())

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())


class PropertyViewSet(viewsets.ModelViewSet):
    """CRUD for properties — scoped to the logged-in manager."""
    serializer_class = PropertySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Property.objects.filter(user=self.request.user.get_data_owner()).select_related('owner')
        owner_id = self.request.query_params.get('owner')
        if owner_id:
            qs = qs.filter(owner_id=owner_id)
        return qs

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