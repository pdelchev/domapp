from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PropertyOwnerViewSet, PropertyViewSet, UnitViewSet, ParseNotaryDeedView
from .tax_views import (
    PropertyTaxListView, PropertyTaxDetailView, PropertyTaxMarkPaidView,
    PropertyTaxPresetsView, CountryTaxInfoView, TaxSummaryView,
)

router = DefaultRouter()
router.register(r'owners', PropertyOwnerViewSet, basename='owner')
router.register(r'properties', PropertyViewSet, basename='property')
router.register(r'units', UnitViewSet, basename='unit')

urlpatterns = [
    path('', include(router.urls)),
    # Notary deed parser
    path('properties/parse-notary-deed/', ParseNotaryDeedView.as_view(), name='parse-notary-deed'),
    # Property taxes
    path('properties/<int:property_id>/taxes/', PropertyTaxListView.as_view(), name='property-tax-list'),
    path('properties/<int:property_id>/taxes/presets/', PropertyTaxPresetsView.as_view(), name='property-tax-presets'),
    path('taxes/<int:tax_id>/', PropertyTaxDetailView.as_view(), name='property-tax-detail'),
    path('taxes/<int:tax_id>/mark-paid/', PropertyTaxMarkPaidView.as_view(), name='property-tax-mark-paid'),
    path('taxes/country-info/', CountryTaxInfoView.as_view(), name='tax-country-info'),
    path('taxes/summary/', TaxSummaryView.as_view(), name='tax-summary'),
]
