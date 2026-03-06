from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Q
from django.utils import timezone
from datetime import date
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