from django.apps import AppConfig


class HealthConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'health'
    verbose_name = 'Health Tracker'

    def ready(self):
        """
        Register signals when Django starts

        Signals:
        - DailyProtocolLog.created → Queue insights generation
        - HealthProtocol.created → Initialize baseline biomarkers
        """
        import health.protocol_signals  # noqa
