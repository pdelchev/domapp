from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .gout_views import (
    GoutAttackViewSet, AttackTriggerViewSet,
    UricAcidViewSet, MedicalProcedureViewSet,
    GoutDashboardView, GoutStatisticsView,
)

router = DefaultRouter()
router.register(r'attacks', GoutAttackViewSet, basename='gout-attack')
router.register(r'triggers', AttackTriggerViewSet, basename='gout-trigger')
router.register(r'uric-acid', UricAcidViewSet, basename='uric-acid')
router.register(r'procedures', MedicalProcedureViewSet, basename='gout-procedure')

urlpatterns = [
    path('dashboard/', GoutDashboardView.as_view(), name='gout-dashboard'),
    path('statistics/', GoutStatisticsView.as_view(), name='gout-statistics'),
    path('', include(router.urls)),
]
