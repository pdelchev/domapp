from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PortfolioViewSet,
    HoldingViewSet,
    TransactionViewSet,
    WatchlistItemViewSet,
    PriceAlertViewSet,
    DashboardView,
    TaxReportView,
)

router = DefaultRouter()
router.register(r'portfolios', PortfolioViewSet, basename='portfolio')
router.register(r'holdings', HoldingViewSet, basename='holding')
router.register(r'transactions', TransactionViewSet, basename='transaction')
router.register(r'watchlist', WatchlistItemViewSet, basename='watchlist')
router.register(r'price-alerts', PriceAlertViewSet, basename='price-alert')

urlpatterns = [
    path('', include(router.urls)),
    path('investment-dashboard/', DashboardView.as_view(), name='investment-dashboard'),
    path('tax-report/', TaxReportView.as_view(), name='tax-report'),
]
