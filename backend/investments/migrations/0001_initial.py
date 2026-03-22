from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('properties', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Investment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True, default='')),
                ('investment_type', models.CharField(choices=[('renovation', 'Renovation'), ('equipment', 'Equipment'), ('expansion', 'Expansion'), ('energy', 'Energy Efficiency'), ('land', 'Land Purchase'), ('furniture', 'Furniture'), ('security', 'Security System'), ('stock', 'Stock'), ('crypto', 'Cryptocurrency'), ('bond', 'Bond'), ('mutual_fund', 'Mutual Fund'), ('other', 'Other')], default='other', max_length=20)),
                ('status', models.CharField(choices=[('planned', 'Planned'), ('in_progress', 'In Progress'), ('completed', 'Completed'), ('cancelled', 'Cancelled')], default='planned', max_length=20)),
                ('amount_invested', models.DecimalField(decimal_places=2, max_digits=12)),
                ('expected_return', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('actual_return', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('ticker_symbol', models.CharField(blank=True, default='', max_length=20)),
                ('quantity', models.DecimalField(blank=True, decimal_places=4, max_digits=14, null=True)),
                ('purchase_price', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('current_price', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('investment_date', models.DateField()),
                ('completion_date', models.DateField(blank=True, null=True)),
                ('notes', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('property', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='investments', to='properties.property')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='investments', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-investment_date'],
                'indexes': [
                    models.Index(fields=['user', 'status'], name='investments__user_id_3b8e4a_idx'),
                    models.Index(fields=['investment_type'], name='investments__investm_a1c2d3_idx'),
                    models.Index(fields=['-investment_date'], name='investments__investm_d4e5f6_idx'),
                ],
            },
        ),
    ]
