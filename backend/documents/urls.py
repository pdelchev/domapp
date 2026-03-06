from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DocumentViewSet, SmartFoldersView, ComplianceSummaryView

router = DefaultRouter()
router.register(r'documents', DocumentViewSet, basename='document')

urlpatterns = [
    path('documents/smart-folders/<int:property_id>/', SmartFoldersView.as_view(), name='smart-folders'),
    path('documents/compliance/', ComplianceSummaryView.as_view(), name='compliance-summary'),
    path('', include(router.urls)),
]
