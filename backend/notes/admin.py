from django.contrib import admin
from .models import Note, NoteFolder, NoteTag


@admin.register(NoteFolder)
class NoteFolderAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'color', 'position', 'created_at')
    list_filter = ('color',)
    search_fields = ('name',)


@admin.register(NoteTag)
class NoteTagAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'color', 'created_at')
    list_filter = ('color',)
    search_fields = ('name',)


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'folder', 'color', 'is_pinned', 'is_archived', 'is_trashed', 'updated_at')
    list_filter = ('color', 'is_pinned', 'is_archived', 'is_trashed', 'is_template')
    search_fields = ('title',)
    raw_id_fields = ('user', 'folder', 'linked_property', 'linked_tenant', 'linked_lease', 'linked_problem')
