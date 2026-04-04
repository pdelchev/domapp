# ── health/whoop_services.py ───────────────────────────────────────────
# WHOOP API client + data processing: OAuth2 flow, data sync, statistics,
# and cardiovascular fitness assessment (combining WHOOP + BP + blood data).
#
# §NAV: whoop_models → whoop_serializers → whoop_views → whoop_urls → [whoop_services]
# §FLOW: connect → exchange_code → sync_whoop_data → (dashboard/stats refresh)
#
# This is the "brain" of the WHOOP integration — all API calls and computation here.

import logging
import math
from datetime import timedelta, datetime
from collections import defaultdict
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.db.models import Avg, Min, Max, Count, Q, F
from django.utils import timezone

from .whoop_models import (
    WhoopConnection, WhoopCycle, WhoopRecovery, WhoopSleep, WhoopWorkout,
)

logger = logging.getLogger(__name__)


# ── WHOOP API constants ────────────────────────────────────────────
# §API: Official WHOOP Developer API endpoints (v1)

WHOOP_API_BASE = 'https://api.prod.whoop.com'
WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth'
WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
WHOOP_SCOPES = (
    'read:recovery read:sleep read:cycles read:workout '
    'read:profile read:body_measurement offline'
)

# §SETTINGS: Read from Django settings with safe defaults
WHOOP_CLIENT_ID = getattr(settings, 'WHOOP_CLIENT_ID', '')
WHOOP_CLIENT_SECRET = getattr(settings, 'WHOOP_CLIENT_SECRET', '')
WHOOP_REDIRECT_URI = getattr(settings, 'WHOOP_REDIRECT_URI', '')

# §SPORT: WHOOP sport ID → name mapping (partial — common ones)
SPORT_MAP = {
    -1: 'Activity', 0: 'Running', 1: 'Cycling', 16: 'Baseball',
    17: 'Basketball', 18: 'Rowing', 19: 'Fencing', 20: 'Field Hockey',
    21: 'Football', 22: 'Golf', 24: 'Ice Hockey', 25: 'Lacrosse',
    27: 'Rugby', 28: 'Sailing', 29: 'Skiing', 30: 'Soccer',
    31: 'Softball', 32: 'Squash', 33: 'Swimming', 34: 'Tennis',
    35: 'Track & Field', 36: 'Volleyball', 37: 'Water Polo',
    38: 'Wrestling', 39: 'Boxing', 42: 'Dance', 43: 'Pilates',
    44: 'Yoga', 45: 'Weightlifting', 47: 'Cross Country Skiing',
    48: 'Functional Fitness', 49: 'Duathlon', 51: 'Gymnastics',
    52: 'HIIT', 53: 'Kayaking', 55: 'Martial Arts', 56: 'Meditation',
    57: 'Paddle Tennis', 59: 'Snowboarding', 60: 'Surfing',
    62: 'Triathlon', 63: 'Walking', 64: 'Wheelchair Pushing',
    65: 'Elliptical', 66: 'Stairmaster', 70: 'Spin', 71: 'Climbing',
    73: 'Hiking', 74: 'Horseback Riding', 75: 'Kayaking',
    76: 'Paddle Boarding', 82: 'Assault Bike', 84: 'Barre',
    85: 'Stretching', 86: 'Roller Skating',
}


# ── Custom exception ──────────────────────────────────────────────

class WhoopAPIError(Exception):
    """§ERR: Raised when WHOOP API returns an error."""
    def __init__(self, message, status_code=None, response_body=None):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


# ── OAuth2 flow ───────────────────────────────────────────────────

def get_auth_url(state: str) -> str:
    """
    §AUTH: Build the OAuth2 authorization URL for redirecting the user to WHOOP.
    `state` is an opaque CSRF-prevention token stored in the session.

    Returns a fully-qualified URL the frontend should redirect to.
    """
    params = {
        'response_type': 'code',
        'client_id': WHOOP_CLIENT_ID,
        'redirect_uri': WHOOP_REDIRECT_URI,
        'scope': WHOOP_SCOPES,
        'state': state,
    }
    return f"{WHOOP_AUTH_URL}?{urlencode(params)}"


def exchange_code(code: str) -> dict:
    """
    §TOKEN: Exchange an authorization code for access + refresh tokens.
    Called during the OAuth callback after user approves the connection.

    Returns: {access_token, refresh_token, expires_in, token_type, scope}
    Raises WhoopAPIError on failure.
    """
    payload = {
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': WHOOP_REDIRECT_URI,
        'client_id': WHOOP_CLIENT_ID,
        'client_secret': WHOOP_CLIENT_SECRET,
    }

    logger.info('WHOOP token exchange: redirect_uri=%s client_id=%s code_len=%d', WHOOP_REDIRECT_URI, WHOOP_CLIENT_ID, len(code))
    try:
        resp = requests.post(WHOOP_TOKEN_URL, data=payload, timeout=30)
    except requests.RequestException as e:
        logger.error('WHOOP token exchange request failed: %s', e)
        raise WhoopAPIError(f'Token exchange request failed: {e}')
    if resp.status_code != 200:
        logger.error('WHOOP token exchange failed: %s %s', resp.status_code, resp.text)
        raise WhoopAPIError(
            f'Token exchange failed: {resp.status_code} — {resp.text[:200]}',
            status_code=resp.status_code,
            response_body=resp.text,
        )

    return resp.json()


def refresh_tokens(connection: WhoopConnection) -> bool:
    """
    §REFRESH: Refresh expired access token using the refresh token.
    Updates the WhoopConnection in the database.

    Returns True if successful, False if refresh failed (user must re-auth).
    """
    payload = {
        'grant_type': 'refresh_token',
        'refresh_token': connection.refresh_token,
        'client_id': WHOOP_CLIENT_ID,
        'client_secret': WHOOP_CLIENT_SECRET,
    }

    try:
        resp = requests.post(WHOOP_TOKEN_URL, data=payload, timeout=30)
    except requests.RequestException as e:
        logger.error('WHOOP token refresh network error: %s', e)
        connection.sync_error = f'Token refresh network error: {e}'
        connection.save(update_fields=['sync_error'])
        return False

    if resp.status_code != 200:
        logger.error('WHOOP token refresh failed: %s %s', resp.status_code, resp.text)
        connection.is_active = False
        connection.sync_error = f'Token refresh failed ({resp.status_code}). Please reconnect.'
        connection.save(update_fields=['is_active', 'sync_error'])
        return False

    data = resp.json()
    connection.access_token = data['access_token']
    connection.refresh_token = data.get('refresh_token', connection.refresh_token)
    connection.token_expires_at = timezone.now() + timedelta(seconds=data.get('expires_in', 3600))
    connection.sync_error = ''
    connection.save(update_fields=[
        'access_token', 'refresh_token', 'token_expires_at', 'sync_error',
    ])
    return True


# ── Authenticated API request ─────────────────────────────────────

def _api_request(
    connection: WhoopConnection,
    method: str,
    path: str,
    params: dict = None,
) -> dict:
    """
    §API: Make an authenticated request to the WHOOP API.
    Auto-refreshes token if expired before making the call.

    Raises WhoopAPIError on failure.
    """
    # §TOKEN: Refresh if expired
    if connection.is_token_expired:
        if not refresh_tokens(connection):
            raise WhoopAPIError('Token refresh failed. User must re-authenticate.')

    url = f"{WHOOP_API_BASE}{path}"
    headers = {
        'Authorization': f'Bearer {connection.access_token}',
        'Content-Type': 'application/json',
    }

    try:
        resp = requests.request(
            method, url, headers=headers, params=params, timeout=30,
        )
    except requests.RequestException as e:
        raise WhoopAPIError(f'Network error: {e}')

    if resp.status_code == 401:
        # §RETRY: Token might have been revoked — try one refresh
        if refresh_tokens(connection):
            headers['Authorization'] = f'Bearer {connection.access_token}'
            resp = requests.request(
                method, url, headers=headers, params=params, timeout=30,
            )
        else:
            raise WhoopAPIError('Authentication failed. Please reconnect WHOOP.')

    if resp.status_code >= 400:
        raise WhoopAPIError(
            f'API error: {resp.status_code}',
            status_code=resp.status_code,
            response_body=resp.text,
        )

    if resp.status_code == 204:
        return {}

    return resp.json()


# ── Paginated fetch helper ────────────────────────────────────────

def _fetch_all_pages(connection: WhoopConnection, path: str, params: dict) -> list:
    """
    §PAGE: Fetch all pages of a WHOOP API collection endpoint.
    WHOOP uses nextToken-based cursor pagination.

    Returns a flat list of all records across pages.
    """
    all_records = []
    next_token = None

    while True:
        req_params = dict(params)
        if next_token:
            req_params['nextToken'] = next_token

        data = _api_request(connection, 'GET', path, params=req_params)
        records = data.get('records', [])
        all_records.extend(records)

        next_token = data.get('next_token')
        if not next_token:
            break

    return all_records


# ── Main sync function ────────────────────────────────────────────

def sync_whoop_data(user, days: int = 7) -> dict:
    """
    §SYNC: Main entry point. Pulls last N days of cycles, recovery, sleep, workouts.
    Uses update_or_create for idempotent sync (safe to re-run).

    Returns: {cycles_synced, recoveries_synced, sleeps_synced, workouts_synced, errors}
    """
    try:
        connection = WhoopConnection.objects.get(user=user, is_active=True)
    except WhoopConnection.DoesNotExist:
        return {'error': 'No active WHOOP connection found.'}

    end_date = timezone.now()
    start_date = end_date - timedelta(days=days)

    result = {
        'cycles_synced': 0,
        'recoveries_synced': 0,
        'sleeps_synced': 0,
        'workouts_synced': 0,
        'errors': [],
    }

    # §SYNC: Pull each data type — continue even if one fails
    try:
        result['cycles_synced'] = _sync_cycles(connection, start_date, end_date)
    except WhoopAPIError as e:
        result['errors'].append(f'Cycles: {e}')
        logger.error('WHOOP cycle sync error for user %s: %s', user.id, e)

    # §NOTE: Recovery, sleep, and workout endpoints return 404 for apps in development mode.
    # These are enabled once the app is approved by WHOOP. Skip them to avoid slow sync.
    # Uncomment when app is approved:
    # try:
    #     result['recoveries_synced'] = _sync_recoveries(connection, start_date, end_date)
    # except WhoopAPIError as e:
    #     result['errors'].append(f'Recoveries: {e}')
    # try:
    #     result['sleeps_synced'] = _sync_sleep(connection, start_date, end_date)
    # except WhoopAPIError as e:
    #     result['errors'].append(f'Sleep: {e}')
    # try:
    #     result['workouts_synced'] = _sync_workouts(connection, start_date, end_date)
    # except WhoopAPIError as e:
    #     result['errors'].append(f'Workouts: {e}')

    # §STATE: Update connection sync timestamp
    if not result['errors']:
        connection.sync_error = ''
    else:
        connection.sync_error = '; '.join(result['errors'])

    connection.last_sync_at = timezone.now()
    connection.save(update_fields=['last_sync_at', 'sync_error'])

    return result


# ── Sync: Cycles ──────────────────────────────────────────────────

def _sync_cycles(connection: WhoopConnection, start_date, end_date) -> int:
    """
    §CYCLE: Fetch and store physiological cycles.
    Handles WHOOP API pagination via nextToken.
    """
    params = {
        'start': start_date.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
        'end': end_date.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
        'limit': 25,
    }

    records = _fetch_all_pages(connection, '/developer/v1/cycle', params)
    synced = 0

    for rec in records:
        score = rec.get('score', {}) or {}
        defaults = {
            'user': connection.user,
            'start': rec['start'],
            'end': rec.get('end'),
            'timezone_offset': rec.get('timezone_offset', '+00:00'),
            'score_state': rec.get('score_state', 'pending'),
            'strain': score.get('strain'),
            'kilojoule': score.get('kilojoule'),
            'average_heart_rate': score.get('average_heart_rate'),
            'max_heart_rate': score.get('max_heart_rate'),
        }

        WhoopCycle.objects.update_or_create(
            whoop_id=rec['id'],
            defaults=defaults,
        )
        synced += 1

    return synced


# ── Sync: Recoveries ─────────────────────────────────────────────

def _sync_recoveries(connection: WhoopConnection, start_date, end_date) -> int:
    """
    §RECOVERY: Fetch and store recovery scores.
    Recovery data comes from the cycle endpoint with recovery nested.
    We re-fetch cycles to get the recovery sub-object.
    """
    params = {
        'start': start_date.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
        'end': end_date.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
        'limit': 25,
    }

    records = _fetch_all_pages(connection, '/developer/v1/recovery', params)
    synced = 0

    for rec in records:
        cycle_id = rec.get('cycle_id')
        if not cycle_id:
            continue

        # §LINK: Find the local cycle to link to
        try:
            cycle = WhoopCycle.objects.get(whoop_id=cycle_id)
        except WhoopCycle.DoesNotExist:
            logger.warning('Recovery for unknown cycle %s — skipping', cycle_id)
            continue

        score = rec.get('score', {}) or {}
        defaults = {
            'user': connection.user,
            'sleep_id': rec.get('sleep_id', ''),
            'score_state': rec.get('score_state', 'pending'),
            'recovery_score': score.get('recovery_score'),
            'resting_heart_rate': score.get('resting_heart_rate'),
            'hrv_rmssd_milli': score.get('hrv_rmssd_milli'),
            'spo2_percentage': score.get('spo2_percentage'),
            'skin_temp_celsius': score.get('skin_temp_celsius'),
            'user_calibrating': score.get('user_calibrating', False),
        }

        WhoopRecovery.objects.update_or_create(
            cycle=cycle,
            defaults=defaults,
        )
        synced += 1

    return synced


# ── Sync: Sleep ───────────────────────────────────────────────────

def _sync_sleep(connection: WhoopConnection, start_date, end_date) -> int:
    """
    §SLEEP: Fetch and store sleep sessions (main sleep + naps).
    """
    params = {
        'start': start_date.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
        'end': end_date.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
        'limit': 25,
    }

    records = _fetch_all_pages(connection, '/developer/v1/activity/sleep', params)
    synced = 0

    for rec in records:
        score = rec.get('score', {}) or {}
        sleep_needed = score.get('sleep_needed', {}) or {}

        # §LINK: Find local cycle if available
        cycle = None
        cycle_id = rec.get('cycle_id')
        if cycle_id:
            try:
                cycle = WhoopCycle.objects.get(whoop_id=cycle_id)
            except WhoopCycle.DoesNotExist:
                pass

        stage_summary = score.get('stage_summary', {}) or {}

        defaults = {
            'user': connection.user,
            'cycle': cycle,
            'start': rec['start'],
            'end': rec['end'],
            'timezone_offset': rec.get('timezone_offset', '+00:00'),
            'nap': rec.get('nap', False),
            'score_state': rec.get('score_state', 'pending'),
            'sleep_performance_pct': score.get('sleep_performance_percentage'),
            'sleep_consistency_pct': score.get('sleep_consistency_percentage'),
            'sleep_efficiency_pct': score.get('sleep_efficiency_percentage'),
            'respiratory_rate': score.get('respiratory_rate'),
            'total_in_bed_milli': stage_summary.get('total_in_bed_time_milli'),
            'total_awake_milli': stage_summary.get('total_awake_time_milli'),
            'total_light_milli': stage_summary.get('total_light_sleep_time_milli'),
            'total_sws_milli': stage_summary.get('total_slow_wave_sleep_time_milli'),
            'total_rem_milli': stage_summary.get('total_rem_sleep_time_milli'),
            'sleep_cycle_count': stage_summary.get('sleep_cycle_count'),
            'disturbance_count': stage_summary.get('disturbance_count'),
            'sleep_needed_baseline_milli': sleep_needed.get('baseline_milli'),
            'sleep_needed_debt_milli': sleep_needed.get('need_from_sleep_debt_milli'),
            'sleep_needed_strain_milli': sleep_needed.get('need_from_recent_strain_milli'),
            'sleep_needed_nap_milli': sleep_needed.get('need_from_recent_nap_milli'),
        }

        WhoopSleep.objects.update_or_create(
            whoop_id=rec['id'],
            defaults=defaults,
        )
        synced += 1

    return synced


# ── Sync: Workouts ────────────────────────────────────────────────

def _sync_workouts(connection: WhoopConnection, start_date, end_date) -> int:
    """
    §WORKOUT: Fetch and store workout/activity data.
    """
    params = {
        'start': start_date.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
        'end': end_date.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
        'limit': 25,
    }

    records = _fetch_all_pages(connection, '/developer/v1/activity/workout', params)
    synced = 0

    for rec in records:
        score = rec.get('score', {}) or {}
        zone_duration = score.get('zone_duration', {}) or {}

        # §LINK: Find local cycle if available
        cycle = None
        cycle_id = rec.get('cycle_id')
        if cycle_id:
            try:
                cycle = WhoopCycle.objects.get(whoop_id=cycle_id)
            except WhoopCycle.DoesNotExist:
                pass

        # §SPORT: Resolve sport name from WHOOP sport_id
        sport_id = rec.get('sport_id', -1)
        sport_name = SPORT_MAP.get(sport_id, rec.get('sport_name', 'Unknown'))

        defaults = {
            'user': connection.user,
            'cycle': cycle,
            'sport_id': sport_id,
            'sport_name': sport_name,
            'start': rec['start'],
            'end': rec['end'],
            'timezone_offset': rec.get('timezone_offset', '+00:00'),
            'score_state': rec.get('score_state', 'pending'),
            'strain': score.get('strain'),
            'average_heart_rate': score.get('average_heart_rate'),
            'max_heart_rate': score.get('max_heart_rate'),
            'kilojoule': score.get('kilojoule'),
            'percent_recorded': score.get('percent_recorded'),
            'distance_meter': score.get('distance_meter'),
            'altitude_gain_meter': score.get('altitude_gain_meter'),
            'zone_zero_milli': zone_duration.get('zone_zero_milli'),
            'zone_one_milli': zone_duration.get('zone_one_milli'),
            'zone_two_milli': zone_duration.get('zone_two_milli'),
            'zone_three_milli': zone_duration.get('zone_three_milli'),
            'zone_four_milli': zone_duration.get('zone_four_milli'),
            'zone_five_milli': zone_duration.get('zone_five_milli'),
        }

        WhoopWorkout.objects.update_or_create(
            whoop_id=rec['id'],
            defaults=defaults,
        )
        synced += 1

    return synced


# ── Dashboard aggregation ─────────────────────────────────────────

def get_whoop_dashboard(user) -> dict:
    """
    §DASH: Aggregated dashboard for WHOOP data.
    Returns latest recovery, trends, averages, and recovery distribution.
    """
    now = timezone.now()

    # §LATEST: Most recent recovery
    latest_recovery = (
        WhoopRecovery.objects
        .filter(user=user, score_state='SCORED')
        .select_related('cycle')
        .order_by('-cycle__start')
        .first()
    )

    # §7D: 7-day recovery trend
    cutoff_7d = now - timedelta(days=7)
    recoveries_7d = list(
        WhoopRecovery.objects
        .filter(user=user, score_state='SCORED', cycle__start__gte=cutoff_7d)
        .select_related('cycle')
        .order_by('cycle__start')
        .values_list('recovery_score', flat=True)
    )

    # §AVG: Averages over last 7 days
    avg_7d = (
        WhoopRecovery.objects
        .filter(user=user, score_state='SCORED', cycle__start__gte=cutoff_7d)
        .aggregate(
            avg_hrv=Avg('hrv_rmssd_milli'),
            avg_resting_hr=Avg('resting_heart_rate'),
            avg_recovery=Avg('recovery_score'),
        )
    )

    # §SLEEP: Average sleep performance (7d)
    avg_sleep = (
        WhoopSleep.objects
        .filter(user=user, score_state='SCORED', nap=False, start__gte=cutoff_7d)
        .aggregate(avg_perf=Avg('sleep_performance_pct'))
    )

    # §STRAIN: Average strain (7d)
    avg_strain = (
        WhoopCycle.objects
        .filter(user=user, score_state='SCORED', start__gte=cutoff_7d)
        .aggregate(avg_strain=Avg('strain'))
    )

    # §DEBT: Latest sleep debt
    latest_sleep = (
        WhoopSleep.objects
        .filter(user=user, score_state='SCORED', nap=False)
        .order_by('-start')
        .first()
    )
    sleep_debt_hours = None
    if latest_sleep and latest_sleep.sleep_needed_debt_milli is not None:
        sleep_debt_hours = round(latest_sleep.sleep_needed_debt_milli / 3_600_000, 1)

    # §DIST: Recovery distribution over 30 days (green/yellow/red)
    cutoff_30d = now - timedelta(days=30)
    recoveries_30d = (
        WhoopRecovery.objects
        .filter(user=user, score_state='SCORED', cycle__start__gte=cutoff_30d)
        .values_list('recovery_score', flat=True)
    )
    distribution = {'green': 0, 'yellow': 0, 'red': 0}
    for score in recoveries_30d:
        if score is None:
            continue
        if score >= 67:
            distribution['green'] += 1
        elif score >= 34:
            distribution['yellow'] += 1
        else:
            distribution['red'] += 1

    # §CYCLES: Cycle-based data (always available even without recovery endpoints)
    cycles_7d = list(
        WhoopCycle.objects
        .filter(user=user, score_state='SCORED', start__gte=cutoff_7d)
        .order_by('start')
        .values('start', 'strain', 'average_heart_rate', 'max_heart_rate', 'kilojoule')
    )
    cycles_30d = list(
        WhoopCycle.objects
        .filter(user=user, score_state='SCORED', start__gte=cutoff_30d)
        .order_by('start')
        .values('start', 'strain', 'average_heart_rate', 'max_heart_rate', 'kilojoule')
    )
    cycles_count = WhoopCycle.objects.filter(user=user).count()

    # Latest cycle
    latest_cycle = WhoopCycle.objects.filter(user=user, score_state='SCORED').order_by('-start').first()

    # Recent history from cycles (for the table)
    recent_cycles = [
        {
            'date': c['start'].isoformat() if c['start'] else None,
            'strain': round(c['strain'], 1) if c['strain'] else None,
            'avg_hr': c['average_heart_rate'],
            'max_hr': c['max_heart_rate'],
            'calories': round(c['kilojoule'] * 0.239006, 0) if c['kilojoule'] else None,  # kJ to kcal
        }
        for c in cycles_7d
    ]

    return {
        'latest_recovery': {
            'score': latest_recovery.recovery_score if latest_recovery else None,
            'zone': latest_recovery.recovery_zone if latest_recovery else None,
            'hrv': latest_recovery.hrv_rmssd_milli if latest_recovery else None,
            'resting_hr': latest_recovery.resting_heart_rate if latest_recovery else None,
            'spo2': latest_recovery.spo2_percentage if latest_recovery else None,
            'date': latest_recovery.cycle.start.isoformat() if latest_recovery else None,
        } if latest_recovery else None,
        'recovery_trend_7d': recoveries_7d,
        'avg_hrv_7d': _round_or_none(avg_7d['avg_hrv'], 1),
        'avg_resting_hr_7d': _round_or_none(avg_7d['avg_resting_hr'], 0),
        'avg_recovery_7d': _round_or_none(avg_7d['avg_recovery'], 0),
        'avg_sleep_performance_7d': _round_or_none(avg_sleep['avg_perf'], 0),
        'avg_strain_7d': _round_or_none(avg_strain['avg_strain'], 1),
        'sleep_debt_hours': sleep_debt_hours,
        'recovery_distribution_30d': distribution,
        # §CYCLE_DATA: Always available — even without recovery/sleep/workout endpoints
        'cycles_count': cycles_count,
        'latest_cycle': {
            'date': latest_cycle.start.isoformat() if latest_cycle else None,
            'strain': round(latest_cycle.strain, 1) if latest_cycle and latest_cycle.strain else None,
            'avg_hr': latest_cycle.average_heart_rate if latest_cycle else None,
            'max_hr': latest_cycle.max_heart_rate if latest_cycle else None,
            'calories': round(latest_cycle.kilojoule * 0.239006, 0) if latest_cycle and latest_cycle.kilojoule else None,
        } if latest_cycle else None,
        'strain_trend_7d': [round(c['strain'], 1) for c in cycles_7d if c['strain']],
        'hr_trend_7d': [c['average_heart_rate'] for c in cycles_7d if c['average_heart_rate']],
        'recent_cycles': recent_cycles,
        'avg_strain_30d': _round_or_none(
            sum(c['strain'] for c in cycles_30d if c['strain']) / max(len([c for c in cycles_30d if c['strain']]), 1), 1
        ) if cycles_30d else None,
        'avg_hr_30d': _round_or_none(
            sum(c['average_heart_rate'] for c in cycles_30d if c['average_heart_rate']) / max(len([c for c in cycles_30d if c['average_heart_rate']]), 1), 0
        ) if cycles_30d else None,
        'total_calories_7d': round(sum(c['kilojoule'] * 0.239006 for c in cycles_7d if c['kilojoule']), 0) if cycles_7d else None,
    }


# ── Recovery statistics ───────────────────────────────────────────

def get_recovery_stats(user, days: int = 30) -> dict:
    """
    §RECOVERY_STATS: Deep recovery and HRV statistics over N days.
    Includes averages, min/max, trend slopes, and day-of-week breakdown.
    """
    cutoff = timezone.now() - timedelta(days=days)
    qs = (
        WhoopRecovery.objects
        .filter(user=user, score_state='SCORED', cycle__start__gte=cutoff)
        .select_related('cycle')
        .order_by('cycle__start')
    )

    if not qs.exists():
        return {'has_data': False}

    # §AGG: Basic aggregates
    aggs = qs.aggregate(
        avg_recovery=Avg('recovery_score'),
        avg_hrv=Avg('hrv_rmssd_milli'),
        avg_resting_hr=Avg('resting_heart_rate'),
        avg_spo2=Avg('spo2_percentage'),
        min_hrv=Min('hrv_rmssd_milli'),
        max_hrv=Max('hrv_rmssd_milli'),
        min_resting_hr=Min('resting_heart_rate'),
        max_resting_hr=Max('resting_heart_rate'),
        count=Count('id'),
    )

    # §TREND: Simple linear regression slope for HRV and resting HR
    hrv_trend = _compute_trend([
        (i, r.hrv_rmssd_milli)
        for i, r in enumerate(qs)
        if r.hrv_rmssd_milli is not None
    ])

    resting_hr_trend = _compute_trend([
        (i, r.resting_heart_rate)
        for i, r in enumerate(qs)
        if r.resting_heart_rate is not None
    ])

    # §DOW: Recovery by day of week (0=Monday, 6=Sunday)
    dow_map = defaultdict(list)
    for r in qs:
        if r.recovery_score is not None:
            dow = r.cycle.start.weekday()
            dow_map[dow].append(r.recovery_score)

    day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    recovery_by_dow = {}
    for dow in range(7):
        scores = dow_map.get(dow, [])
        recovery_by_dow[day_names[dow]] = (
            round(sum(scores) / len(scores), 1) if scores else None
        )

    return {
        'has_data': True,
        'days': days,
        'count': aggs['count'],
        'avg_recovery': _round_or_none(aggs['avg_recovery'], 1),
        'avg_hrv': _round_or_none(aggs['avg_hrv'], 1),
        'avg_resting_hr': _round_or_none(aggs['avg_resting_hr'], 1),
        'avg_spo2': _round_or_none(aggs['avg_spo2'], 1),
        'min_hrv': aggs['min_hrv'],
        'max_hrv': aggs['max_hrv'],
        'min_resting_hr': aggs['min_resting_hr'],
        'max_resting_hr': aggs['max_resting_hr'],
        'hrv_trend_per_day': _round_or_none(hrv_trend, 2),
        'resting_hr_trend_per_day': _round_or_none(resting_hr_trend, 2),
        'recovery_by_day_of_week': recovery_by_dow,
    }


# ── Sleep statistics ──────────────────────────────────────────────

def get_sleep_stats(user, days: int = 30) -> dict:
    """
    §SLEEP_STATS: Deep sleep statistics over N days.
    Includes duration, efficiency, stage distribution, debt, consistency.
    """
    cutoff = timezone.now() - timedelta(days=days)
    qs = (
        WhoopSleep.objects
        .filter(user=user, score_state='SCORED', nap=False, start__gte=cutoff)
        .order_by('start')
    )

    if not qs.exists():
        return {'has_data': False}

    # §AGG: Basic aggregates
    aggs = qs.aggregate(
        avg_performance=Avg('sleep_performance_pct'),
        avg_efficiency=Avg('sleep_efficiency_pct'),
        avg_respiratory=Avg('respiratory_rate'),
        avg_in_bed=Avg('total_in_bed_milli'),
        avg_light=Avg('total_light_milli'),
        avg_sws=Avg('total_sws_milli'),
        avg_rem=Avg('total_rem_milli'),
        avg_awake=Avg('total_awake_milli'),
        count=Count('id'),
    )

    # §DURATION: Average total duration in hours
    avg_duration_hours = None
    if aggs['avg_in_bed'] is not None:
        avg_duration_hours = round(aggs['avg_in_bed'] / 3_600_000, 2)

    # §STAGES: Stage distribution as percentages of total sleep time
    stage_distribution = {}
    total_sleep = sum(filter(None, [aggs['avg_light'], aggs['avg_sws'], aggs['avg_rem']]))
    if total_sleep and total_sleep > 0:
        stage_distribution = {
            'light_pct': round((aggs['avg_light'] or 0) / total_sleep * 100, 1),
            'deep_pct': round((aggs['avg_sws'] or 0) / total_sleep * 100, 1),
            'rem_pct': round((aggs['avg_rem'] or 0) / total_sleep * 100, 1),
            'awake_pct': round(
                (aggs['avg_awake'] or 0) / (aggs['avg_in_bed'] or 1) * 100, 1
            ),
        }

    # §DEBT: Average sleep debt in hours
    debt_values = [
        s.sleep_needed_debt_milli
        for s in qs
        if s.sleep_needed_debt_milli is not None
    ]
    avg_debt_hours = None
    if debt_values:
        avg_debt_hours = round(sum(debt_values) / len(debt_values) / 3_600_000, 1)

    # §CONSISTENCY: Trend of sleep consistency scores
    consistency_values = [
        s.sleep_consistency_pct
        for s in qs
        if s.sleep_consistency_pct is not None
    ]
    consistency_trend = None
    if len(consistency_values) >= 2:
        consistency_trend = _compute_trend(list(enumerate(consistency_values)))

    return {
        'has_data': True,
        'days': days,
        'count': aggs['count'],
        'avg_duration_hours': avg_duration_hours,
        'avg_efficiency': _round_or_none(aggs['avg_efficiency'], 1),
        'avg_performance': _round_or_none(aggs['avg_performance'], 1),
        'avg_respiratory_rate': _round_or_none(aggs['avg_respiratory'], 1),
        'stage_distribution_pct': stage_distribution,
        'avg_sleep_debt_hours': avg_debt_hours,
        'consistency_trend_per_day': _round_or_none(consistency_trend, 2),
    }


# ── Strain statistics ─────────────────────────────────────────────

def get_strain_stats(user, days: int = 30) -> dict:
    """
    §STRAIN_STATS: Workout and strain statistics over N days.
    Includes averages, top activities, and day-of-week breakdown.
    """
    cutoff = timezone.now() - timedelta(days=days)

    # §CYCLE: Cycle-level strain
    cycles = (
        WhoopCycle.objects
        .filter(user=user, score_state='SCORED', start__gte=cutoff)
        .order_by('start')
    )

    # §WORKOUT: Individual workouts
    workouts = (
        WhoopWorkout.objects
        .filter(user=user, score_state='SCORED', start__gte=cutoff)
        .order_by('start')
    )

    if not cycles.exists():
        return {'has_data': False}

    cycle_aggs = cycles.aggregate(
        avg_strain=Avg('strain'),
        max_strain=Max('strain'),
        total_kj=Avg('kilojoule'),
    )

    # §TOP: Top activities by frequency
    activity_counts = defaultdict(int)
    total_workout_hr = []
    for w in workouts:
        activity_counts[w.sport_name] += 1
        if w.average_heart_rate:
            total_workout_hr.append(w.average_heart_rate)

    top_activities = sorted(activity_counts.items(), key=lambda x: -x[1])[:5]

    # §CALORIES: Total calories burned (kJ → kcal)
    total_kj = cycles.aggregate(total=Avg('kilojoule'))['total']
    total_calories = None
    if total_kj is not None:
        total_calories = round(total_kj * cycles.count() / 4.184, 0)

    # §DOW: Strain by day of week
    dow_map = defaultdict(list)
    for c in cycles:
        if c.strain is not None:
            dow_map[c.start.weekday()].append(c.strain)

    day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    strain_by_dow = {}
    for dow in range(7):
        values = dow_map.get(dow, [])
        strain_by_dow[day_names[dow]] = (
            round(sum(values) / len(values), 1) if values else None
        )

    return {
        'has_data': True,
        'days': days,
        'avg_strain': _round_or_none(cycle_aggs['avg_strain'], 1),
        'max_strain': _round_or_none(cycle_aggs['max_strain'], 1),
        'total_calories': total_calories,
        'workout_count': workouts.count(),
        'top_activities': [
            {'name': name, 'count': count} for name, count in top_activities
        ],
        'avg_workout_hr': (
            round(sum(total_workout_hr) / len(total_workout_hr), 0)
            if total_workout_hr else None
        ),
        'strain_by_day_of_week': strain_by_dow,
    }


# ── Cardiovascular fitness (WHOOP + BP + blood) ──────────────────

def compute_cardiovascular_fitness(user) -> dict:
    """
    §CVF: Comprehensive cardiovascular fitness assessment combining:
    - WHOOP recovery data (resting HR, HRV)
    - Blood pressure data (from bp_services)
    - Blood biomarkers (from BloodReport)

    Returns: fitness_score (0-100), component assessments, risk level, recommendations.
    """
    from .bp_services import get_bp_statistics, classify_bp
    from .models import HealthProfile, BloodReport, BloodResult

    components = {}
    scores = []
    recommendations = []

    # §PROFILE: Get primary health profile
    profile = (
        HealthProfile.objects
        .filter(user=user)
        .order_by('-is_primary', 'id')
        .first()
    )

    # ── WHOOP: Resting HR and HRV ────────────────────────────
    # §RHR: Resting heart rate assessment
    latest_recoveries = (
        WhoopRecovery.objects
        .filter(user=user, score_state='SCORED')
        .order_by('-cycle__start')[:14]
    )

    rhr_values = [r.resting_heart_rate for r in latest_recoveries if r.resting_heart_rate]
    hrv_values = [r.hrv_rmssd_milli for r in latest_recoveries if r.hrv_rmssd_milli]

    rhr_score = None
    if rhr_values:
        avg_rhr = sum(rhr_values) / len(rhr_values)
        rhr_score = _score_resting_hr(avg_rhr)
        level = 'excellent' if rhr_score >= 80 else 'good' if rhr_score >= 60 else 'fair' if rhr_score >= 40 else 'poor'
        components['resting_heart_rate'] = {
            'value': round(avg_rhr, 1),
            'unit': 'BPM',
            'score': rhr_score,
            'level': level,
            'description': f'Average resting HR: {avg_rhr:.0f} BPM over last {len(rhr_values)} days.',
        }
        scores.append(rhr_score)
        if avg_rhr > 80:
            recommendations.append({
                'category': 'exercise',
                'text': 'Your resting heart rate is elevated. Regular aerobic exercise can help lower it.',
                'text_bg': 'Пулсът ви в покой е повишен. Редовните аеробни упражнения могат да помогнат.',
            })

    # §HRV: Heart rate variability assessment
    hrv_score = None
    if hrv_values:
        avg_hrv = sum(hrv_values) / len(hrv_values)
        hrv_score = _score_hrv(avg_hrv)
        level = 'excellent' if hrv_score >= 80 else 'good' if hrv_score >= 60 else 'fair' if hrv_score >= 40 else 'poor'
        components['hrv'] = {
            'value': round(avg_hrv, 1),
            'unit': 'ms (rMSSD)',
            'score': hrv_score,
            'level': level,
            'description': f'Average HRV: {avg_hrv:.1f} ms over last {len(hrv_values)} days.',
        }
        scores.append(hrv_score)
        if avg_hrv < 30:
            recommendations.append({
                'category': 'lifestyle',
                'text': 'Your HRV is low, indicating stress. Focus on sleep quality, meditation, and recovery.',
                'text_bg': 'HRV-то ви е ниско, което показва стрес. Фокусирайте се върху съня, медитацията и възстановяването.',
            })

    # ── Blood Pressure ────────────────────────────────────────
    # §BP: Get BP stats from bp_services
    bp_score = None
    if profile:
        try:
            bp_stats = get_bp_statistics(profile, days=30)
            if bp_stats['reading_count'] > 0:
                avg_sys = bp_stats['avg_sys']
                avg_dia = bp_stats['avg_dia']
                stage = classify_bp(round(avg_sys), round(avg_dia))
                bp_score = _score_blood_pressure(avg_sys, avg_dia)
                level = 'excellent' if bp_score >= 80 else 'good' if bp_score >= 60 else 'fair' if bp_score >= 40 else 'poor'
                components['blood_pressure'] = {
                    'systolic': round(avg_sys, 1),
                    'diastolic': round(avg_dia, 1),
                    'stage': stage,
                    'score': bp_score,
                    'level': level,
                    'description': f'30-day average: {avg_sys:.0f}/{avg_dia:.0f} mmHg ({stage}).',
                }
                scores.append(bp_score)
                if stage in ('stage_1', 'stage_2', 'crisis'):
                    recommendations.append({
                        'category': 'medical',
                        'text': f'Blood pressure is in {stage.replace("_", " ")} range. Consult your physician.',
                        'text_bg': f'Кръвното налягане е в обхват {stage.replace("_", " ")}. Консултирайте се с лекар.',
                    })
        except Exception:
            pass

    # ── Blood biomarkers ──────────────────────────────────────
    # §BLOOD: Check CV-relevant markers from latest blood report
    blood_score = None
    if profile:
        latest_report = (
            BloodReport.objects
            .filter(user=user, profile=profile)
            .order_by('-test_date')
            .first()
        )
        if latest_report:
            cv_markers = {}
            results = BloodResult.objects.filter(report=latest_report).select_related('biomarker')
            for result in results:
                name = result.biomarker.abbreviation.upper()
                if name in ('CHOL', 'TOTAL_CHOL', 'HDL', 'LDL', 'TRIG', 'TG', 'GLU', 'HBA1C', 'CRP'):
                    cv_markers[name] = {
                        'value': result.value,
                        'unit': result.unit,
                        'flag': result.flag,
                    }

            if cv_markers:
                blood_score = _score_blood_markers(cv_markers)
                components['blood_markers'] = {
                    'markers': cv_markers,
                    'score': blood_score,
                    'level': 'excellent' if blood_score >= 80 else 'good' if blood_score >= 60 else 'fair' if blood_score >= 40 else 'poor',
                    'report_date': latest_report.test_date.isoformat(),
                }
                scores.append(blood_score)

    # ── Overall fitness score ─────────────────────────────────
    # §SCORE: Weighted average of all available component scores
    fitness_score = None
    risk_level = 'unknown'
    if scores:
        fitness_score = round(sum(scores) / len(scores))
        if fitness_score >= 80:
            risk_level = 'low'
        elif fitness_score >= 60:
            risk_level = 'moderate'
        elif fitness_score >= 40:
            risk_level = 'elevated'
        else:
            risk_level = 'high'

    return {
        'fitness_score': fitness_score,
        'risk_level': risk_level,
        'components': components,
        'component_count': len(scores),
        'recommendations': recommendations,
    }


# ── Disconnect WHOOP ──────────────────────────────────────────────

def disconnect_whoop(user) -> None:
    """
    §DISCONNECT: Revoke access and delete the WhoopConnection.
    Attempts to revoke the token via WHOOP API, then deletes local data.
    """
    try:
        connection = WhoopConnection.objects.get(user=user)
    except WhoopConnection.DoesNotExist:
        return

    # §REVOKE: Best-effort token revocation via WHOOP API
    if connection.access_token:
        try:
            requests.post(
                f'{WHOOP_API_BASE}/oauth/oauth2/revoke',
                data={
                    'token': connection.access_token,
                    'client_id': WHOOP_CLIENT_ID,
                    'client_secret': WHOOP_CLIENT_SECRET,
                },
                timeout=10,
            )
        except requests.RequestException:
            logger.warning('Failed to revoke WHOOP token for user %s', user.id)

    # §CLEANUP: Delete all WHOOP data for this user
    WhoopWorkout.objects.filter(user=user).delete()
    WhoopSleep.objects.filter(user=user).delete()
    WhoopRecovery.objects.filter(user=user).delete()
    WhoopCycle.objects.filter(user=user).delete()
    connection.delete()


# ── Scoring helpers ───────────────────────────────────────────────

def _score_resting_hr(rhr: float) -> int:
    """
    §SCORE_RHR: Score resting heart rate on 0-100 scale.
    <50 = excellent (athlete), 50-60 = very good, 60-70 = good,
    70-80 = average, 80-90 = below average, >90 = poor.
    """
    if rhr <= 50:
        return 100
    if rhr <= 60:
        return 90 - int((rhr - 50) * 1.0)
    if rhr <= 70:
        return 80 - int((rhr - 60) * 2.0)
    if rhr <= 80:
        return 60 - int((rhr - 70) * 2.0)
    if rhr <= 90:
        return 40 - int((rhr - 80) * 2.0)
    return max(0, 20 - int((rhr - 90) * 1.0))


def _score_hrv(hrv: float) -> int:
    """
    §SCORE_HRV: Score HRV (rMSSD) on 0-100 scale.
    Higher is generally better. Very individual, but population norms:
    >100ms = excellent, 60-100 = good, 40-60 = fair, 20-40 = low, <20 = very low.
    """
    if hrv >= 100:
        return 100
    if hrv >= 60:
        return 70 + int((hrv - 60) * 0.75)
    if hrv >= 40:
        return 50 + int((hrv - 40) * 1.0)
    if hrv >= 20:
        return 25 + int((hrv - 20) * 1.25)
    return max(0, int(hrv * 1.25))


def _score_blood_pressure(sys: float, dia: float) -> int:
    """
    §SCORE_BP: Score blood pressure on 0-100 scale.
    Optimal: <120/80, Elevated: 120-129/<80, Stage 1: 130-139/80-89, etc.
    """
    # Score systolic
    if sys < 120:
        sys_score = 100
    elif sys < 130:
        sys_score = 80 - int((sys - 120) * 2)
    elif sys < 140:
        sys_score = 60 - int((sys - 130) * 2)
    elif sys < 160:
        sys_score = 40 - int((sys - 140) * 1)
    else:
        sys_score = max(0, 20 - int((sys - 160) * 0.5))

    # Score diastolic
    if dia < 80:
        dia_score = 100
    elif dia < 90:
        dia_score = 70 - int((dia - 80) * 3)
    elif dia < 100:
        dia_score = 40 - int((dia - 90) * 2)
    else:
        dia_score = max(0, 20 - int((dia - 100) * 1))

    # Use the worse of the two (AHA guideline approach)
    return min(sys_score, dia_score)


def _score_blood_markers(markers: dict) -> int:
    """
    §SCORE_BLOOD: Score cardiovascular blood markers on 0-100 scale.
    Uses flag values from blood results (optimal/normal/borderline/abnormal/critical).
    """
    flag_scores = {
        'optimal': 100,
        'normal': 85,
        'borderline_low': 60,
        'borderline_high': 60,
        'abnormal_low': 35,
        'abnormal_high': 35,
        'critical_low': 10,
        'critical_high': 10,
    }

    scores = []
    for key, data in markers.items():
        flag = data.get('flag', 'normal')
        scores.append(flag_scores.get(flag, 70))

    return round(sum(scores) / len(scores)) if scores else 70


# ── Math helpers ──────────────────────────────────────────────────

def _round_or_none(value, decimals: int):
    """§UTIL: Round a value if not None."""
    if value is None:
        return None
    return round(value, decimals)


def _compute_trend(points: list) -> float:
    """
    §TREND: Simple linear regression slope from (index, value) pairs.
    Returns slope (change per unit index). Positive = improving for HRV, worsening for RHR.
    """
    if len(points) < 2:
        return None

    n = len(points)
    sum_x = sum(p[0] for p in points)
    sum_y = sum(p[1] for p in points)
    sum_xy = sum(p[0] * p[1] for p in points)
    sum_x2 = sum(p[0] ** 2 for p in points)

    denom = n * sum_x2 - sum_x ** 2
    if denom == 0:
        return 0.0

    slope = (n * sum_xy - sum_x * sum_y) / denom
    return slope
