# ── health/whoop_models.py ─────────────────────────────────────────────
# WHOOP wearable integration: OAuth2 connection, cycles, recovery, sleep, workouts.
# Schema: WhoopConnection (1:1 user), WhoopCycle → WhoopRecovery, WhoopSleep, WhoopWorkout
#
# §NAV: whoop_models → whoop_serializers → whoop_views → whoop_urls → whoop_services
# §OWNER: every model scoped by user FK (same pattern as all DomApp models)
# §SYNC: data pulled from WHOOP API via whoop_services.sync_whoop_data()

from django.db import models
from django.conf import settings


# ── Score state choices (shared across all WHOOP scored models) ────
SCORE_STATE_CHOICES = [
    ('scored', 'Scored'),
    ('pending', 'Pending'),
    ('unscorable', 'Unscorable'),
]


# ── OAuth2 connection state ────────────────────────────────────────

class WhoopConnection(models.Model):
    """
    §CONN: OAuth2 connection between a DomApp user and their WHOOP account.
    One-to-one per user. Stores tokens (encrypted-ready) and sync state.

    §TOKEN: access_token/refresh_token stored as plain text in dev.
    In production, use django-encrypted-model-fields or similar.
    §SYNC: last_sync_at tracks the most recent successful data pull.
    §ERR: sync_error captures the last error for display in the UI.
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='whoop_connection',
    )
    whoop_user_id = models.BigIntegerField(null=True, blank=True)
    access_token = models.TextField(default='')
    refresh_token = models.TextField(default='')
    token_expires_at = models.DateTimeField(null=True, blank=True)
    scopes = models.TextField(default='', blank=True)
    connected_at = models.DateTimeField(auto_now_add=True)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    sync_error = models.TextField(default='', blank=True)

    class Meta:
        ordering = ['-connected_at']

    def __str__(self):
        status = 'active' if self.is_active else 'inactive'
        return f"WHOOP [{status}] — user {self.user_id}"

    @property
    def is_token_expired(self):
        """§TOKEN: Check if access token needs refresh."""
        from django.utils import timezone
        if not self.token_expires_at:
            return True
        return timezone.now() >= self.token_expires_at


# ── Daily physiological cycle ──────────────────────────────────────

class WhoopCycle(models.Model):
    """
    §CYCLE: One physiological cycle from WHOOP (roughly one day).
    Contains strain score and heart rate data.

    §STRAIN: 0-21 scale. <10 = light, 10-14 = moderate, 14-18 = high, 18+ = overreaching.
    §LINK: recovery/sleep/workouts FK back to this cycle.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='whoop_cycles',
    )
    whoop_id = models.BigIntegerField(unique=True)
    start = models.DateTimeField()
    end = models.DateTimeField(null=True, blank=True)
    timezone_offset = models.CharField(max_length=10, default='+00:00')
    score_state = models.CharField(
        max_length=12, choices=SCORE_STATE_CHOICES, default='pending',
    )
    strain = models.FloatField(null=True, blank=True)
    kilojoule = models.FloatField(null=True, blank=True)
    average_heart_rate = models.IntegerField(null=True, blank=True)
    max_heart_rate = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-start']
        indexes = [
            models.Index(fields=['user', '-start']),
        ]

    def __str__(self):
        strain_str = f"{self.strain:.1f}" if self.strain is not None else '?'
        return f"Cycle {self.whoop_id} — strain {strain_str} — {self.start:%Y-%m-%d}"


# ── Recovery score linked to a cycle ───────────────────────────────

class WhoopRecovery(models.Model):
    """
    §RECOVERY: Recovery score for a physiological cycle.
    One recovery per cycle (OneToOne).

    §SCORE: 0-100. Green (67-100), yellow (34-66), red (0-33).
    §HRV: Heart rate variability in milliseconds (rMSSD method).
    §SPO2: Blood oxygen saturation percentage.
    §CALIBRATING: First 4-5 days, WHOOP is calibrating — scores are less accurate.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='whoop_recoveries',
    )
    cycle = models.OneToOneField(
        WhoopCycle,
        on_delete=models.CASCADE,
        related_name='recovery',
    )
    sleep_id = models.CharField(max_length=100, default='', blank=True)
    score_state = models.CharField(
        max_length=12, choices=SCORE_STATE_CHOICES, default='pending',
    )
    recovery_score = models.IntegerField(null=True, blank=True)
    resting_heart_rate = models.IntegerField(null=True, blank=True)
    hrv_rmssd_milli = models.FloatField(null=True, blank=True)
    spo2_percentage = models.FloatField(null=True, blank=True)
    skin_temp_celsius = models.FloatField(null=True, blank=True)
    user_calibrating = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-cycle__start']
        indexes = [
            models.Index(fields=['user', '-created_at']),
        ]
        verbose_name_plural = 'whoop recoveries'

    def __str__(self):
        score_str = f"{self.recovery_score}%" if self.recovery_score is not None else '?'
        return f"Recovery {score_str} — cycle {self.cycle_id}"

    @property
    def recovery_zone(self):
        """§ZONE: Green (67-100), yellow (34-66), red (0-33)."""
        if self.recovery_score is None:
            return 'unknown'
        if self.recovery_score >= 67:
            return 'green'
        if self.recovery_score >= 34:
            return 'yellow'
        return 'red'


# ── Sleep data ─────────────────────────────────────────────────────

class WhoopSleep(models.Model):
    """
    §SLEEP: Sleep session from WHOOP (main sleep or nap).
    Includes sleep stages, efficiency, and sleep need calculations.

    §PERF: sleep_performance_pct = (total_sleep / sleep_needed) * 100
    §STAGES: light + SWS (deep) + REM = total sleep time (excluding awake).
    §DEBT: sleep_needed_debt_milli = accumulated sleep debt WHOOP is tracking.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='whoop_sleeps',
    )
    whoop_id = models.CharField(max_length=100, unique=True)
    cycle = models.ForeignKey(
        WhoopCycle,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sleeps',
    )
    start = models.DateTimeField()
    end = models.DateTimeField()
    timezone_offset = models.CharField(max_length=10, default='+00:00')
    nap = models.BooleanField(default=False)
    score_state = models.CharField(
        max_length=12, choices=SCORE_STATE_CHOICES, default='pending',
    )

    # §SCORES: Performance and consistency
    sleep_performance_pct = models.IntegerField(null=True, blank=True)
    sleep_consistency_pct = models.IntegerField(null=True, blank=True)
    sleep_efficiency_pct = models.FloatField(null=True, blank=True)
    respiratory_rate = models.FloatField(null=True, blank=True)

    # §DURATION: Stage durations in milliseconds
    total_in_bed_milli = models.BigIntegerField(null=True, blank=True)
    total_awake_milli = models.BigIntegerField(null=True, blank=True)
    total_light_milli = models.BigIntegerField(null=True, blank=True)
    total_sws_milli = models.BigIntegerField(null=True, blank=True)
    total_rem_milli = models.BigIntegerField(null=True, blank=True)
    sleep_cycle_count = models.IntegerField(null=True, blank=True)
    disturbance_count = models.IntegerField(null=True, blank=True)

    # §NEED: Sleep need calculations from WHOOP
    sleep_needed_baseline_milli = models.BigIntegerField(null=True, blank=True)
    sleep_needed_debt_milli = models.BigIntegerField(null=True, blank=True)
    sleep_needed_strain_milli = models.BigIntegerField(null=True, blank=True)
    sleep_needed_nap_milli = models.BigIntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-start']
        indexes = [
            models.Index(fields=['user', '-start']),
        ]

    def __str__(self):
        kind = 'Nap' if self.nap else 'Sleep'
        perf = f"{self.sleep_performance_pct}%" if self.sleep_performance_pct is not None else '?'
        return f"{kind} {perf} — {self.start:%Y-%m-%d}"

    @property
    def duration_hours(self):
        """§CALC: Total in-bed duration in hours."""
        if self.total_in_bed_milli is not None:
            return round(self.total_in_bed_milli / 3_600_000, 2)
        return None

    @property
    def total_sleep_milli(self):
        """§CALC: Actual sleep = light + SWS + REM (excludes awake)."""
        stages = [self.total_light_milli, self.total_sws_milli, self.total_rem_milli]
        if all(s is not None for s in stages):
            return sum(stages)
        return None


# ── Workout / strain data ──────────────────────────────────────────

class WhoopWorkout(models.Model):
    """
    §WORKOUT: Single workout/activity from WHOOP.
    Includes strain, heart rate zones, and distance data.

    §STRAIN: 0-21 scale (same as cycle strain).
    §ZONES: Six heart rate zones (0-5), durations in milliseconds.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='whoop_workouts',
    )
    whoop_id = models.CharField(max_length=100, unique=True)
    cycle = models.ForeignKey(
        WhoopCycle,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='workouts',
    )
    sport_id = models.IntegerField(default=0)
    sport_name = models.CharField(max_length=100, default='')
    start = models.DateTimeField()
    end = models.DateTimeField()
    timezone_offset = models.CharField(max_length=10, default='+00:00')
    score_state = models.CharField(
        max_length=12, choices=SCORE_STATE_CHOICES, default='pending',
    )

    # §METRICS: Workout scores
    strain = models.FloatField(null=True, blank=True)
    average_heart_rate = models.IntegerField(null=True, blank=True)
    max_heart_rate = models.IntegerField(null=True, blank=True)
    kilojoule = models.FloatField(null=True, blank=True)
    percent_recorded = models.IntegerField(null=True, blank=True)
    distance_meter = models.FloatField(null=True, blank=True)
    altitude_gain_meter = models.FloatField(null=True, blank=True)

    # §ZONES: Heart rate zone durations (milliseconds)
    zone_zero_milli = models.BigIntegerField(null=True, blank=True)
    zone_one_milli = models.BigIntegerField(null=True, blank=True)
    zone_two_milli = models.BigIntegerField(null=True, blank=True)
    zone_three_milli = models.BigIntegerField(null=True, blank=True)
    zone_four_milli = models.BigIntegerField(null=True, blank=True)
    zone_five_milli = models.BigIntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-start']
        indexes = [
            models.Index(fields=['user', '-start']),
        ]

    def __str__(self):
        strain_str = f"{self.strain:.1f}" if self.strain is not None else '?'
        return f"{self.sport_name} — strain {strain_str} — {self.start:%Y-%m-%d}"

    @property
    def duration_minutes(self):
        """§CALC: Workout duration in minutes from start/end."""
        if self.start and self.end:
            delta = self.end - self.start
            return round(delta.total_seconds() / 60, 1)
        return None
