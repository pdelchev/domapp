from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Q, Sum
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Portfolio, Holding, Transaction, WatchlistItem, PriceAlert, PropertyAnalysis
from .serializers import (
    PortfolioSerializer,
    HoldingSerializer,
    TransactionSerializer,
    WatchlistItemSerializer,
    PriceAlertSerializer,
    PropertyAnalysisInputSerializer,
    PropertyAnalysisSerializer,
)
from .services import analyze_property
from .market_data import get_all_areas, COUNTRIES, CITIES


class PortfolioViewSet(viewsets.ModelViewSet):
    serializer_class = PortfolioSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Portfolio.objects.filter(
            user=self.request.user.get_data_owner()
        ).prefetch_related('holdings')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())

    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        portfolio = self.get_object()
        holdings = portfolio.holdings.all()

        # By asset type
        by_asset_type = defaultdict(
            lambda: {'count': 0, 'total_value': Decimal('0'), 'total_invested': Decimal('0')}
        )
        for h in holdings:
            entry = by_asset_type[h.asset_type]
            entry['count'] += 1
            entry['total_value'] += h.market_value()
            entry['total_invested'] += h.total_invested()

        by_asset_type_list = [
            {
                'asset_type': k,
                'count': v['count'],
                'total_value': float(v['total_value']),
                'total_invested': float(v['total_invested']),
            }
            for k, v in by_asset_type.items()
        ]

        # By sector
        by_sector = defaultdict(
            lambda: {'count': 0, 'total_value': Decimal('0'), 'total_invested': Decimal('0')}
        )
        for h in holdings:
            sector = h.sector or 'Uncategorized'
            entry = by_sector[sector]
            entry['count'] += 1
            entry['total_value'] += h.market_value()
            entry['total_invested'] += h.total_invested()

        by_sector_list = [
            {
                'sector': k,
                'count': v['count'],
                'total_value': float(v['total_value']),
                'total_invested': float(v['total_invested']),
            }
            for k, v in by_sector.items()
        ]

        # Top holdings by market value
        top_holdings = sorted(holdings, key=lambda h: h.market_value(), reverse=True)[:10]
        top_holdings_data = HoldingSerializer(top_holdings, many=True).data

        return Response({
            'portfolio': PortfolioSerializer(portfolio).data,
            'by_asset_type': by_asset_type_list,
            'by_sector': by_sector_list,
            'top_holdings': top_holdings_data,
        })


class HoldingViewSet(viewsets.ModelViewSet):
    serializer_class = HoldingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Holding.objects.filter(
            user=self.request.user.get_data_owner()
        ).select_related('portfolio')

        portfolio = self.request.query_params.get('portfolio')
        if portfolio:
            qs = qs.filter(portfolio_id=portfolio)

        asset_type = self.request.query_params.get('asset_type')
        if asset_type:
            qs = qs.filter(asset_type=asset_type)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(Q(ticker__icontains=search) | Q(name__icontains=search))

        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())

    @action(detail=False, methods=['post'])
    def bulk_upload(self, request):
        data = request.data
        if not isinstance(data, list):
            return Response(
                {'error': 'Expected a list of holdings'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user.get_data_owner()
        created = 0
        errors = []

        for i, row in enumerate(data):
            try:
                portfolio_id = row.get('portfolio')
                if not portfolio_id:
                    errors.append({'row': i, 'error': 'portfolio is required'})
                    continue

                # Verify portfolio belongs to user
                try:
                    portfolio = Portfolio.objects.get(id=portfolio_id, user=user)
                except Portfolio.DoesNotExist:
                    errors.append({'row': i, 'error': f'Portfolio {portfolio_id} not found'})
                    continue

                ticker = row.get('ticker', '').strip()
                name = row.get('name', '').strip()
                asset_type = row.get('asset_type', '').strip()

                if not ticker:
                    errors.append({'row': i, 'error': 'ticker is required'})
                    continue
                if not name:
                    errors.append({'row': i, 'error': 'name is required'})
                    continue
                if not asset_type:
                    errors.append({'row': i, 'error': 'asset_type is required'})
                    continue

                valid_types = [c[0] for c in Holding._meta.get_field('asset_type').choices]
                if asset_type not in valid_types:
                    errors.append({'row': i, 'error': f'Invalid asset_type: {asset_type}'})
                    continue

                Holding.objects.create(
                    user=user,
                    portfolio=portfolio,
                    ticker=ticker,
                    name=name,
                    asset_type=asset_type,
                    quantity=Decimal(str(row.get('quantity', 0))),
                    avg_purchase_price=Decimal(str(row.get('avg_purchase_price', 0))),
                    sector=row.get('sector', ''),
                    currency=row.get('currency', ''),
                    notes=row.get('notes', ''),
                )
                created += 1
            except Exception as e:
                errors.append({'row': i, 'error': str(e)})

        return Response(
            {'created': created, 'errors': errors},
            status=status.HTTP_201_CREATED if created > 0 else status.HTTP_400_BAD_REQUEST,
        )


class TransactionViewSet(viewsets.ModelViewSet):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Transaction.objects.filter(
            user=self.request.user.get_data_owner()
        ).select_related('holding')

        holding = self.request.query_params.get('holding')
        if holding:
            qs = qs.filter(holding_id=holding)

        txn_type = self.request.query_params.get('type')
        if txn_type:
            qs = qs.filter(transaction_type=txn_type)

        date_from = self.request.query_params.get('date_from')
        if date_from:
            qs = qs.filter(date__gte=date_from)

        date_to = self.request.query_params.get('date_to')
        if date_to:
            qs = qs.filter(date__lte=date_to)

        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())

    @action(detail=False, methods=['get'])
    def dividends(self, request):
        qs = self.get_queryset().filter(
            transaction_type='dividend'
        ).select_related('holding')

        grouped = defaultdict(list)
        for txn in qs:
            grouped[txn.holding.ticker].append(TransactionSerializer(txn).data)

        result = []
        for ticker, transactions in grouped.items():
            total = sum(Decimal(str(t['total_amount'])) for t in transactions)
            result.append({
                'ticker': ticker,
                'holding_name': transactions[0]['holding_name'] if transactions else '',
                'total_dividends': float(total),
                'count': len(transactions),
                'transactions': transactions,
            })

        return Response(sorted(result, key=lambda x: x['total_dividends'], reverse=True))


class WatchlistItemViewSet(viewsets.ModelViewSet):
    serializer_class = WatchlistItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return WatchlistItem.objects.filter(user=self.request.user.get_data_owner())

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())


class PriceAlertViewSet(viewsets.ModelViewSet):
    serializer_class = PriceAlertSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return PriceAlert.objects.filter(user=self.request.user.get_data_owner())

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())


class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user.get_data_owner()
        portfolios = Portfolio.objects.filter(user=user).prefetch_related('holdings')
        holdings = Holding.objects.filter(user=user).select_related('portfolio')
        transactions = Transaction.objects.filter(user=user).select_related('holding')

        total_value = Decimal('0')
        total_invested = Decimal('0')

        by_asset_type = defaultdict(
            lambda: {'count': 0, 'total_value': Decimal('0'), 'total_invested': Decimal('0')}
        )
        by_currency = defaultdict(
            lambda: {'total_value': Decimal('0'), 'total_invested': Decimal('0')}
        )

        gainers = []

        for h in holdings:
            mv = h.market_value()
            ti = h.total_invested()
            total_value += mv
            total_invested += ti

            at = by_asset_type[h.asset_type]
            at['count'] += 1
            at['total_value'] += mv
            at['total_invested'] += ti

            cur = h.currency or h.portfolio.currency
            bc = by_currency[cur]
            bc['total_value'] += mv
            bc['total_invested'] += ti

            gainers.append({
                'id': h.id,
                'ticker': h.ticker,
                'name': h.name,
                'gain_loss': float(h.gain_loss()),
                'gain_loss_pct': float(h.gain_loss_pct()),
                'market_value': float(mv),
            })

        total_gain_loss = total_value - total_invested
        total_gain_loss_pct = (
            float((total_gain_loss / total_invested) * Decimal('100'))
            if total_invested > 0
            else 0.0
        )

        # Top gainers / losers
        sorted_by_pct = sorted(gainers, key=lambda x: x['gain_loss_pct'], reverse=True)
        top_gainers = sorted_by_pct[:5]
        top_losers = sorted_by_pct[-5:][::-1] if len(sorted_by_pct) > 0 else []

        # Recent transactions
        recent = transactions.order_by('-date', '-created_at')[:10]
        recent_data = TransactionSerializer(recent, many=True).data

        # Dividends
        dividend_qs = transactions.filter(transaction_type='dividend')
        total_dividends = float(
            dividend_qs.aggregate(total=Sum('total_amount'))['total'] or Decimal('0')
        )

        # Dividends by month (last 12 months)
        today = date.today()
        twelve_months_ago = today - timedelta(days=365)
        monthly_dividends = dividend_qs.filter(date__gte=twelve_months_ago)

        dividends_by_month = defaultdict(float)
        for txn in monthly_dividends:
            key = txn.date.strftime('%Y-%m')
            dividends_by_month[key] += float(txn.total_amount)

        dividends_by_month_list = [
            {'month': k, 'total': v}
            for k, v in sorted(dividends_by_month.items())
        ]

        return Response({
            'total_portfolios': portfolios.count(),
            'total_holdings': holdings.count(),
            'total_value': float(total_value),
            'total_invested': float(total_invested),
            'total_gain_loss': float(total_gain_loss),
            'total_gain_loss_pct': total_gain_loss_pct,
            'by_asset_type': [
                {
                    'type': k,
                    'count': v['count'],
                    'total_value': float(v['total_value']),
                    'total_invested': float(v['total_invested']),
                }
                for k, v in by_asset_type.items()
            ],
            'by_currency': [
                {
                    'currency': k,
                    'total_value': float(v['total_value']),
                    'total_invested': float(v['total_invested']),
                }
                for k, v in by_currency.items()
            ],
            'top_gainers': top_gainers,
            'top_losers': top_losers,
            'recent_transactions': recent_data,
            'total_dividends': total_dividends,
            'dividends_by_month': dividends_by_month_list,
        })


class TaxReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user.get_data_owner()
        year = request.query_params.get('year')
        if not year:
            return Response(
                {'error': 'year query parameter is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            year = int(year)
        except ValueError:
            return Response(
                {'error': 'year must be an integer'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = Transaction.objects.filter(
            user=user,
            date__year=year,
        ).select_related('holding', 'holding__portfolio')

        portfolio_id = request.query_params.get('portfolio')
        if portfolio_id:
            qs = qs.filter(holding__portfolio_id=portfolio_id)

        sell_txns = qs.filter(transaction_type='sell')
        dividend_txns = qs.filter(transaction_type='dividend')

        # Realized gains: for sells, gain = total_amount - (quantity * holding.avg_purchase_price)
        realized_gains = Decimal('0')
        sell_data = []
        for txn in sell_txns:
            cost_basis = txn.quantity * txn.holding.avg_purchase_price
            gain = txn.total_amount - cost_basis
            realized_gains += gain
            sell_data.append({
                **TransactionSerializer(txn).data,
                'cost_basis': float(cost_basis),
                'realized_gain': float(gain),
            })

        total_dividends = float(
            dividend_txns.aggregate(total=Sum('total_amount'))['total'] or Decimal('0')
        )
        dividend_data = TransactionSerializer(dividend_txns, many=True).data

        # By holding breakdown
        by_holding = defaultdict(lambda: {
            'realized_gains': Decimal('0'),
            'dividends': Decimal('0'),
            'sell_count': 0,
            'dividend_count': 0,
        })

        for txn in sell_txns:
            cost_basis = txn.quantity * txn.holding.avg_purchase_price
            gain = txn.total_amount - cost_basis
            entry = by_holding[txn.holding.ticker]
            entry['realized_gains'] += gain
            entry['sell_count'] += 1
            entry['holding_name'] = txn.holding.name

        for txn in dividend_txns:
            entry = by_holding[txn.holding.ticker]
            entry['dividends'] += txn.total_amount
            entry['dividend_count'] += 1
            entry['holding_name'] = txn.holding.name

        by_holding_list = [
            {
                'ticker': k,
                'holding_name': v.get('holding_name', ''),
                'realized_gains': float(v['realized_gains']),
                'dividends': float(v['dividends']),
                'sell_count': v['sell_count'],
                'dividend_count': v['dividend_count'],
            }
            for k, v in by_holding.items()
        ]

        return Response({
            'year': year,
            'realized_gains': float(realized_gains),
            'total_dividends': total_dividends,
            'transactions': {
                'sells': sell_data,
                'dividends': dividend_data,
            },
            'by_holding': sorted(by_holding_list, key=lambda x: x['ticker']),
        })


# §VIEW:AnalyzePropertyView — POST to run analysis + auto-save result
class AnalyzePropertyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PropertyAnalysisInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        result = analyze_property(data)

        if 'error' in result:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)

        # §FLOW:auto-save — every analysis is persisted for history
        user = request.user.get_data_owner()
        analysis = PropertyAnalysis.objects.create(
            user=user,
            name=data.get('name', ''),
            country=data.get('country', ''),
            city=data.get('city', ''),
            area=data.get('area', ''),
            property_type=data.get('property_type', 'apartment'),
            square_meters=data.get('square_meters', 0),
            asking_price=data.get('asking_price', 0),
            currency=result.get('currency', 'EUR'),
            parking_included=data.get('parking_included', False),
            parking_price=data.get('parking_price', 0),
            num_bedrooms=data.get('num_bedrooms', 1),
            condition=data.get('condition', 'good'),
            furnishing=data.get('furnishing', 'unfurnished'),
            floor=data.get('floor'),
            total_floors=data.get('total_floors'),
            year_built=data.get('year_built'),
            notes=data.get('notes', ''),
            # Computed fields
            total_cost=result['total_cost'],
            price_per_sqm=result['price_per_sqm'],
            market_avg_sqm=result['market_avg_sqm'],
            price_vs_market_pct=result['price_vs_market_pct'],
            estimated_monthly_rent=result['estimated_monthly_rent'],
            estimated_annual_rent=result['estimated_annual_rent'],
            gross_rental_yield=result['gross_rental_yield'],
            net_rental_yield=result['net_rental_yield'],
            estimated_airbnb_monthly=result['estimated_airbnb_monthly'],
            airbnb_annual_revenue=result['airbnb_annual_revenue'],
            airbnb_yield=result['airbnb_yield'],
            cap_rate=result['cap_rate'],
            roi_5_year=result['roi_5_year'],
            roi_10_year=result['roi_10_year'],
            break_even_months=result['break_even_months'],
            area_heat_score=result['area_heat_score'],
            verdict=result['verdict'],
            verdict_score=result['verdict_score'],
        )

        # Return full result + saved record id
        result['id'] = analysis.id
        result['created_at'] = analysis.created_at.isoformat()
        return Response(result, status=status.HTTP_201_CREATED)


# §VIEW:MarketDataView — GET areas + benchmarks for frontend dropdowns
class MarketDataView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            'countries': COUNTRIES,
            'cities': CITIES,
            'areas': get_all_areas(),
        })


# §VIEW:PropertyAnalysisViewSet — CRUD for saved analyses
class PropertyAnalysisViewSet(viewsets.ModelViewSet):
    serializer_class = PropertyAnalysisSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = PropertyAnalysis.objects.filter(
            user=self.request.user.get_data_owner()
        )
        country = self.request.query_params.get('country')
        if country:
            qs = qs.filter(country=country)
        city = self.request.query_params.get('city')
        if city:
            qs = qs.filter(city=city)
        verdict = self.request.query_params.get('verdict')
        if verdict:
            qs = qs.filter(verdict=verdict)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())
