from django.conf import settings
from django.db import models
from decimal import Decimal


CURRENCY_CHOICES = [
    ('GBP', 'GBP'),
    ('EUR', 'EUR'),
    ('BGN', 'BGN'),
    ('USD', 'USD'),
    ('CHF', 'CHF'),
]

ASSET_TYPE_CHOICES = [
    ('stock', 'Stock'),
    ('etf', 'ETF'),
    ('crypto', 'Crypto'),
    ('bond', 'Bond'),
    ('fund', 'Fund'),
]

TRANSACTION_TYPE_CHOICES = [
    ('buy', 'Buy'),
    ('sell', 'Sell'),
    ('dividend', 'Dividend'),
    ('fee', 'Fee'),
    ('split', 'Split'),
    ('transfer_in', 'Transfer In'),
    ('transfer_out', 'Transfer Out'),
]

CONDITION_CHOICES = [
    ('above', 'Above'),
    ('below', 'Below'),
]


class Portfolio(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='portfolios'
    )
    name = models.CharField(max_length=255)
    country = models.CharField(max_length=100)
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default='EUR')
    broker = models.CharField(max_length=255, blank=True, default='')
    description = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['currency']),
        ]

    def __str__(self):
        return f"{self.name} ({self.currency})"


class Holding(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='holdings'
    )
    portfolio = models.ForeignKey(
        Portfolio, on_delete=models.CASCADE, related_name='holdings'
    )
    ticker = models.CharField(max_length=20)
    name = models.CharField(max_length=255)
    asset_type = models.CharField(max_length=10, choices=ASSET_TYPE_CHOICES)
    sector = models.CharField(max_length=100, blank=True, default='')
    quantity = models.DecimalField(max_digits=14, decimal_places=6, default=0)
    avg_purchase_price = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    current_price = models.DecimalField(
        max_digits=12, decimal_places=4, blank=True, null=True
    )
    currency = models.CharField(max_length=3, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['ticker']
        indexes = [
            models.Index(fields=['user', 'portfolio']),
            models.Index(fields=['ticker']),
            models.Index(fields=['asset_type']),
        ]

    def __str__(self):
        return f"{self.ticker} — {self.name}"

    def total_invested(self):
        return self.quantity * self.avg_purchase_price

    def market_value(self):
        if self.current_price is not None:
            return self.quantity * self.current_price
        return Decimal('0')

    def gain_loss(self):
        return self.market_value() - self.total_invested()

    def gain_loss_pct(self):
        invested = self.total_invested()
        if invested > 0:
            return (self.gain_loss() / invested) * Decimal('100')
        return Decimal('0')


class Transaction(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='transactions'
    )
    holding = models.ForeignKey(
        Holding, on_delete=models.CASCADE, related_name='transactions'
    )
    transaction_type = models.CharField(max_length=15, choices=TRANSACTION_TYPE_CHOICES)
    quantity = models.DecimalField(max_digits=14, decimal_places=6, default=0)
    price_per_unit = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    fees = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    date = models.DateField()
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['user', 'holding']),
            models.Index(fields=['transaction_type']),
            models.Index(fields=['-date']),
        ]

    def __str__(self):
        return f"{self.transaction_type} {self.quantity}x {self.holding.ticker} @ {self.price_per_unit}"


class WatchlistItem(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='watchlist_items'
    )
    ticker = models.CharField(max_length=20)
    name = models.CharField(max_length=255)
    asset_type = models.CharField(max_length=10, choices=ASSET_TYPE_CHOICES)
    target_price = models.DecimalField(
        max_digits=12, decimal_places=4, blank=True, null=True
    )
    current_price = models.DecimalField(
        max_digits=12, decimal_places=4, blank=True, null=True
    )
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['ticker']

    def __str__(self):
        return f"{self.ticker} — {self.name}"


class PriceAlert(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='price_alerts'
    )
    ticker = models.CharField(max_length=20)
    name = models.CharField(max_length=255, blank=True, default='')
    condition = models.CharField(max_length=5, choices=CONDITION_CHOICES)
    target_price = models.DecimalField(max_digits=12, decimal_places=4)
    current_price = models.DecimalField(
        max_digits=12, decimal_places=4, blank=True, null=True
    )
    triggered = models.BooleanField(default=False)
    triggered_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Alert: {self.ticker} {self.condition} {self.target_price}"


# §MODEL:PropertyAnalysis — saved property investment analysis
# §FLOW: user submits form → services.py computes → result saved here
PROPERTY_TYPE_CHOICES = [
    ('apartment', 'Apartment'),
    ('house', 'House'),
    ('studio', 'Studio'),
    ('penthouse', 'Penthouse'),
    ('commercial', 'Commercial'),
    ('villa', 'Villa'),
]

CONDITION_CHOICES_PROP = [
    ('new', 'New Build'),
    ('renovated', 'Renovated'),
    ('good', 'Good Condition'),
    ('needs_work', 'Needs Work'),
]

FURNISHING_CHOICES = [
    ('unfurnished', 'Unfurnished'),
    ('semi', 'Semi-Furnished'),
    ('fully', 'Fully Furnished'),
]

VERDICT_CHOICES = [
    ('strong_buy', 'Strong Buy'),
    ('buy', 'Buy'),
    ('hold', 'Hold'),
    ('overpriced', 'Overpriced'),
    ('avoid', 'Avoid'),
]


class PropertyAnalysis(models.Model):
    """
    §MODEL — Stores property investment analysis results.
    Each record = one deal evaluation with inputs + computed metrics + verdict.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='property_analyses'
    )

    # ── Input fields (what the user enters) ──
    name = models.CharField(max_length=255, help_text='Label for this analysis')
    country = models.CharField(max_length=100)
    city = models.CharField(max_length=100)
    area = models.CharField(max_length=200, blank=True, default='')
    property_type = models.CharField(max_length=20, choices=PROPERTY_TYPE_CHOICES)
    square_meters = models.DecimalField(max_digits=10, decimal_places=2)
    asking_price = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, default='EUR')
    parking_included = models.BooleanField(default=False)
    parking_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        help_text='Separate parking cost if not included'
    )
    num_bedrooms = models.IntegerField(default=1)
    condition = models.CharField(
        max_length=20, choices=CONDITION_CHOICES_PROP, default='good'
    )
    furnishing = models.CharField(
        max_length=20, choices=FURNISHING_CHOICES, default='unfurnished'
    )
    floor = models.IntegerField(null=True, blank=True)
    total_floors = models.IntegerField(null=True, blank=True)
    year_built = models.IntegerField(null=True, blank=True)
    num_bathrooms = models.IntegerField(default=1)
    has_balcony = models.BooleanField(default=False)
    has_garden = models.BooleanField(default=False)
    has_patio = models.BooleanField(default=False)
    has_elevator = models.BooleanField(default=False)
    has_storage = models.BooleanField(default=False)
    has_ac = models.BooleanField(default=False)
    has_heating = models.BooleanField(default=False)

    # ── Computed results (filled by analysis engine) ──
    total_cost = models.DecimalField(
        max_digits=14, decimal_places=2, null=True,
        help_text='asking_price + parking_price'
    )
    price_per_sqm = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    market_avg_sqm = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    price_vs_market_pct = models.DecimalField(
        max_digits=8, decimal_places=2, null=True,
        help_text='Positive = above market, negative = below'
    )
    estimated_monthly_rent = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    estimated_annual_rent = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    gross_rental_yield = models.DecimalField(max_digits=6, decimal_places=2, null=True)
    net_rental_yield = models.DecimalField(max_digits=6, decimal_places=2, null=True)
    estimated_airbnb_monthly = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    airbnb_annual_revenue = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    airbnb_yield = models.DecimalField(max_digits=6, decimal_places=2, null=True)
    cap_rate = models.DecimalField(max_digits=6, decimal_places=2, null=True)
    roi_5_year = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    roi_10_year = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    break_even_months = models.IntegerField(null=True, blank=True)
    area_heat_score = models.IntegerField(
        null=True, blank=True, help_text='0-100 neighborhood desirability'
    )
    verdict = models.CharField(max_length=20, choices=VERDICT_CHOICES, default='hold')
    verdict_score = models.IntegerField(
        default=0, help_text='0-100 overall investment score'
    )

    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['country', 'city']),
            models.Index(fields=['verdict']),
        ]
        verbose_name_plural = 'Property analyses'

    def __str__(self):
        return f"{self.name} — {self.city}, {self.area} ({self.verdict})"
