"""
Notes serializers — handles JSON content validation, tag assignment, and
denormalized field exposure for list vs detail views.

## Design: Two serializers for Note
- NoteListSerializer: lightweight for list view (no full content, just stats)
- NoteSerializer: full content for detail/edit view

This avoids sending potentially large JSON content arrays on list endpoints
where only title/stats/metadata are needed. Reduces payload 5-10x on lists.
"""

from rest_framework import serializers
from .models import Note, NoteFolder, NoteTag


class NoteFolderSerializer(serializers.ModelSerializer):
    note_count = serializers.SerializerMethodField()

    class Meta:
        model = NoteFolder
        fields = [
            'id', 'name', 'color', 'icon', 'parent', 'position',
            'note_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ('created_at', 'updated_at')

    def get_note_count(self, obj):
        """Count active (non-trashed) notes in this folder."""
        return obj.notes.filter(is_trashed=False).count()


class NoteTagSerializer(serializers.ModelSerializer):
    note_count = serializers.SerializerMethodField()

    class Meta:
        model = NoteTag
        fields = ['id', 'name', 'color', 'note_count', 'created_at']
        read_only_fields = ('created_at',)

    def get_note_count(self, obj):
        return obj.notes.filter(is_trashed=False).count()


class NoteListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for note list views.
    Excludes full content — only sends title, stats, and metadata.
    content_preview: first 150 chars of text blocks for search results.
    """
    folder_name = serializers.CharField(source='folder.name', read_only=True, default=None)
    tag_ids = serializers.PrimaryKeyRelatedField(
        source='tags', many=True, read_only=True
    )
    linked_property_name = serializers.CharField(
        source='linked_property.name', read_only=True, default=None
    )
    linked_tenant_name = serializers.CharField(
        source='linked_tenant.full_name', read_only=True, default=None
    )
    content_preview = serializers.SerializerMethodField()

    class Meta:
        model = Note
        fields = [
            'id', 'title', 'color', 'folder', 'folder_name',
            'tag_ids', 'is_pinned', 'is_archived', 'is_trashed',
            'linked_property', 'linked_property_name',
            'linked_tenant', 'linked_tenant_name',
            'linked_lease', 'linked_problem',
            'checklist_stats', 'word_count',
            'is_template', 'template_name',
            'content_preview',
            'created_at', 'updated_at',
        ]
        read_only_fields = ('checklist_stats', 'word_count', 'created_at', 'updated_at')

    def get_content_preview(self, obj):
        """Extract first 150 chars from text/heading blocks for list preview."""
        blocks = obj.content if isinstance(obj.content, list) else []
        parts = []
        for block in blocks:
            btype = block.get('type', '')
            if btype in ('text', 'heading'):
                parts.append(block.get('content', ''))
            elif btype == 'checklist':
                for item in block.get('items', []):
                    prefix = '[x] ' if item.get('checked') else '[ ] '
                    parts.append(prefix + item.get('text', ''))
            elif btype == 'bullet':
                for item in block.get('items', []):
                    parts.append('- ' + item.get('text', ''))
            if len(' '.join(parts)) > 150:
                break
        preview = ' '.join(parts)[:150]
        return preview


class NoteSerializer(serializers.ModelSerializer):
    """
    Full serializer for note detail/create/update.
    Includes complete content JSON and tag management.
    """
    folder_name = serializers.CharField(source='folder.name', read_only=True, default=None)
    tag_ids = serializers.PrimaryKeyRelatedField(
        source='tags', queryset=NoteTag.objects.all(), many=True, required=False
    )
    linked_property_name = serializers.CharField(
        source='linked_property.name', read_only=True, default=None
    )
    linked_tenant_name = serializers.CharField(
        source='linked_tenant.full_name', read_only=True, default=None
    )

    class Meta:
        model = Note
        fields = [
            'id', 'title', 'content', 'color',
            'folder', 'folder_name', 'tag_ids',
            'is_pinned', 'is_archived', 'is_trashed', 'trashed_at',
            'linked_property', 'linked_property_name',
            'linked_tenant', 'linked_tenant_name',
            'linked_lease', 'linked_problem',
            'checklist_stats', 'word_count',
            'is_template', 'template_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ('checklist_stats', 'word_count', 'trashed_at', 'created_at', 'updated_at')

    def validate_content(self, value):
        """Validate content is a list of block objects with required 'type' field."""
        if not isinstance(value, list):
            raise serializers.ValidationError("Content must be a list of blocks.")
        valid_types = {'text', 'heading', 'checklist', 'bullet', 'table', 'divider', 'code'}
        for i, block in enumerate(value):
            if not isinstance(block, dict):
                raise serializers.ValidationError(f"Block {i} must be an object.")
            if block.get('type') not in valid_types:
                raise serializers.ValidationError(
                    f"Block {i} has invalid type '{block.get('type')}'. "
                    f"Valid types: {', '.join(sorted(valid_types))}"
                )
        return value

    def create(self, validated_data):
        tags = validated_data.pop('tags', [])
        note = Note.objects.create(**validated_data)
        if tags:
            note.tags.set(tags)
        return note

    def update(self, instance, validated_data):
        tags = validated_data.pop('tags', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if tags is not None:
            instance.tags.set(tags)
        return instance
