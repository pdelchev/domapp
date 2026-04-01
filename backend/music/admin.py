from django.contrib import admin
from .models import Song, Playlist, PlaylistSong, ListeningHistory


@admin.register(Song)
class SongAdmin(admin.ModelAdmin):
    list_display = ['title', 'artist', 'album', 'is_favorite', 'play_count', 'duration', 'created_at']
    search_fields = ['title', 'artist', 'album']
    list_filter = ['is_favorite', 'media_type']


class PlaylistSongInline(admin.TabularInline):
    model = PlaylistSong
    extra = 0


@admin.register(Playlist)
class PlaylistAdmin(admin.ModelAdmin):
    list_display = ['name', 'user', 'created_at']
    inlines = [PlaylistSongInline]


@admin.register(ListeningHistory)
class ListeningHistoryAdmin(admin.ModelAdmin):
    list_display = ['user', 'song', 'played_at']
    list_filter = ['user']
