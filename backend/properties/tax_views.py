from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Property
from .tax_models import PropertyTax, COUNTRY_TAX_PRESETS, TAX_TYPE_CHOICES
from .tax_serializers import PropertyTaxSerializer
from .tax_services import create_country_presets, mark_paid, get_tax_summary, sync_reminders


class PropertyTaxListView(APIView):
    """GET: List taxes for a property. POST: Create a new tax."""
    permission_classes = [IsAuthenticated]

    def get(self, request, property_id):
        prop = Property.objects.filter(
            id=property_id, user=request.user.get_data_owner()
        ).first()
        if not prop:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        taxes = PropertyTax.objects.filter(property=prop)
        current_only = request.query_params.get('current')
        if current_only == 'true':
            taxes = taxes.filter(is_current=True)
        tax_type = request.query_params.get('type')
        if tax_type:
            taxes = taxes.filter(tax_type=tax_type)

        serializer = PropertyTaxSerializer(taxes, many=True)
        return Response(serializer.data)

    def post(self, request, property_id):
        prop = Property.objects.filter(
            id=property_id, user=request.user.get_data_owner()
        ).first()
        if not prop:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data.copy()
        data['property'] = prop.id
        serializer = PropertyTaxSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PropertyTaxDetailView(APIView):
    """GET, PUT, DELETE for a single tax."""
    permission_classes = [IsAuthenticated]

    def _get_tax(self, request, tax_id):
        return PropertyTax.objects.filter(
            id=tax_id, property__user=request.user.get_data_owner()
        ).select_related('property').first()

    def get(self, request, tax_id):
        tax = self._get_tax(request, tax_id)
        if not tax:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(PropertyTaxSerializer(tax).data)

    def put(self, request, tax_id):
        tax = self._get_tax(request, tax_id)
        if not tax:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = PropertyTaxSerializer(tax, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, tax_id):
        tax = self._get_tax(request, tax_id)
        if not tax:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        tax.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PropertyTaxMarkPaidView(APIView):
    """POST: Mark a tax as paid."""
    permission_classes = [IsAuthenticated]

    def post(self, request, tax_id):
        tax = PropertyTax.objects.filter(
            id=tax_id, property__user=request.user.get_data_owner()
        ).first()
        if not tax:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        paid_until = request.data.get('paid_until')
        mark_paid(tax, paid_until=paid_until)
        return Response(PropertyTaxSerializer(tax).data)


class PropertyTaxPresetsView(APIView):
    """POST: Create country-specific tax presets for a property."""
    permission_classes = [IsAuthenticated]

    def post(self, request, property_id):
        prop = Property.objects.filter(
            id=property_id, user=request.user.get_data_owner()
        ).first()
        if not prop:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        created = create_country_presets(prop)
        serializer = PropertyTaxSerializer(created, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CountryTaxInfoView(APIView):
    """GET: Get available tax types and presets for a country."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        country = request.query_params.get('country', '')
        presets = COUNTRY_TAX_PRESETS.get(country, [])

        # Add display names
        type_display = dict(TAX_TYPE_CHOICES)
        result = []
        for p in presets:
            result.append({
                'tax_type': p['tax_type'],
                'tax_type_display': type_display.get(p['tax_type'], p['tax_type']),
                'frequency': p['frequency'],
                'helper_text': p.get('helper_text', ''),
                'helper_text_en': p.get('helper_text_en', ''),
                'authority_hint': p.get('authority_hint', ''),
            })
        return Response(result)


class TaxSummaryView(APIView):
    """GET: Tax compliance summary across all properties."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        summary = get_tax_summary(request.user.get_data_owner())
        return Response(summary)
