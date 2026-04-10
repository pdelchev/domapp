"""
Weather data fetching and caching service.

§PURPOSE: Fetch weather data from OpenWeatherMap and cache in WeatherSnapshot.
          Used by correlations engine to find weather-health patterns.

§API: OpenWeatherMap API 3.0 (requires OPENWEATHERMAP_API_KEY in settings)
      Fallback: Manual entry or skip weather analysis if API unavailable.

§CACHING: Cache 30 days at a time, skip re-fetch if already cached.
          User can refresh or manually override.
"""

import logging
import requests
from datetime import date, timedelta
from typing import Optional, Dict, Any
from django.conf import settings

from .daily_models import WeatherSnapshot, HealthProfile

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────
# §API Helpers
# ──────────────────────────────────────────────────────────────

def _get_api_key() -> Optional[str]:
    """Get OpenWeatherMap API key from settings."""
    return getattr(settings, 'OPENWEATHERMAP_API_KEY', None)


def _parse_coordinates(location: str) -> tuple:
    """
    Parse location string to (latitude, longitude).
    Supports: "Sofia, Bulgaria", "42.7,-23.3", "42.7, -23.3"
    Returns: (lat, lon) or (None, None) if parse fails.
    """
    location = location.strip()
    if not location:
        return None, None

    # Try to parse as coordinates
    if ',' in location:
        parts = location.split(',')
        if len(parts) == 2:
            try:
                lat = float(parts[0].strip())
                lon = float(parts[1].strip())
                if -90 <= lat <= 90 and -180 <= lon <= 180:
                    return lat, lon
            except ValueError:
                pass

    # Fall through to None (caller will use geocoding if available)
    return None, None


def _fetch_weather_api(lat: float, lon: float, date_obj: date) -> Optional[Dict[str, Any]]:
    """
    Fetch historical weather from OpenWeatherMap Historical API.
    Returns parsed weather dict or None if API unavailable/failed.

    Note: OpenWeatherMap's free tier does NOT have historical data.
    For MVP, we cache manually entered data and skip automated fetch.
    In production, use a service like VisualCrossing or paid OWM tier.
    """
    api_key = _get_api_key()
    if not api_key:
        logger.warning('OPENWEATHERMAP_API_KEY not configured, skipping weather fetch')
        return None

    try:
        # For MVP: we'll accept manual entry or skip.
        # This is a placeholder for future paid API integration.
        logger.info(f'Weather API integration placeholder for {date_obj}')
        return None
    except Exception as e:
        logger.error(f'Weather API error: {e}')
        return None


def get_location_for_profile(profile: HealthProfile) -> str:
    """
    Infer user's location from profile, linked property, or tenant data.
    Returns best-guess location string or empty string.

    For MVP: return empty string (user enters manually).
    Future: link to property.address or user's primary property location.
    """
    # Placeholder: would integrate with properties module
    return getattr(profile, 'location_hint', '')


# ──────────────────────────────────────────────────────────────
# §Core Service Functions
# ──────────────────────────────────────────────────────────────

def get_or_create_weather(
    user,
    profile: HealthProfile,
    date_obj: date,
    location: str = '',
) -> Optional[WeatherSnapshot]:
    """
    Get cached weather or create stub if missing.
    Does not fetch from API (MVP: manual entry only).

    Returns: WeatherSnapshot or None
    """
    if not location:
        location = get_location_for_profile(profile)

    obj, created = WeatherSnapshot.objects.get_or_create(
        profile=profile,
        date=date_obj,
        defaults={'user': user, 'location': location}
    )
    return obj


def fetch_weather_range(
    user,
    profile: HealthProfile,
    start_date: date,
    end_date: date,
    location: str = '',
    force_refresh: bool = False,
) -> Dict[date, Optional[WeatherSnapshot]]:
    """
    Fetch or create weather records for date range.
    Returns dict: {date -> WeatherSnapshot or None}.

    §LOGIC:
      - If record exists and force_refresh=False, use cached.
      - If missing, try API (returns None if unavailable).
      - If location not provided, infer from profile.
    """
    if not location:
        location = get_location_for_profile(profile)

    result = {}
    current = start_date
    while current <= end_date:
        if not force_refresh:
            # Check cache first
            ws = WeatherSnapshot.objects.filter(
                profile=profile, date=current
            ).first()
            if ws:
                result[current] = ws
                current += timedelta(days=1)
                continue

        # Not cached; try to fetch or create stub
        ws = get_or_create_weather(user, profile, current, location)
        result[current] = ws
        current += timedelta(days=1)

    return result


def log_weather_manual(
    user,
    profile: HealthProfile,
    date_obj: date,
    location: str = '',
    temperature_celsius: float = None,
    humidity_percent: int = None,
    pressure_hpa: float = None,
    precipitation_mm: float = 0,
    air_quality_index: int = None,
    condition: str = 'unknown',
    condition_detail: str = '',
) -> WeatherSnapshot:
    """
    Create or update weather record with manual entry.
    Returns: created/updated WeatherSnapshot.
    """
    if not location:
        location = get_location_for_profile(profile)

    ws, created = WeatherSnapshot.objects.update_or_create(
        profile=profile,
        date=date_obj,
        defaults={
            'user': user,
            'location': location,
            'temperature_celsius': temperature_celsius,
            'humidity_percent': humidity_percent,
            'pressure_hpa': pressure_hpa,
            'precipitation_mm': precipitation_mm,
            'air_quality_index': air_quality_index,
            'condition': condition,
            'condition_detail': condition_detail,
            'data_source': 'manual',
        }
    )
    return ws


def get_weather_timeline(
    profile: HealthProfile,
    days: int = 90,
) -> Dict[date, Optional[WeatherSnapshot]]:
    """
    Get weather snapshots for the last N days.
    Returns: {date -> WeatherSnapshot} for dates with data, skips empty dates.
    """
    start = date.today() - timedelta(days=days)
    snapshots = WeatherSnapshot.objects.filter(
        profile=profile,
        date__gte=start,
    ).order_by('-date')

    return {ws.date: ws for ws in snapshots}
