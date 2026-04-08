from django.urls import path
from .views import DashboardSummaryView, MorningBriefingView

urlpatterns = [
    path('dashboard/summary/', DashboardSummaryView.as_view(), name='dashboard-summary'),
    path('dashboard/briefing/', MorningBriefingView.as_view(), name='morning-briefing'),
]