from rest_framework import viewsets, mixins, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Count, Q
from datetime import timedelta
from .models import Document, get_smart_folders
from .serializers import DocumentSerializer
from properties.models import Property


class DocumentViewSet(mixins.ListModelMixin,
                      mixins.CreateModelMixin,
                      mixins.RetrieveModelMixin,
                      mixins.DestroyModelMixin,
                      viewsets.GenericViewSet):
    """List, upload, view, delete documents — no edit (re-upload instead)."""
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Document.objects.filter(property__user=self.request.user.get_data_owner()).select_related('property')
        property_id = self.request.query_params.get('property')
        if property_id:
            qs = qs.filter(property_id=property_id)
        document_type = self.request.query_params.get('type')
        if document_type:
            qs = qs.filter(document_type=document_type)
        # Search by label or notes
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(Q(label__icontains=search) | Q(notes__icontains=search))
        # Filter by expiry status
        expiry = self.request.query_params.get('expiry')
        if expiry:
            today = timezone.now().date()
            if expiry == 'expired':
                qs = qs.filter(expiry_date__lt=today)
            elif expiry == 'expiring_soon':
                qs = qs.filter(expiry_date__gte=today, expiry_date__lte=today + timedelta(days=30))
            elif expiry == 'valid':
                qs = qs.filter(expiry_date__gt=today + timedelta(days=30))
        return qs


class SmartFoldersView(APIView):
    """Return smart folder list for a property — based on property metadata."""
    permission_classes = [IsAuthenticated]

    def get(self, request, property_id):
        try:
            prop = Property.objects.get(pk=property_id, user=request.user.get_data_owner())
        except Property.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        folders = get_smart_folders(prop)

        # Add document counts per folder
        counts = dict(
            Document.objects.filter(property=prop)
            .values_list('document_type')
            .annotate(count=Count('id'))
            .values_list('document_type', 'count')
        )

        # Add expiry info per folder
        today = timezone.now().date()
        expiry_warnings = dict(
            Document.objects.filter(
                property=prop,
                expiry_date__isnull=False,
                expiry_date__lte=today + timedelta(days=30)
            )
            .values_list('document_type')
            .annotate(count=Count('id'))
            .values_list('document_type', 'count')
        )

        result = []
        for folder_type in folders:
            # Get display name from choices
            display = dict(Document.DOCUMENT_TYPES).get(folder_type, folder_type)
            result.append({
                'type': folder_type,
                'label': display,
                'count': counts.get(folder_type, 0),
                'expiry_warnings': expiry_warnings.get(folder_type, 0),
            })

        return Response(result)


class ComplianceSummaryView(APIView):
    """
    Cross-property compliance dashboard:
    - Total documents
    - Expired count
    - Expiring soon count (30 days)
    - Per-property breakdown
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        today = timezone.now().date()
        threshold = today + timedelta(days=30)

        docs = Document.objects.filter(property__user=user)
        total = docs.count()

        with_expiry = docs.filter(expiry_date__isnull=False)
        expired = with_expiry.filter(expiry_date__lt=today).count()
        expiring_soon = with_expiry.filter(expiry_date__gte=today, expiry_date__lte=threshold).count()
        valid = with_expiry.filter(expiry_date__gt=threshold).count()
        no_expiry = docs.filter(expiry_date__isnull=True).count()

        # Per-property breakdown
        properties = Property.objects.filter(user=user).order_by('name')
        by_property = []
        for prop in properties:
            prop_docs = docs.filter(property=prop)
            prop_expired = prop_docs.filter(expiry_date__lt=today).count()
            prop_expiring = prop_docs.filter(expiry_date__gte=today, expiry_date__lte=threshold).count()
            by_property.append({
                'id': prop.id,
                'name': prop.name,
                'total': prop_docs.count(),
                'expired': prop_expired,
                'expiring_soon': prop_expiring,
            })

        # Upcoming expirations (next 60 days, sorted by date)
        upcoming = (
            with_expiry
            .filter(expiry_date__gte=today, expiry_date__lte=today + timedelta(days=60))
            .select_related('property')
            .order_by('expiry_date')[:20]
        )
        upcoming_list = [
            {
                'id': d.id,
                'document_type': d.document_type,
                'label': d.label,
                'property_id': d.property_id,
                'property_name': d.property.name,
                'expiry_date': d.expiry_date.isoformat(),
                'days_remaining': (d.expiry_date - today).days,
            }
            for d in upcoming
        ]

        return Response({
            'total': total,
            'expired': expired,
            'expiring_soon': expiring_soon,
            'valid': valid,
            'no_expiry': no_expiry,
            'by_property': by_property,
            'upcoming_expirations': upcoming_list,
        })
