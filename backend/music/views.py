from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q
from .models import Song, Playlist, PlaylistSong
from .serializers import SongSerializer, PlaylistSerializer


class SongViewSet(viewsets.ModelViewSet):
    """CRUD for songs — upload MP3, list, delete."""
    serializer_class = SongSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Song.objects.filter(user=self.request.user.get_data_owner())
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(title__icontains=search) |
                Q(artist__icontains=search) |
                Q(album__icontains=search)
            )
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())


class PlaylistViewSet(viewsets.ModelViewSet):
    """CRUD for playlists with song management."""
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
