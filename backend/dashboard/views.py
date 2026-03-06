from django.shortcuts import render

# Create your views here.
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Sum, Q
from datetime import timedelta
from properties.models import Property
from leases.models import Lease
from finance.models import RentPayment, Expense
from documents.models import Document


class DashboardSummaryView(APIView):
    """Main dashboard metrics — all calculated in the service layer."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        today = timezone.now().date()
        current_month = today.month
        current_year = today.year

        # Portfolio
        properties = Property.objects.filter(user=user)
        total_properties = properties.count()
        total_portfolio_value = properties.aggregate(
            total=Sum('current_value')
        )['total'] or 0

        # Leases
        active_leases = Lease.objects.filter(
            property__user=user, status='active'
        ).count()
        occupancy_rate = (active_leases / total_properties * 100) if total_properties > 0 else 0

        # Rent this month
        monthly_rent_collected = RentPayment.objects.filter(
            lease__property__user=user,
            due_date__month=current_month,
            due_date__year=current_year,
            status='paid'
        ).aggregate(total=Sum('amount_paid'))['total'] or 0

        # Expenses this month
        monthly_expenses = Expense.objects.filter(
            property__user=user,
            paid_date__month=current_month,
            paid_date__year=current_year
        ).aggregate(total=Sum('amount'))['total'] or 0

        # Net cash flow
        net_cash_flow = monthly_rent_collected - monthly_expenses

        # Upcoming rent (next 7 days)
        upcoming_rent = RentPayment.objects.filter(
            lease__property__user=user,
            status='pending',
            due_date__gte=today,
            due_date__lte=today + timedelta(days=7)
        ).count()

        # Overdue rent
        overdue_rent = RentPayment.objects.filter(
            lease__property__user=user,
            status='overdue'
        ).count()

        # Expiring documents (next 30 days)
        expiring_documents = Document.objects.filter(
            property__user=user,
            expiry_date__gte=today,
            expiry_date__lte=today + timedelta(days=30)
        ).count()

        # Collection progress — how many of this month's payments are collected
        month_payments = RentPayment.objects.filter(
            lease__property__user=user,
            due_date__month=current_month,
            due_date__year=current_year,
        )
        month_payments_total = month_payments.count()
        month_payments_collected = month_payments.filter(status='paid').count()
        month_total_due = month_payments.aggregate(
            total=Sum('amount_due')
        )['total'] or 0
        month_total_collected = month_payments.filter(status='paid').aggregate(
            total=Sum('amount_paid')
        )['total'] or 0

        return Response({
            'total_properties': total_properties,
            'total_portfolio_value': float(total_portfolio_value),
            'active_leases': active_leases,
            'occupancy_rate': round(occupancy_rate, 1),
            'monthly_rent_collected': float(monthly_rent_collected),
            'monthly_expenses': float(monthly_expenses),
            'net_cash_flow': float(net_cash_flow),
            'upcoming_rent_due': upcoming_rent,
            'overdue_rent': overdue_rent,
            'expiring_documents': expiring_documents,
            'month_payments_total': month_payments_total,
            'month_payments_collected': month_payments_collected,
            'month_total_due': float(month_total_due),
            'month_total_collected': float(month_total_collected),
        })