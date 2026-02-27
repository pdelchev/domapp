from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RentPaymentViewSet, ExpenseViewSet

router = DefaultRouter()
router.register(r'rent-payments', RentPaymentViewSet, basename='rent-payment')
router.register(r'expenses', ExpenseViewSet, basename='expense')

urlpatterns = [
    path('', include(router.urls)),
]