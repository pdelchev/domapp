from rest_framework import serializers
from .models import Song, Playlist, PlaylistSong


class SongSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Song
        fields = [
            'id', 'title', 'artist', 'album', 'file', 'file_url',
            'media_type', 'file_size', 'duration', 'created_at',
        ]
        read_only_fields = ('file_size', 'media_type', 'created_at')

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None


class PlaylistSongSerializer(serializers.ModelSerializer):
    song = SongSerializer(read_only=True)

    class Meta:
        model = PlaylistSong
        fields = ['id', 'song', 'position']


class PlaylistSerializer(serializers.ModelSerializer):
    song_count = serializers.SerializerMethodField()
    tracks = serializers.SerializerMethodField()

    class Meta:
        model = Playlist
        fields = [
            'id', 'name', 'description', 'song_count', 'tracks',
            'created_at', 'updated_at',
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
