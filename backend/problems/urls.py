from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProblemViewSet, ProblemSummaryView

router = DefaultRouter()
router.register(r'problems', ProblemViewSet, basename='problem')

urlpatterns = [
    path('problems/summary/', ProblemSummaryView.as_view(), name='problem-summary'),
    path('', include(router.urls)),
]
