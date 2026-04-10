from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    RentPaymentViewSet, ExpenseViewSet, FinanceSummaryView,
    BatchMarkPaidView, ExpenseForecastView, CollectionHeatmapView,
    PropertyReportView, TaxReportView, AnnualReportView,
)

router = DefaultRouter()
router.register(r'rent-payments', RentPaymentViewSet, basename='rent-payment')
router.register(r'expenses', ExpenseViewSet, basename='expense')

urlpatterns = [
    # Batch endpoint before router to avoid pk conflict
    path('rent-payments/batch-mark-paid/', BatchMarkPaidView.as_view(), name='batch-mark-paid'),
    path('finance/summary/', FinanceSummaryView.as_view(), name='finance-summary'),
    path('finance/forecast/', ExpenseForecastView.as_view(), name='expense-forecast'),
    path('finance/collection-heatmap/', CollectionHeatmapView.as_view(), name='collection-heatmap'),
    path('reports/property/<int:property_id>/', PropertyReportView.as_view(), name='property-report'),
    path('reports/tax/', TaxReportView.as_view(), name='tax-report'),
    path('reports/annual/', AnnualReportView.as_view(), name='annual-report'),
    path('', include(router.urls)),
]