from django.contrib import admin
from .models import Portfolio, Holding, Transaction, WatchlistItem, PriceAlert, PropertyAnalysis


@admin.register(Portfolio)
class PortfolioAdmin(admin.ModelAdmin):
    list_display = ['name', 'user', 'country', 'currency', 'broker', 'created_at']
    list_filter = ['currency', 'country', 'broker']
    search_fields = ['name', 'country', 'broker', 'description']


@admin.register(Holding)
class HoldingAdmin(admin.ModelAdmin):
    list_display = ['ticker', 'name', 'portfolio', 'asset_type', 'quantity', 'avg_purchase_price', 'current_price']
    list_filter = ['asset_type', 'portfolio', 'sector']
    search_fields = ['ticker', 'name', 'sector']


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ['holding', 'transaction_type', 'quantity', 'price_per_unit', 'total_amount', 'fees', 'date']
    list_filter = ['transaction_type', 'date']
    search_fields = ['holding__ticker', 'holding__name', 'notes']


@admin.register(WatchlistItem)
class WatchlistItemAdmin(admin.ModelAdmin):
    list_display = ['ticker', 'name', 'asset_type', 'target_price', 'current_price', 'created_at']
    list_filter = ['asset_type']
    search_fields = ['ticker', 'name']


@admin.register(PriceAlert)
class PriceAlertAdmin(admin.ModelAdmin):
    list_display = ['ticker', 'name', 'condition', 'target_price', 'current_price', 'triggered', 'triggered_at']
    list_filter = ['condition', 'triggered']
    search_fields = ['ticker', 'name']


@admin.register(PropertyAnalysis)
class PropertyAnalysisAdmin(admin.ModelAdmin):
    list_display = ['name', 'user', 'country', 'city', 'area', 'asking_price', 'verdict', 'verdict_score', 'created_at']
    list_filter = ['country', 'city', 'verdict', 'property_type']
    search_fields = ['name', 'city', 'area', 'notes']
    readonly_fields = [
        'total_cost', 'price_per_sqm', 'market_avg_sqm', 'price_vs_market_pct',
        'estimated_monthly_rent', 'estimated_annual_rent', 'gross_rental_yield',
        'net_rental_yield', 'estimated_airbnb_monthly', 'airbnb_annual_revenue',
        'airbnb_yield', 'cap_rate', 'roi_5_year', 'roi_10_year',
        'break_even_months', 'area_heat_score', 'verdict', 'verdict_score',
    ]
