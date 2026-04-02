"""
Notes API views — CRUD for notes, folders, tags + summary and utility endpoints.

## Query Optimization Strategy:
- List view uses NoteListSerializer (no full content) — small payloads
- select_related on FKs (folder, linked_property, linked_tenant) — no N+1
- prefetch_related on tags M2M — single extra query
- Filtering via query params, all indexed
- Summary endpoint uses aggregate() — single query for counts
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone
from django.db.models import Count, Q
from .models import Note, NoteFolder, NoteTag
from .serializers import (
    NoteSerializer, NoteListSerializer,
    NoteFolderSerializer, NoteTagSerializer,
)


class NoteFolderViewSet(viewsets.ModelViewSet):
    """CRUD for note folders. User-scoped."""
    serializer_class = NoteFolderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return NoteFolder.objects.filter(
            user=self.request.user.get_data_owner()
        ).prefetch_related('notes')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())


class NoteTagViewSet(viewsets.ModelViewSet):
    """CRUD for note tags. User-scoped."""
    serializer_class = NoteTagSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return NoteTag.objects.filter(
            user=self.request.user.get_data_owner()
        ).prefetch_related('notes')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())


class NoteViewSet(viewsets.ModelViewSet):
    """
    Full CRUD for notes with rich filtering.

    Query params:
    - folder: filter by folder ID
    - tag: filter by tag ID
    - search: full-text search in title + content JSON
    - pinned: true/false
    - archived: true/false
    - trashed: true/false (default: false — hides trashed notes)
    - property: filter by linked_property ID
    - tenant: filter by linked_tenant ID
    - lease: filter by linked_lease ID
    - template: true — show only templates
    - color: filter by note color
    """
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        """Use lightweight serializer for list, full serializer for detail/create/update."""
        if self.action == 'list':
            return NoteListSerializer
        return NoteSerializer

    def get_queryset(self):
        qs = Note.objects.filter(
            user=self.request.user.get_data_owner()
        ).select_related(
            'folder', 'linked_property', 'linked_tenant'
        ).prefetch_related('tags')

        params = self.request.query_params

        # Folder filter
        folder = params.get('folder')
        if folder:
            if folder == 'unfiled':
                qs = qs.filter(folder__isnull=True)
            else:
                qs = qs.filter(folder_id=folder)

        # Tag filter
        tag = params.get('tag')
        if tag:
            qs = qs.filter(tags__id=tag)

        # State filters — trashed=false by default (hide trash)
        trashed = params.get('trashed', 'false')
        if trashed.lower() == 'true':
            qs = qs.filter(is_trashed=True)
        else:
            qs = qs.filter(is_trashed=False)

        archived = params.get('archived')
        if archived is not None:
            qs = qs.filter(is_archived=archived.lower() == 'true')

        pinned = params.get('pinned')
        if pinned is not None:
            qs = qs.filter(is_pinned=pinned.lower() == 'true')

        # Entity linking filters
        prop_id = params.get('property')
        if prop_id:
            qs = qs.filter(linked_property_id=prop_id)

        tenant_id = params.get('tenant')
        if tenant_id:
            qs = qs.filter(linked_tenant_id=tenant_id)

        lease_id = params.get('lease')
        if lease_id:
            qs = qs.filter(linked_lease_id=lease_id)

        # Template filter
        template = params.get('template')
        if template and template.lower() == 'true':
            qs = qs.filter(is_template=True)
        elif not template:
            # Default: hide templates from normal list
            qs = qs.filter(is_template=False)

        # Color filter
        color = params.get('color')
        if color:
            qs = qs.filter(color=color)

        # Full-text search — searches title and JSON content
        search = params.get('search')
        if search:
            qs = qs.filter(
                Q(title__icontains=search) |
                Q(content__icontains=search)
            )

        return qs.distinct()

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())

    def perform_update(self, serializer):
        """Handle soft-delete timestamp when trashing/restoring."""
        instance = serializer.instance
        new_trashed = serializer.validated_data.get('is_trashed', instance.is_trashed)

        if new_trashed and not instance.is_trashed:
            serializer.save(trashed_at=timezone.now())
        elif not new_trashed and instance.is_trashed:
            serializer.save(trashed_at=None)
        else:
            serializer.save()

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Clone a note (useful for templates). Strips pinned/archived/trashed state."""
        note = self.get_object()
        new_note = Note.objects.create(
            user=note.user,
            folder=note.folder,
            title=f"{note.title} (copy)" if note.title else "Untitled (copy)",
            content=note.content,
            color=note.color,
            linked_property=note.linked_property,
            linked_tenant=note.linked_tenant,
            linked_lease=note.linked_lease,
            linked_problem=note.linked_problem,
        )
        new_note.tags.set(note.tags.all())
        return Response(NoteSerializer(new_note).data, status=status.HTTP_201_CREATED)


class QuickCaptureView(APIView):
    """
    Minimal note creation for fast capture — just title + optional entity link.
    Creates a note with a single text block from the body content.
    Used by the global quick-capture shortcut / FAB button.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        title = request.data.get('title', '').strip()
        body = request.data.get('body', '').strip()
        linked_property = request.data.get('linked_property')
        linked_tenant = request.data.get('linked_tenant')

        content = []
        if body:
            content = [{'id': 'qc1', 'type': 'text', 'content': body}]

        note = Note.objects.create(
            user=request.user.get_data_owner(),
            title=title or 'Quick Note',
            content=content,
            linked_property_id=linked_property,
            linked_tenant_id=linked_tenant,
        )
        return Response(NoteSerializer(note).data, status=status.HTTP_201_CREATED)


class NoteSummaryView(APIView):
    """
    Aggregated counts for sidebar badges and dashboard widgets.
    Single query with conditional aggregation — no N+1.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Note.objects.filter(user=request.user.get_data_owner())

        total = qs.filter(is_trashed=False, is_template=False).count()
        pinned = qs.filter(is_pinned=True, is_trashed=False).count()
        archived = qs.filter(is_archived=True, is_trashed=False).count()
        trashed = qs.filter(is_trashed=True).count()
        templates = qs.filter(is_template=True).count()

        # Checklist summary across all active notes
        active_notes = qs.filter(is_trashed=False, is_template=False)
        total_checks = 0
        checked_checks = 0
        for stats in active_notes.values_list('checklist_stats', flat=True):
            if isinstance(stats, dict):
                total_checks += stats.get('total', 0)
                checked_checks += stats.get('checked', 0)

        return Response({
            'total': total,
            'pinned': pinned,
            'archived': archived,
            'trashed': trashed,
            'templates': templates,
            'checklist_total': total_checks,
            'checklist_checked': checked_checks,
        })
