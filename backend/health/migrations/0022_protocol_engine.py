# backend/health/migrations/0008_protocol_engine.py

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('health', '0021_bpmedication_photo_bpmedication_photo_prescription_and_more'),
        ('accounts', '0001_initial'),
    ]

    operations = [
        # GeneticProfile
        migrations.CreateModel(
            name='GeneticProfile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('cardiovascular_risk', models.IntegerField(default=50)),
                ('metabolic_risk', models.IntegerField(default=50)),
                ('inflammation_risk', models.IntegerField(default=50)),
                ('longevity_potential', models.IntegerField(default=50)),
                ('nutrient_absorption', models.JSONField(default=dict)),
                ('cyp_metabolizer_status', models.JSONField(default=dict)),
                ('recommended_supplements', models.JSONField(default=list)),
                ('raw_genetic_data', models.JSONField(default=dict)),
                ('last_updated', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='genetic_profile', to='accounts.user')),
            ],
            options={'verbose_name_plural': 'genetic profiles'},
        ),

        # HealthProtocol
        migrations.CreateModel(
            name='HealthProtocol',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('description', models.TextField()),
                ('triggered_by', models.JSONField(default=dict)),
                ('start_date', models.DateField(auto_now_add=True)),
                ('end_date', models.DateField(blank=True, null=True)),
                ('status', models.CharField(choices=[('active', 'Active'), ('paused', 'Paused'), ('completed', 'Completed'), ('archived', 'Archived')], default='active', max_length=20)),
                ('daily_requirements', models.JSONField(default=dict)),
                ('daily_log_fields', models.JSONField(default=list)),
                ('adherence_percentage', models.FloatField(default=0.0)),
                ('baseline_biomarkers', models.JSONField(default=dict)),
                ('expected_outcomes', models.JSONField(default=dict)),
                ('confidence_score', models.FloatField(default=0.7)),
                ('evidence_sources', models.JSONField(default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='health_protocols', to='accounts.user')),
            ],
            options={'verbose_name_plural': 'health protocols', 'ordering': ['-start_date']},
        ),

        # Add indexes
        migrations.AddIndex(
            model_name='healthprotocol',
            index=models.Index(fields=['user', 'status'], name='health_prot_user_status_idx'),
        ),
        migrations.AddIndex(
            model_name='healthprotocol',
            index=models.Index(fields=['user', 'start_date'], name='health_prot_user_start_idx'),
        ),

        # DailyProtocolLog
        migrations.CreateModel(
            name='DailyProtocolLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField(db_index=True)),
                ('mood', models.IntegerField(blank=True, null=True)),
                ('energy_level', models.IntegerField(blank=True, null=True)),
                ('stress_level', models.IntegerField(blank=True, null=True)),
                ('weight_kg', models.FloatField(blank=True, null=True)),
                ('systolic_bp', models.IntegerField(blank=True, null=True)),
                ('diastolic_bp', models.IntegerField(blank=True, null=True)),
                ('resting_heart_rate', models.IntegerField(blank=True, null=True)),
                ('sleep_hours', models.FloatField(blank=True, null=True)),
                ('sleep_quality', models.IntegerField(blank=True, null=True)),
                ('sleep_notes', models.TextField(blank=True)),
                ('whoop_recovery_score', models.IntegerField(blank=True, null=True)),
                ('supplements_taken', models.JSONField(default=dict)),
                ('supplement_notes', models.TextField(blank=True)),
                ('meals', models.JSONField(default=list)),
                ('diet_notes', models.TextField(blank=True)),
                ('water_intake_ml', models.IntegerField(blank=True, null=True)),
                ('exercise_type', models.CharField(blank=True, max_length=50)),
                ('exercise_duration_min', models.IntegerField(blank=True, null=True)),
                ('exercise_intensity', models.CharField(blank=True, max_length=20)),
                ('whoop_strain_score', models.IntegerField(blank=True, null=True)),
                ('protocol_adherence_pct', models.FloatField(default=0.0)),
                ('protocol_notes', models.TextField(blank=True)),
                ('symptoms', models.JSONField(default=list)),
                ('side_effects', models.TextField(blank=True)),
                ('is_complete', models.BooleanField(default=False)),
                ('ai_insights', models.JSONField(default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('protocol', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='daily_logs', to='health.healthprotocol')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='daily_protocol_logs', to='accounts.user')),
            ],
            options={'unique_together': {('user', 'protocol', 'date')}},
        ),

        # Add indexes for DailyProtocolLog
        migrations.AddIndex(
            model_name='dailyprotocollog',
            index=models.Index(fields=['user', 'date'], name='daily_log_user_date_idx'),
        ),
        migrations.AddIndex(
            model_name='dailyprotocollog',
            index=models.Index(fields=['protocol', 'date'], name='daily_log_prot_date_idx'),
        ),

        # ProtocolRecommendation
        migrations.CreateModel(
            name='ProtocolRecommendation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('category', models.CharField(max_length=30)),
                ('title', models.CharField(max_length=255)),
                ('description', models.TextField()),
                ('priority', models.CharField(choices=[('critical', 'Critical'), ('high', 'High'), ('medium', 'Medium'), ('low', 'Low')], default='medium', max_length=20)),
                ('evidence', models.JSONField(default=dict)),
                ('actionable_steps', models.JSONField(default=list)),
                ('expected_impact', models.JSONField(default=dict)),
                ('is_accepted', models.BooleanField(default=False)),
                ('is_implemented', models.BooleanField(default=False)),
                ('implementation_date', models.DateField(blank=True, null=True)),
                ('implementation_notes', models.TextField(blank=True)),
                ('outcome', models.CharField(blank=True, max_length=20, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('protocol', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='recommendations', to='health.healthprotocol')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='protocol_recommendations', to='accounts.user')),
            ],
            options={'ordering': ['-priority', '-created_at']},
        ),

        migrations.AddIndex(
            model_name='protocolrecommendation',
            index=models.Index(fields=['user', 'is_accepted'], name='rec_user_accepted_idx'),
        ),
    ]
