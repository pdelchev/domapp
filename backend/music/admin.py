from django.contrib import admin
from .models import Song, Playlist, PlaylistSong


@admin.register(Song)
class SongAdmin(admin.ModelAdmin):
    list_display = ['title', 'artist', 'album', 'duration', 'created_at']
    search_fields = ['title', 'artist', 'album']


class PlaylistSongInline(admin.TabularInline):
    model = PlaylistSong
    extra = 0


@admin.register(Playlist)
class PlaylistAdmin(admin.ModelAdmin):
    list_display = ['name', 'user', 'created_at']
    inlines = [PlaylistSongInline]
