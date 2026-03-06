from django.db import models
from properties.models import Property


class Document(models.Model):
    """
    A document attached to a property — insurance policies, mortgage letters,
    utility statements, lease agreements, tax records, etc.

    Smart folder system: document_type maps to property sections.
    When a property has insurance_provider filled, the 'insurance' folder
    auto-appears with linked documents.

    Version chain: 'replaces' links to the previous version of the same
    document (e.g. renewed insurance policy replaces last year's).
    """
    DOCUMENT_TYPES = [
        # Property-linked types (map to property metadata sections)
        ('insurance', 'Insurance'),
        ('mortgage', 'Mortgage'),
        ('lease', 'Lease Agreement'),
        ('tax', 'Tax'),
        ('utility_electricity', 'Electricity'),
        ('utility_water', 'Water'),
        ('utility_gas', 'Gas'),
        ('utility_heating', 'Heating'),
        ('utility_internet', 'Internet'),
        ('building_mgmt', 'Building Management'),
        ('security', 'Security'),
        # Standalone types
        ('deed', 'Property Deed'),
        ('notary', 'Notary Act'),
        ('valuation', 'Valuation Report'),
        ('inspection', 'Inspection Report'),
        ('maintenance', 'Maintenance'),
        ('receipt', 'Receipt'),
        ('photo', 'Photo'),
        ('other', 'Other'),
    ]

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name='documents')
    file = models.FileField(upload_to='documents/')
    document_type = models.CharField(max_length=30, choices=DOCUMENT_TYPES)
    label = models.CharField(max_length=255, blank=True, default='',
                             help_text='Optional display name (auto-derived from filename if blank)')
    expiry_date = models.DateField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    file_size = models.PositiveIntegerField(default=0, help_text='File size in bytes')
    uploaded_at = models.DateTimeField(auto_now_add=True, null=True)

    # Version chain — links to the document this one replaces (e.g. renewed policy)
    replaces = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='replaced_by',
        help_text='Previous version of this document'
    )

    # Reminder tracking for expiry notifications
    reminder_30_days = models.BooleanField(default=False, help_text='Has 30-day reminder been sent?')
    reminder_5_days = models.BooleanField(default=False, help_text='Has 5-day reminder been sent?')

    class Meta:
        ordering = ['-uploaded_at']
        indexes = [
            models.Index(fields=['property', 'document_type']),
            models.Index(fields=['expiry_date']),
        ]

    def __str__(self):
        return f"{self.get_document_type_display()} — {self.property.name}"

    def save(self, *args, **kwargs):
        # Auto-populate file_size from uploaded file
        if self.file and hasattr(self.file, 'size'):
            self.file_size = self.file.size
        # Auto-derive label from filename if not provided
        if not self.label and self.file:
            name = self.file.name.split('/')[-1]
            # Remove extension for display
            self.label = name.rsplit('.', 1)[0] if '.' in name else name
        super().save(*args, **kwargs)


# Mapping: document_type → property fields that auto-generate the folder
# If any of these fields are non-empty, the folder appears in the smart view
FOLDER_FIELD_MAP = {
    'insurance': ['insurance_provider', 'insurance_policy_number', 'annual_insurance_cost'],
    'mortgage': ['mortgage_provider', 'mortgage_account_number', 'mortgage_monthly_payment'],
    'utility_electricity': ['electricity_provider', 'electricity_account_number'],
    'utility_water': ['water_provider', 'water_account_number'],
    'utility_gas': ['gas_provider', 'gas_account_number'],
    'utility_heating': ['heating_provider', 'heating_account_number'],
    'utility_internet': ['internet_provider', 'internet_account_number'],
    'building_mgmt': ['building_management_provider', 'building_management_account_number', 'building_management_monthly_fee'],
    'security': ['security_provider', 'security_account_number'],
}


def get_smart_folders(prop):
    """
    Return list of document types that should appear as folders for this property.
    Includes types that have documents + types linked to filled property fields.
    """
    # Always-visible folders (core document types)
    always = ['lease', 'deed', 'tax']

    # Field-linked folders (appear when property metadata is filled)
    field_linked = []
    for doc_type, fields in FOLDER_FIELD_MAP.items():
        if any(getattr(prop, f, None) for f in fields):
            field_linked.append(doc_type)

    # Types that have existing documents (even if property field is empty)
    existing = list(
        Document.objects.filter(property=prop)
        .values_list('document_type', flat=True)
        .distinct()
    )

    # Merge and deduplicate, preserving order
    seen = set()
    result = []
    for t in always + field_linked + existing:
        if t not in seen:
            seen.add(t)
            result.append(t)

    return result
