"""
Music business logic service layer.

# AI-NAV: Called from views.py action endpoints.
# AI-NAV: record_play → updates Song + creates ListeningHistory + auto-prunes.
# AI-NAV: toggle_favorite → flips Song.is_favorite boolean.
# AI-NAV: get_recently_played → distinct songs from ListeningHistory.
"""
from django.utils import timezone
from django.db.models import F
from .models import Song, ListeningHistory


# Maximum history entries per user — prevents unbounded table growth
MAX_HISTORY_PER_USER = 200


def record_play(user, song: Song) -> Song:
    """
    Record that a user played a song.
    - Increments play_count atomically (F expression avoids race conditions)
    - Updates last_played_at timestamp
    - Creates ListeningHistory entry
    - Prunes old history if over MAX_HISTORY_PER_USER
    """
    # Atomic increment — safe for concurrent requests
    Song.objects.filter(pk=song.pk).update(
        play_count=F('play_count') + 1,
        last_played_at=timezone.now(),
    )

    # Create history entry
    ListeningHistory.objects.create(user=user, song=song)

    # Prune old entries beyond limit
    history_ids = list(
        ListeningHistory.objects.filter(user=user)
        .order_by('-played_at')
        .values_list('id', flat=True)[:MAX_HISTORY_PER_USER]
    )
    if history_ids:
        ListeningHistory.objects.filter(user=user).exclude(id__in=history_ids).delete()

    # Refresh from DB to return updated play_count
    song.refresh_from_db()
    return song


def toggle_favorite(song: Song) -> bool:
    """
    Toggle a song's favorite status.
    Returns the new is_favorite value.
    """
    song.is_favorite = not song.is_favorite
    song.save(update_fields=['is_favorite'])
    return song.is_favorite


def get_recently_played(user, limit: int = 50):
    """
    Get the most recently played songs for a user.
    Returns distinct songs ordered by most recent play.
    Uses a subquery to get distinct song IDs with max played_at.
    """
    # Get distinct song IDs in order of most recent play
    recent_entries = (
        ListeningHistory.objects.filter(user=user)
        .order_by('song_id', '-played_at')
        .distinct('song_id')  # PostgreSQL-only
    )

    # Fallback for SQLite: manual dedup in Python
    try:
        song_ids = list(recent_entries.values_list('song_id', flat=True)[:limit])
    except Exception:
        # SQLite doesn't support distinct on fields — fallback
        entries = ListeningHistory.objects.filter(user=user).order_by('-played_at')[:200]
        seen = set()
        song_ids = []
        for entry in entries:
            if entry.song_id not in seen:
                seen.add(entry.song_id)
                song_ids.append(entry.song_id)
                if len(song_ids) >= limit:
                    break

    # Fetch songs preserving order
    songs_map = {s.id: s for s in Song.objects.filter(id__in=song_ids)}
    return [songs_map[sid] for sid in song_ids if sid in songs_map]


def get_music_stats(user) -> dict:
    """
    Get aggregate music stats for a user.
    Used on the music dashboard header.
    """
    from django.db.models import Sum, Count, Q

    songs = Song.objects.filter(user=user)
    agg = songs.aggregate(
        total=Count('id'),
        favorites=Count('id', filter=Q(is_favorite=True)),
        total_duration=Sum('duration'),
        total_size=Sum('file_size'),
    )

    top_played = (
        songs.filter(play_count__gt=0)
        .order_by('-play_count')
        .values('id', 'title', 'artist', 'play_count')[:5]
    )

    return {
        'total_songs': agg['total'] or 0,
        'favorites_count': agg['favorites'] or 0,
        'total_duration': agg['total_duration'] or 0,
        'total_size': agg['total_size'] or 0,
        'top_played': list(top_played),
    }
