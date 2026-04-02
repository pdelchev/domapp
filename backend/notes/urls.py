from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    NoteViewSet, NoteFolderViewSet, NoteTagViewSet,
    NoteSummaryView, QuickCaptureView,
)

router = DefaultRouter()
router.register(r'notes/folders', NoteFolderViewSet, basename='note-folder')
router.register(r'notes/tags', NoteTagViewSet, basename='note-tag')
router.register(r'notes', NoteViewSet, basename='note')

urlpatterns = [
    # Custom endpoints BEFORE router to avoid conflicts
    path('notes/summary/', NoteSummaryView.as_view(), name='note-summary'),
    path('notes/quick-capture/', QuickCaptureView.as_view(), name='note-quick-capture'),
    path('', include(router.urls)),
]
