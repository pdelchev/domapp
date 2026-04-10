from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Q, Avg
from django.utils import timezone
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from .models import RentPayment, Expense
from .serializers import RentPaymentSerializer, ExpenseSerializer
from properties.models import Property


class RentPaymentViewSet(viewsets.ModelViewSet):
    """CRUD for rent payments — scoped to manager's leases."""
    serializer_class = RentPaymentSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'put', 'patch', 'head', 'options']  # No DELETE

    def get_queryset(self):
        qs = RentPayment.objects.filter(
            lease__property__user=self.request.user.get_data_owner()
        ).select_related('lease__tenant', 'lease__property')
        lease_id = self.request.query_params.get('lease')
        if lease_id:
            qs = qs.filter(lease_id=lease_id)
        status = self.request.query_params.get('status')
        if status:
            qs = qs.filter(status=status)
        return qs


class ExpenseViewSet(viewsets.ModelViewSet):
    """CRUD for expenses — scoped to manager's properties."""
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Expense.objects.filter(property__user=self.request.user.get_data_owner()).select_related('property')
        property_id = self.request.query_params.get('property')
        if property_id:
            qs = qs.filter(property_id=property_id)
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)
        return qs


class BatchMarkPaidView(APIView):
    """Mark multiple rent payments as paid in one request.

    Designed for the dashboard quick-pay workflow where property managers
    process a batch of bank transfers at once. Only updates payments
    belonging to the authenticated user and in pending/overdue status.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payment_ids = request.data.get('payment_ids', [])
        method = request.data.get('method', 'bank')
        payment_date = request.data.get('payment_date', str(date.today()))

        if not payment_ids:
            return Response(
                {'error': 'payment_ids is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Only update payments owned by this user and in actionable status
        payments = RentPayment.objects.filter(
            id__in=payment_ids,
            lease__property__user=request.user.get_data_owner(),
            status__in=['pending', 'overdue'],
        )

        updated_ids = []
        for payment in payments:
            payment.status = 'paid'
            payment.method = method
            payment.payment_date = payment_date
            payment.amount_paid = payment.amount_due
            payment.save()
            updated_ids.append(payment.id)

        return Response({
            'updated': len(updated_ids),
            'payment_ids': updated_ids,
        })


class FinanceSummaryView(APIView):
    """Financial summary — income, expenses, net by property."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user.get_data_owner()
        today = timezone.now().date()
        current_month = today.month
        current_year = today.year

        properties = Property.objects.filter(user=user)

        # Total income (all time paid)
        total_income = RentPayment.objects.filter(
            lease__property__user=user, status='paid'
        ).aggregate(total=Sum('amount_paid'))['total'] or 0

        # Total expenses (all time paid)
        total_expenses = Expense.objects.filter(
            property__user=user, paid_date__isnull=False
        ).aggregate(total=Sum('amount'))['total'] or 0

        # This month income
        month_income = RentPayment.objects.filter(
            lease__property__user=user,
            status='paid',
            payment_date__month=current_month,
            payment_date__year=current_year,
        ).aggregate(total=Sum('amount_paid'))['total'] or 0

        # This month expenses
        month_expenses = Expense.objects.filter(
            property__user=user,
            paid_date__month=current_month,
            paid_date__year=current_year,
        ).aggregate(total=Sum('amount'))['total'] or 0

        # Pending payments
        pending_amount = RentPayment.objects.filter(
            lease__property__user=user, status='pending'
        ).aggregate(total=Sum('amount_due'))['total'] or 0

        # Overdue payments
        overdue_amount = RentPayment.objects.filter(
            lease__property__user=user, status='overdue'
        ).aggregate(total=Sum('amount_due'))['total'] or 0

        # Per-property breakdown
        by_property = []
        for prop in properties:
            prop_income = RentPayment.objects.filter(
                lease__property=prop, status='paid'
            ).aggregate(total=Sum('amount_paid'))['total'] or 0
            prop_expenses = Expense.objects.filter(
                property=prop, paid_date__isnull=False
            ).aggregate(total=Sum('amount'))['total'] or 0
            by_property.append({
                'id': prop.id,
                'name': prop.name,
                'income': float(prop_income),
                'expenses': float(prop_expenses),
                'net': float(prop_income - prop_expenses),
            })

        return Response({
            'total_income': float(total_income),
            'total_expenses': float(total_expenses),
            'net_income': float(total_income - total_expenses),
            'month_income': float(month_income),
            'month_expenses': float(month_expenses),
            'month_net': float(month_income - month_expenses),
            'pending_amount': float(pending_amount),
            'overdue_amount': float(overdue_amount),
            'by_property': by_property,
        })


class ExpenseForecastView(APIView):
    """Project expenses forward 3/6/12 months based on recurring expenses + history."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user.get_data_owner()
        months = int(request.query_params.get('months', 6))
        months = min(months, 12)
        today = timezone.now().date()

        properties = Property.objects.filter(user=user)
        result = []

        for prop in properties:
            # Recurring expenses — project forward
            recurring = Expense.objects.filter(
                property=prop, recurring=True,
            )

            # Historical monthly average (last 6 months) for non-recurring
            six_months_ago = today - relativedelta(months=6)
            non_recurring_avg = Expense.objects.filter(
                property=prop, recurring=False,
                paid_date__gte=six_months_ago, paid_date__isnull=False,
            ).aggregate(avg=Avg('amount'))['avg'] or 0

            monthly_projection = []
            for m in range(months):
                target_date = today + relativedelta(months=m + 1)
                month_total = float(non_recurring_avg)
                items = []

                if float(non_recurring_avg) > 0:
                    items.append({
                        'category': 'other',
                        'description': 'Historical average (non-recurring)',
                        'amount': round(float(non_recurring_avg), 2),
                        'source': 'historical',
                    })

                for exp in recurring:
                    freq = exp.recurrence_frequency
                    if freq == 'monthly':
                        month_total += float(exp.amount)
                        items.append({
                            'category': exp.category,
                            'description': exp.description or exp.get_category_display(),
                            'amount': round(float(exp.amount), 2),
                            'source': 'recurring',
                        })
                    elif freq == 'yearly' and exp.due_date:
                        if exp.due_date.month == target_date.month:
                            month_total += float(exp.amount)
                            items.append({
                                'category': exp.category,
                                'description': exp.description or exp.get_category_display(),
                                'amount': round(float(exp.amount), 2),
                                'source': 'recurring_yearly',
                            })

                monthly_projection.append({
                    'month': target_date.strftime('%Y-%m'),
                    'total': round(month_total, 2),
                    'items': items,
                })

            result.append({
                'property_id': prop.id,
                'property_name': prop.name,
                'months': monthly_projection,
                'total_projected': round(sum(m['total'] for m in monthly_projection), 2),
            })

        return Response({
            'forecast_months': months,
            'properties': result,
            'grand_total': round(sum(p['total_projected'] for p in result), 2),
        })


class CollectionHeatmapView(APIView):
    """12-month payment collection heatmap data for all properties."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user.get_data_owner()
        today = timezone.now().date()
        twelve_months_ago = today - relativedelta(months=12)

        payments = RentPayment.objects.filter(
            lease__property__user=user,
            due_date__gte=twelve_months_ago,
        ).select_related('lease__property', 'lease__tenant').values(
            'id', 'due_date', 'payment_date', 'status', 'amount_due',
            'lease__property__id', 'lease__property__name',
            'lease__tenant__full_name',
        )

        # Build daily map: date -> status
        days = {}
        for p in payments:
            due = p['due_date'].isoformat()
            if p['status'] == 'paid':
                if p['payment_date'] and p['payment_date'] <= p['due_date']:
                    level = 'on_time'
                else:
                    level = 'late'
            elif p['status'] == 'overdue':
                level = 'missed'
            else:
                level = 'pending'

            if due not in days or _level_priority(level) > _level_priority(days[due]['level']):
                days[due] = {
                    'date': due,
                    'level': level,
                    'count': days.get(due, {}).get('count', 0) + 1,
                    'amount': float(days.get(due, {}).get('amount', 0)) + float(p['amount_due']),
                }
            else:
                days[due]['count'] += 1
                days[due]['amount'] += float(p['amount_due'])

        # Per-property monthly summary
        by_property = {}
        for p in payments:
            pid = p['lease__property__id']
            pname = p['lease__property__name']
            month_key = p['due_date'].strftime('%Y-%m')
            if pid not in by_property:
                by_property[pid] = {'id': pid, 'name': pname, 'months': {}}
            if month_key not in by_property[pid]['months']:
                by_property[pid]['months'][month_key] = {'total': 0, 'paid': 0, 'on_time': 0, 'late': 0, 'missed': 0, 'pending': 0}
            by_property[pid]['months'][month_key]['total'] += 1
            if p['status'] == 'paid':
                by_property[pid]['months'][month_key]['paid'] += 1
                if p['payment_date'] and p['payment_date'] <= p['due_date']:
                    by_property[pid]['months'][month_key]['on_time'] += 1
                else:
                    by_property[pid]['months'][month_key]['late'] += 1
            elif p['status'] == 'overdue':
                by_property[pid]['months'][month_key]['missed'] += 1
            else:
                by_property[pid]['months'][month_key]['pending'] += 1

        return Response({
            'days': list(days.values()),
            'by_property': list(by_property.values()),
        })


def _level_priority(level):
    return {'on_time': 0, 'pending': 1, 'late': 2, 'missed': 3}.get(level, 0)


# ── Financial Reports ────────────────────────────────────────────────────

class PropertyReportView(APIView):
    """Comprehensive property financial report (income, expenses, net)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, property_id):
        from .finance_reports import get_property_report

        try:
            prop = Property.objects.get(id=property_id, user=request.user.get_data_owner())
        except Property.DoesNotExist:
            return Response({'error': 'Property not found'}, status=404)

        year = request.query_params.get('year', timezone.now().year)
        try:
            year = int(year)
        except ValueError:
            return Response({'error': 'Invalid year'}, status=400)

        report = get_property_report(prop, year=year)
        return Response(report)


class TaxReportView(APIView):
    """Tax summary: gross rent, deductible expenses, taxable income across properties."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .finance_reports import get_tax_report

        user = request.user.get_data_owner()
        year = request.query_params.get('year', timezone.now().year)

        try:
            year = int(year)
        except ValueError:
            return Response({'error': 'Invalid year'}, status=400)

        report = get_tax_report(user, year=year)
        return Response(report)


class AnnualReportView(APIView):
    """Year-over-year comparison: current year vs previous year."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .finance_reports import get_annual_report

        user = request.user.get_data_owner()
        year = request.query_params.get('year', timezone.now().year)

        try:
            year = int(year)
        except ValueError:
            return Response({'error': 'Invalid year'}, status=400)

        report = get_annual_report(user, year=year)
        return Response(report)