from django.db import models
from django.conf import settings


class Song(models.Model):
    """An uploaded audio/video track belonging to a user."""
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

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
        ]

    def __str__(self):
        return f"{self.title} — {self.artist}" if self.artist else self.title

    def save(self, *args, **kwargs):
        if self.file and hasattr(self.file, 'size'):
            self.file_size = self.file.size
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
        super().save(*args, **kwargs)


class Playlist(models.Model):
    """A user-created playlist containing songs."""
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
    """Through table for playlist song ordering."""
    playlist = models.ForeignKey(Playlist, on_delete=models.CASCADE)
    song = models.ForeignKey(Song, on_delete=models.CASCADE)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['position']
        unique_together = ['playlist', 'song']
