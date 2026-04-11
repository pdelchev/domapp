"""
Notes app models — block-based note system with folders, tags, and entity linking.

## Architecture Decision: JSON Content Blocks
Content is stored as a JSON array of typed blocks (text, heading, checklist, bullet,
table, divider, code). This approach was chosen over:
- HTML: hard to query, XSS-prone, can't aggregate checklist state
- Markdown: poor table support, no checkbox state, requires parsing
- Normalized block tables: N+1 queries, complex migrations for new types

JSON blocks give us: instant render (no parsing), queryable checklist state via
Django JSONField lookups, zero-migration new block types, and small payload size.

## Block Schema
[
  {"id": "uuid", "type": "text", "content": "..."},
  {"id": "uuid", "type": "heading", "content": "...", "level": 2},
  {"id": "uuid", "type": "checklist", "items": [{"id": "uuid", "text": "...", "checked": bool}]},
  {"id": "uuid", "type": "bullet", "items": [{"id": "uuid", "text": "..."}]},
  {"id": "uuid", "type": "table", "headers": [...], "rows": [[...], ...]},
  {"id": "uuid", "type": "divider"},
  {"id": "uuid", "type": "code", "content": "..."}
]

## Entity Linking
Notes can optionally link to Property, Tenant, Lease, or Problem via nullable FKs.
This enables contextual note surfacing on entity detail pages and cross-entity search.
SET_NULL on delete — note survives if linked entity is removed.
"""

from django.db import models
from django.conf import settings


class NoteFolder(models.Model):
    """
    Hierarchical folder for organizing notes.
    Supports one level of nesting (parent FK) and custom colors/icons.
    Position field enables manual drag-reorder in the sidebar.
    """
    COLOR_CHOICES = [
        ('gray', 'Gray'),
        ('red', 'Red'),
        ('orange', 'Orange'),
        ('yellow', 'Yellow'),
        ('green', 'Green'),
        ('blue', 'Blue'),
        ('indigo', 'Indigo'),
        ('purple', 'Purple'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='note_folders'
    )
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=20, choices=COLOR_CHOICES, default='gray')
    icon = models.CharField(max_length=50, blank=True, default='')
    parent = models.ForeignKey(
        'self', null=True, blank=True,
        on_delete=models.CASCADE,
        related_name='children'
    )
    position = models.IntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['position', 'name']
        indexes = [
            models.Index(fields=['user', 'position']),
        ]

    def __str__(self):
        return self.name


class NoteTag(models.Model):
    """
    Lightweight tag for cross-cutting note organization.
    Tags are user-scoped and color-coded for visual scanning.
    M2M relationship with Note enables multi-tag filtering.
    """
    COLOR_CHOICES = [
        ('gray', 'Gray'),
        ('red', 'Red'),
        ('orange', 'Orange'),
        ('yellow', 'Yellow'),
        ('green', 'Green'),
        ('blue', 'Blue'),
        ('indigo', 'Indigo'),
        ('purple', 'Purple'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='note_tags'
    )
    name = models.CharField(max_length=50)
    color = models.CharField(max_length=20, choices=COLOR_CHOICES, default='gray')

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        unique_together = ['user', 'name']

    def __str__(self):
        return self.name


class Note(models.Model):
    """
    Core note entity with block-based JSON content and entity linking.

    ## Key Design Decisions:
    - content: JSONField stores array of typed blocks (see module docstring)
    - checklist_stats: denormalized {total, checked} for list-view progress bars
      without deserializing full content. Updated on every save via save() override.
    - Entity FKs (linked_property, linked_tenant, etc.) are nullable — a note
      can be standalone or linked to one or more entities.
    - is_trashed + trashed_at: soft delete pattern. Celery task purges after 30 days.
    - word_count: denormalized for sorting/filtering. Updated on save.

    ## Color Coding
    white (default), yellow, green, blue, purple, pink — visual sticky-note effect.
    """
    COLOR_CHOICES = [
        ('white', 'White'),
        ('yellow', 'Yellow'),
        ('green', 'Green'),
        ('blue', 'Blue'),
        ('purple', 'Purple'),
        ('pink', 'Pink'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notes'
    )
    folder = models.ForeignKey(
        NoteFolder, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='notes'
    )
    tags = models.ManyToManyField(NoteTag, blank=True, related_name='notes')

    title = models.CharField(max_length=500, blank=True, default='')
    # Block-based content — see module docstring for schema
    content = models.JSONField(default=list, blank=True)
    content_type = models.CharField(
        max_length=20,
        choices=[
            ('blocks', 'Block-based'),
            ('richtext', 'Rich text'),
            ('plaintext', 'Plain text'),
        ],
        default='richtext',
        help_text='Content format: blocks (legacy), richtext (HTML with toolbar), or plaintext (unformatted)'
    )
    color = models.CharField(max_length=20, choices=COLOR_CHOICES, default='white')

    # State flags
    is_pinned = models.BooleanField(default=False)
    is_archived = models.BooleanField(default=False)
    is_trashed = models.BooleanField(default=False)
    trashed_at = models.DateTimeField(null=True, blank=True)

    # Entity linking — nullable FKs for contextual notes
    linked_property = models.ForeignKey(
        'properties.Property', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='linked_notes'
    )
    linked_tenant = models.ForeignKey(
        'tenants.Tenant', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='linked_notes'
    )
    linked_lease = models.ForeignKey(
        'leases.Lease', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='linked_notes'
    )
    linked_problem = models.ForeignKey(
        'problems.Problem', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='linked_notes'
    )

    # Denormalized stats — updated on save() for fast list-view rendering
    checklist_stats = models.JSONField(
        default=dict, blank=True,
        help_text='{"total": 0, "checked": 0} — computed from content blocks'
    )
    word_count = models.IntegerField(default=0)

    # Template flag — template notes appear in "New from Template" picker
    is_template = models.BooleanField(default=False)
    template_name = models.CharField(max_length=200, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_pinned', '-updated_at']
        indexes = [
            models.Index(fields=['user', '-updated_at']),
            models.Index(fields=['user', 'is_trashed', '-updated_at']),
            models.Index(fields=['user', 'folder', '-updated_at']),
            models.Index(fields=['user', 'is_pinned', '-updated_at']),
            models.Index(fields=['linked_property']),
            models.Index(fields=['linked_tenant']),
            models.Index(fields=['linked_lease']),
        ]

    def __str__(self):
        return self.title or f"Note #{self.pk}"

    def save(self, *args, **kwargs):
        """Recompute denormalized stats before every save."""
        self._compute_stats()
        super().save(*args, **kwargs)

    def _compute_stats(self):
        """
        Walk content blocks to compute checklist_stats and word_count.
        Runs in Python — no DB queries. O(n) where n = total block items.
        """
        total_checks = 0
        checked_checks = 0
        words = 0

        # Count words in title
        if self.title:
            words += len(self.title.split())

        blocks = self.content if isinstance(self.content, list) else []
        for block in blocks:
            btype = block.get('type', '')

            if btype == 'checklist':
                for item in block.get('items', []):
                    total_checks += 1
                    if item.get('checked'):
                        checked_checks += 1
                    words += len(item.get('text', '').split())

            elif btype == 'bullet':
                for item in block.get('items', []):
                    words += len(item.get('text', '').split())

            elif btype in ('text', 'heading', 'code'):
                words += len(block.get('content', '').split())

            elif btype == 'table':
                for row in block.get('rows', []):
                    for cell in row:
                        words += len(str(cell).split())

        self.checklist_stats = {'total': total_checks, 'checked': checked_checks}
        self.word_count = words
