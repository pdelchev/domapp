"""
Music API views.

# AI-NAV: SongViewSet → CRUD + favorite/play/recently-played/stats actions
# AI-NAV: PlaylistViewSet → CRUD + add-song/remove-song/reorder actions
# AI-NAV: All querysets scoped to request.user.get_data_owner()
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q
from .models import Song, Playlist, PlaylistSong
from .serializers import SongSerializer, PlaylistSerializer
from . import services


class SongViewSet(viewsets.ModelViewSet):
    """
    CRUD for songs — upload, list, search, filter, delete.

    Query params:
      ?search=<term>     — filter by title/artist/album
      ?favorite=true     — only favorites
      ?media_type=audio  — filter by media type
      ?sort=most_played  — sort by play_count desc
      ?sort=recently_played — sort by last_played_at desc
      ?sort=oldest       — sort by created_at asc
    """
    serializer_class = SongSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Song.objects.filter(user=self.request.user.get_data_owner())

        # Search across title, artist, album
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(title__icontains=search) |
                Q(artist__icontains=search) |
                Q(album__icontains=search)
            )

        # Filter by favorite status
        fav = self.request.query_params.get('favorite')
        if fav == 'true':
            qs = qs.filter(is_favorite=True)

        # Filter by media type
        media_type = self.request.query_params.get('media_type')
        if media_type in ('audio', 'video'):
            qs = qs.filter(media_type=media_type)

        # Sort options
        sort = self.request.query_params.get('sort')
        if sort == 'most_played':
            qs = qs.order_by('-play_count', '-created_at')
        elif sort == 'recently_played':
            qs = qs.filter(last_played_at__isnull=False).order_by('-last_played_at')
        elif sort == 'oldest':
            qs = qs.order_by('created_at')
        elif sort == 'title':
            qs = qs.order_by('title')
        # Default ordering is -created_at (from Meta)

        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())

    @action(detail=True, methods=['post'], url_path='favorite')
    def toggle_favorite(self, request, pk=None):
        """Toggle favorite status. Returns {is_favorite: bool}."""
        song = self.get_object()
        new_status = services.toggle_favorite(song)
        return Response({'is_favorite': new_status})

    @action(detail=True, methods=['post'], url_path='play')
    def record_play(self, request, pk=None):
        """Record a play event. Increments play_count, updates last_played_at."""
        song = self.get_object()
        updated = services.record_play(request.user.get_data_owner(), song)
        return Response({
            'play_count': updated.play_count,
            'last_played_at': updated.last_played_at,
        })

    @action(detail=False, methods=['get'], url_path='recently-played')
    def recently_played(self, request):
        """Get recently played songs (distinct, most recent first)."""
        songs = services.get_recently_played(request.user.get_data_owner())
        serializer = self.get_serializer(songs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='stats')
    def stats(self, request):
        """Get music library stats: total songs, favorites, duration, top played."""
        data = services.get_music_stats(request.user.get_data_owner())
        return Response(data)


class PlaylistViewSet(viewsets.ModelViewSet):
    """
    CRUD for playlists with song management.
    AI-NAV: add-song, remove-song, reorder are custom actions.
    """
    serializer_class = PlaylistSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Playlist.objects.filter(user=self.request.user.get_data_owner())

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())

    @action(detail=True, methods=['post'], url_path='add-song')
    def add_song(self, request, pk=None):
        """Add a song to playlist. Body: {song_id, position?}"""
        playlist = self.get_object()
        song_id = request.data.get('song_id')
        if not song_id:
            return Response({'error': 'song_id required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            song = Song.objects.get(pk=song_id, user=request.user.get_data_owner())
        except Song.DoesNotExist:
            return Response({'error': 'Song not found'}, status=status.HTTP_404_NOT_FOUND)

        position = request.data.get('position')
        if position is None:
            last = playlist.playlistsong_set.order_by('-position').first()
            position = (last.position + 1) if last else 0

        PlaylistSong.objects.update_or_create(
            playlist=playlist, song=song,
            defaults={'position': position}
        )
        return Response({'status': 'added'})

    @action(detail=True, methods=['post'], url_path='remove-song')
    def remove_song(self, request, pk=None):
        """Remove a song from playlist. Body: {song_id}"""
        playlist = self.get_object()
        song_id = request.data.get('song_id')
        if not song_id:
            return Response({'error': 'song_id required'}, status=status.HTTP_400_BAD_REQUEST)

        deleted, _ = PlaylistSong.objects.filter(playlist=playlist, song_id=song_id).delete()
        if not deleted:
            return Response({'error': 'Song not in playlist'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'status': 'removed'})

    @action(detail=True, methods=['post'], url_path='reorder')
    def reorder(self, request, pk=None):
        """Reorder songs. Body: {song_ids: [id1, id2, ...]}"""
        playlist = self.get_object()
        song_ids = request.data.get('song_ids', [])
        for i, sid in enumerate(song_ids):
            PlaylistSong.objects.filter(playlist=playlist, song_id=sid).update(position=i)
        return Response({'status': 'reordered'})
