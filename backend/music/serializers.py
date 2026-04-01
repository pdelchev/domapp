"""
Music serializers.

# AI-NAV: SongSerializer → includes is_favorite, play_count, color_hex for UI
# AI-NAV: PlaylistSerializer → tracks only in detail view (pk in kwargs)
# AI-NAV: file_url built from request for absolute URL
"""
from rest_framework import serializers
from .models import Song, Playlist, PlaylistSong


class SongSerializer(serializers.ModelSerializer):
    """
    Song serializer with file URL and engagement fields.
    file_url: absolute URL for audio/video playback.
    color_hex: used for card gradient backgrounds in the UI.
    """
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Song
        fields = [
            'id', 'title', 'artist', 'album', 'file', 'file_url',
            'media_type', 'file_size', 'duration', 'is_favorite',
            'play_count', 'last_played_at', 'color_hex', 'created_at',
        ]
        read_only_fields = (
            'file_size', 'media_type', 'created_at',
            'play_count', 'last_played_at', 'color_hex',
        )

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None


class PlaylistSongSerializer(serializers.ModelSerializer):
    """Nested serializer for tracks within a playlist detail view."""
    song = SongSerializer(read_only=True)

    class Meta:
        model = PlaylistSong
        fields = ['id', 'song', 'position']


class PlaylistSerializer(serializers.ModelSerializer):
    """
    Playlist serializer.
    song_count: always included (cheap count).
    tracks: only populated in detail view to avoid N+1 on list.
    color_preview: first 4 song colors for playlist cover art generation.
    """
    song_count = serializers.SerializerMethodField()
    tracks = serializers.SerializerMethodField()
    color_preview = serializers.SerializerMethodField()

    class Meta:
        model = Playlist
        fields = [
            'id', 'name', 'description', 'song_count', 'tracks',
            'color_preview', 'created_at', 'updated_at',
        ]
        read_only_fields = ('created_at', 'updated_at')

    def get_song_count(self, obj):
        return obj.playlistsong_set.count()

    def get_tracks(self, obj):
        # Only include tracks in detail view (retrieve), not list
        request = self.context.get('request')
        if request and request.parser_context.get('kwargs', {}).get('pk'):
            entries = obj.playlistsong_set.select_related('song').order_by('position')
            return PlaylistSongSerializer(entries, many=True, context=self.context).data
        return None

    def get_color_preview(self, obj):
        """Return first 4 song colors for playlist cover art mosaic."""
        colors = list(
            obj.playlistsong_set
            .select_related('song')
            .order_by('position')
            .values_list('song__color_hex', flat=True)[:4]
        )
        return colors
