"""
Simplify Tenant model to contact-only.

Property assignment, dates, deposit, and active status now live on the Lease model.
Tenant becomes: user FK + full_name + phone + email + id_number.

Steps:
1. Add user field (nullable)
2. Populate user from property.user for existing rows
3. Make user non-nullable
4. Remove old fields (property, start_date, end_date, deposit_amount, deposit_held, is_active)
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def populate_user_from_property(apps, schema_editor):
    """Copy the user FK from the tenant's property to the tenant directly."""
    Tenant = apps.get_model('tenants', 'Tenant')
    for tenant in Tenant.objects.select_related('property').all():
        tenant.user_id = tenant.property.user_id
        tenant.save(update_fields=['user_id'])


class Migration(migrations.Migration):

    dependencies = [
        ("tenants", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Step 1: Add user as nullable
        migrations.AddField(
            model_name="tenant",
            name="user",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="tenants",
                to=settings.AUTH_USER_MODEL,
                help_text="The property manager who manages this tenant",
            ),
        ),

        # Step 2: Populate user from property.user
        migrations.RunPython(populate_user_from_property, migrations.RunPython.noop),

        # Step 3: Make user non-nullable
        migrations.AlterField(
            model_name="tenant",
            name="user",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="tenants",
                to=settings.AUTH_USER_MODEL,
                help_text="The property manager who manages this tenant",
            ),
        ),

        # Step 4: Remove old fields
        migrations.RemoveField(model_name="tenant", name="property"),
        migrations.RemoveField(model_name="tenant", name="start_date"),
        migrations.RemoveField(model_name="tenant", name="end_date"),
        migrations.RemoveField(model_name="tenant", name="deposit_amount"),
        migrations.RemoveField(model_name="tenant", name="deposit_held"),
        migrations.RemoveField(model_name="tenant", name="is_active"),
    ]
