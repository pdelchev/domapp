from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import NotificationViewSet, UnreadCountView, MarkAllReadView, DismissNotificationView

router = DefaultRouter()
router.register(r'notifications', NotificationViewSet, basename='notification')

urlpatterns = [
    path('notifications/unread-count/', UnreadCountView.as_view(), name='notification-unread-count'),
    path('notifications/mark-all-read/', MarkAllReadView.as_view(), name='notification-mark-all-read'),
    path('notifications/<int:pk>/dismiss/', DismissNotificationView.as_view(), name='notification-dismiss'),
    path('', include(router.urls)),
]
