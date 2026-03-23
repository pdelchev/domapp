from decimal import Decimal
from rest_framework import serializers
from .models import Portfolio, Holding, Transaction, WatchlistItem, PriceAlert


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
