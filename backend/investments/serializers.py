from decimal import Decimal
from rest_framework import serializers
from .models import Portfolio, Holding, Transaction, WatchlistItem, PriceAlert, PropertyAnalysis


class PortfolioSerializer(serializers.ModelSerializer):
    total_value = serializers.SerializerMethodField()
    total_invested = serializers.SerializerMethodField()
    total_gain_loss = serializers.SerializerMethodField()
    total_gain_loss_pct = serializers.SerializerMethodField()
    holdings_count = serializers.SerializerMethodField()

    class Meta:
        model = Portfolio
        fields = '__all__'
        read_only_fields = ['user']

    def get_total_value(self, obj):
        return float(sum(h.market_value() for h in obj.holdings.all()))

    def get_total_invested(self, obj):
        return float(sum(h.total_invested() for h in obj.holdings.all()))

    def get_total_gain_loss(self, obj):
        total_value = Decimal(str(self.get_total_value(obj)))
        total_invested = Decimal(str(self.get_total_invested(obj)))
        return float(total_value - total_invested)

    def get_total_gain_loss_pct(self, obj):
        total_invested = Decimal(str(self.get_total_invested(obj)))
        total_gain_loss = Decimal(str(self.get_total_gain_loss(obj)))
        if total_invested > 0:
            return float((total_gain_loss / total_invested) * Decimal('100'))
        return 0.0

    def get_holdings_count(self, obj):
        return obj.holdings.count()


class HoldingSerializer(serializers.ModelSerializer):
    total_invested = serializers.SerializerMethodField()
    market_value = serializers.SerializerMethodField()
    gain_loss = serializers.SerializerMethodField()
    gain_loss_pct = serializers.SerializerMethodField()
    portfolio_name = serializers.CharField(source='portfolio.name', read_only=True, default=None)

    class Meta:
        model = Holding
        fields = '__all__'
        read_only_fields = ['user']

    def get_total_invested(self, obj):
        return float(obj.total_invested())

    def get_market_value(self, obj):
        return float(obj.market_value())

    def get_gain_loss(self, obj):
        return float(obj.gain_loss())

    def get_gain_loss_pct(self, obj):
        return float(obj.gain_loss_pct())


class TransactionSerializer(serializers.ModelSerializer):
    holding_ticker = serializers.CharField(source='holding.ticker', read_only=True)
    holding_name = serializers.CharField(source='holding.name', read_only=True)

    class Meta:
        model = Transaction
        fields = '__all__'
        read_only_fields = ['user']


class WatchlistItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = WatchlistItem
        fields = '__all__'
        read_only_fields = ['user']


class PriceAlertSerializer(serializers.ModelSerializer):
    class Meta:
        model = PriceAlert
        fields = '__all__'
        read_only_fields = ['user']


# §SERIALIZER:PropertyAnalysis — input validation + output for deal analyzer
class PropertyAnalysisInputSerializer(serializers.Serializer):
    """Validates the input form for property analysis. Not a ModelSerializer
    because we compute results in the service layer before saving."""
    name = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    country = serializers.CharField(max_length=100)
    city = serializers.CharField(max_length=100)
    area = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    property_type = serializers.CharField(max_length=20)
    square_meters = serializers.DecimalField(max_digits=10, decimal_places=2)
    asking_price = serializers.DecimalField(max_digits=14, decimal_places=2)
    parking_included = serializers.BooleanField(default=False)
    parking_price = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0)
    num_bedrooms = serializers.IntegerField(default=1, min_value=0, max_value=10)
    condition = serializers.CharField(max_length=20, default='good')
    furnishing = serializers.CharField(max_length=20, default='unfurnished')
    floor = serializers.IntegerField(required=False, allow_null=True)
    total_floors = serializers.IntegerField(required=False, allow_null=True)
    year_built = serializers.IntegerField(required=False, allow_null=True)
    num_bathrooms = serializers.IntegerField(default=1, min_value=1, max_value=10)
    has_balcony = serializers.BooleanField(default=False)
    has_garden = serializers.BooleanField(default=False)
    garden_sqm = serializers.DecimalField(max_digits=8, decimal_places=2, required=False, default=0)
    has_patio = serializers.BooleanField(default=False)
    patio_sqm = serializers.DecimalField(max_digits=8, decimal_places=2, required=False, default=0)
    parking_sqm = serializers.DecimalField(max_digits=8, decimal_places=2, required=False, default=0)
    has_elevator = serializers.BooleanField(default=False)
    has_storage = serializers.BooleanField(default=False)
    has_ac = serializers.BooleanField(default=False)
    has_heating = serializers.BooleanField(default=False)
    has_pool = serializers.BooleanField(default=False)
    has_gym = serializers.BooleanField(default=False)
    has_view = serializers.BooleanField(default=False)
    view_type = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')
    exposure = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')
    layout_description = serializers.CharField(required=False, allow_blank=True, default='')
    renovation_cost = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    monthly_fees = serializers.DecimalField(max_digits=8, decimal_places=2, required=False, default=0)
    notary_fees = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    acquisition_tax = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    lawyer_fees = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    agent_commission = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    other_costs = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    construction_type = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')
    near_metro = serializers.BooleanField(default=False)
    near_school = serializers.BooleanField(default=False)
    near_hospital = serializers.BooleanField(default=False)
    near_park = serializers.BooleanField(default=False)
    noise_level = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class PropertyAnalysisSerializer(serializers.ModelSerializer):
    """Full read serializer for saved analyses."""
    class Meta:
        model = PropertyAnalysis
        fields = '__all__'
        read_only_fields = ['user']
