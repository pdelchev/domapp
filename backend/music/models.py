"""
Music module models.

# ┌─────────────────────────────────────────────────┐
# │ SCHEMA: Song → ListeningHistory, PlaylistSong   │
# │ SCOPE:  user-scoped (all queries filter by user)│
# │ PATTERN: upload-first personal media library     │
# └─────────────────────────────────────────────────┘
#
# AI-NAV: Song.is_favorite → toggle via /songs/<id>/favorite/
# AI-NAV: Song.play_count → incremented via /songs/<id>/play/
# AI-NAV: ListeningHistory → queried via /songs/recently-played/
# AI-NAV: color_hex → deterministic hash of title for UI gradient
"""
import hashlib
from django.db import models
from django.conf import settings


def generate_color_from_string(s: str) -> str:
    """
    Generate a deterministic hex color from a string.
    Used for song card backgrounds when no album art exists.
    Produces mid-saturation colors (not too bright, not too dark).
    """
    h = hashlib.md5(s.encode()).hexdigest()
    # Take 3 bytes and constrain to pleasant range (60-200)
    r = 60 + (int(h[0:2], 16) % 140)
    g = 60 + (int(h[2:4], 16) % 140)
    b = 60 + (int(h[4:6], 16) % 140)
    return f'#{r:02x}{g:02x}{b:02x}'


class Song(models.Model):
    """
    An uploaded audio/video track belonging to a user.

    AI-NAV: Core entity. FK target for ListeningHistory, PlaylistSong.
    AI-NAV: is_favorite, play_count, last_played_at are Spotify-style engagement fields.
    AI-NAV: color_hex auto-generated on save() for card gradient backgrounds.
    """
    MEDIA_TYPE_CHOICES = [
        ('audio', 'Audio'),
        ('video', 'Video'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='songs'
    )
    title = models.CharField(max_length=255)
    artist = models.CharField(max_length=255, blank=True, default='')
    album = models.CharField(max_length=255, blank=True, default='')
    file = models.FileField(upload_to='music/')
    media_type = models.CharField(max_length=10, choices=MEDIA_TYPE_CHOICES, default='audio')
    file_size = models.PositiveIntegerField(default=0, help_text='File size in bytes')
    duration = models.PositiveIntegerField(default=0, help_text='Duration in seconds')

    # Spotify-style engagement fields
    is_favorite = models.BooleanField(default=False, db_index=True)
    play_count = models.PositiveIntegerField(default=0)
    last_played_at = models.DateTimeField(null=True, blank=True)

    # UI: deterministic color for card gradient (generated from title hash)
    color_hex = models.CharField(max_length=7, default='#6366f1')

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['user', 'is_favorite']),
            models.Index(fields=['user', '-play_count']),
            models.Index(fields=['user', '-last_played_at']),
        ]

    def __str__(self):
        return f"{self.title} — {self.artist}" if self.artist else self.title

    def save(self, *args, **kwargs):
        # Auto-populate file_size from uploaded file
        if self.file and hasattr(self.file, 'size'):
            self.file_size = self.file.size
        # Auto-generate title from filename if not provided
        if not self.title and self.file:
            name = self.file.name.split('/')[-1]
            self.title = name.rsplit('.', 1)[0] if '.' in name else name
        # Auto-detect media type from file extension
        if self.file:
            ext = self.file.name.rsplit('.', 1)[-1].lower() if '.' in self.file.name else ''
            if ext in ('mp4', 'avi', 'mkv', 'mov', 'webm', 'wmv'):
                self.media_type = 'video'
            else:
                self.media_type = 'audio'
        # Generate deterministic color from title
        seed = self.title or (self.file.name if self.file else 'default')
        self.color_hex = generate_color_from_string(seed)
        super().save(*args, **kwargs)


class Playlist(models.Model):
    """
    A user-created playlist containing songs.
    AI-NAV: songs linked via PlaylistSong through table (ordered).
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='playlists'
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    songs = models.ManyToManyField(Song, through='PlaylistSong', related_name='playlists', blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return self.name


class PlaylistSong(models.Model):
    """
    Through table for playlist song ordering.
    AI-NAV: position field controls playback order within playlist.
    """
    playlist = models.ForeignKey(Playlist, on_delete=models.CASCADE)
    song = models.ForeignKey(Song, on_delete=models.CASCADE)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['position']
        unique_together = ['playlist', 'song']


class ListeningHistory(models.Model):
    """
    Tracks which songs a user played and when.
    Used for "Recently Played" section on the music page.

    AI-NAV: Auto-pruned to 200 entries per user in services.py.
    AI-NAV: Queried via /api/songs/recently-played/ endpoint.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='listening_history'
    )
    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name='history_entries')
    played_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-played_at']
        indexes = [
            models.Index(fields=['user', '-played_at']),
        ]

    def __str__(self):
        return f"{self.user} played {self.song} at {self.played_at}"
