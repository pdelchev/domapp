"""
# ═══ VEHICLES URL ROUTING ═══
# Custom paths BEFORE router.urls to avoid shadowing by <pk> patterns.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    VehicleViewSet,
    VehicleSummaryView,
    VehicleCostReportView,
    VehicleExpiringView,
    VehiclePresetsView,
    VehicleObligationListCreateView,
    VehicleObligationDetailView,
    ObligationRenewView,
    ObligationFileUploadView,
    ObligationFileDeleteView,
)

router = DefaultRouter()
router.register(r'vehicles', VehicleViewSet, basename='vehicle')

urlpatterns = [
    # Analytics — must be before router
    path('vehicles/summary/', VehicleSummaryView.as_view(), name='vehicle-summary'),
    path('vehicles/cost-report/', VehicleCostReportView.as_view(), name='vehicle-cost-report'),
    path('vehicles/expiring/', VehicleExpiringView.as_view(), name='vehicle-expiring'),

    # Obligations CRUD
    path('vehicles/<int:vehicle_id>/obligations/', VehicleObligationListCreateView.as_view(), name='vehicle-obligations'),
    path('vehicles/<int:vehicle_id>/presets/', VehiclePresetsView.as_view(), name='vehicle-presets'),
    path('vehicles/obligations/<int:obligation_id>/', VehicleObligationDetailView.as_view(), name='obligation-detail'),
    path('vehicles/obligations/<int:obligation_id>/renew/', ObligationRenewView.as_view(), name='obligation-renew'),

    # File uploads
    path('vehicles/obligations/<int:obligation_id>/files/', ObligationFileUploadView.as_view(), name='obligation-files'),
    path('vehicles/obligations/files/<int:file_id>/', ObligationFileDeleteView.as_view(), name='obligation-file-delete'),

    # Router (Vehicle CRUD)
    path('', include(router.urls)),
]
