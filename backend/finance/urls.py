from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RentPaymentViewSet, ExpenseViewSet, FinanceSummaryView, BatchMarkPaidView

router = DefaultRouter()
router.register(r'rent-payments', RentPaymentViewSet, basename='rent-payment')
router.register(r'expenses', ExpenseViewSet, basename='expense')

urlpatterns = [
    # Batch endpoint before router to avoid pk conflict
    path('rent-payments/batch-mark-paid/', BatchMarkPaidView.as_view(), name='batch-mark-paid'),
    path('finance/summary/', FinanceSummaryView.as_view(), name='finance-summary'),
    path('', include(router.urls)),
]