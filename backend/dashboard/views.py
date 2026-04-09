from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Sum, Avg, Count, Q
from datetime import timedelta
from properties.models import Property, Unit
from leases.models import Lease
from finance.models import RentPayment, Expense
from documents.models import Document


class DashboardSummaryView(APIView):
    """Main dashboard metrics — all calculated in the service layer."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user.get_data_owner()
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
        )
        active_lease_count = active_leases.count()

        # Occupancy — based on rentable slots (units if they exist, else property = 1 slot)
        # Total rentable slots: properties with units count their units, others count as 1
        total_units = Unit.objects.filter(property__user=user).count()
        properties_with_units = Unit.objects.filter(
            property__user=user
        ).values('property').distinct().count()
        properties_without_units = total_properties - properties_with_units
        total_rentable = total_units + properties_without_units

        # Occupied slots: units with active lease + whole-property leases (no unit)
        occupied_units = active_leases.filter(
            unit__isnull=False
        ).values('unit').distinct().count()
        occupied_whole = active_leases.filter(
            unit__isnull=True
        ).values('property').distinct().count()
        total_occupied = occupied_units + occupied_whole

        occupancy_rate = (total_occupied / total_rentable * 100) if total_rentable > 0 else 0

        # Rent collected this month — count by payment_date (when money arrived),
        # not due_date (which may be a different month for late payments)
        monthly_rent_collected = RentPayment.objects.filter(
            lease__property__user=user,
            payment_date__month=current_month,
            payment_date__year=current_year,
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

        # Upcoming rent (due within next 15 days, not yet paid)
        upcoming_rent = RentPayment.objects.filter(
            lease__property__user=user,
            status__in=['pending', 'overdue'],
            due_date__gte=today,
            due_date__lte=today + timedelta(days=15)
        ).count()

        # Overdue rent — any unpaid payment past its due date (by date, not status field)
        overdue_rent = RentPayment.objects.filter(
            lease__property__user=user,
            status__in=['pending', 'overdue'],
            due_date__lt=today
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
            'today': today.isoformat(),
            'total_portfolio_value': float(total_portfolio_value),
            'active_leases': active_lease_count,
            'occupancy_rate': round(occupancy_rate, 1),
            'total_rentable': total_rentable,
            'total_occupied': total_occupied,
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


class MorningBriefingView(APIView):
    """Morning briefing — everything that needs attention today."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user.get_data_owner()
        today = timezone.now().date()
        data = {}

        # ── Property actions ──
        overdue_payments = list(
            RentPayment.objects.filter(
                lease__property__user=user, status__in=['pending', 'overdue'], due_date__lt=today
            ).select_related('lease__property', 'lease__tenant').values(
                'id', 'due_date', 'amount_due',
                'lease__property__name', 'lease__tenant__full_name'
            )[:10]
        )
        today_payments = list(
            RentPayment.objects.filter(
                lease__property__user=user, status='pending', due_date=today
            ).select_related('lease__property', 'lease__tenant').values(
                'id', 'due_date', 'amount_due',
                'lease__property__name', 'lease__tenant__full_name'
            )[:10]
        )
        upcoming_payments = list(
            RentPayment.objects.filter(
                lease__property__user=user, status='pending',
                due_date__gt=today, due_date__lte=today + timedelta(days=7)
            ).select_related('lease__property', 'lease__tenant').values(
                'id', 'due_date', 'amount_due',
                'lease__property__name', 'lease__tenant__full_name'
            )[:10]
        )
        data['payments'] = {
            'overdue': overdue_payments,
            'today': today_payments,
            'upcoming': upcoming_payments,
        }

        # Expiring documents (next 14 days)
        data['expiring_documents'] = list(
            Document.objects.filter(
                property__user=user,
                expiry_date__gte=today, expiry_date__lte=today + timedelta(days=14)
            ).select_related('property').values(
                'id', 'document_type', 'label', 'expiry_date', 'property__name'
            )[:10]
        )

        # ── Health ──
        health = {}
        try:
            from health.daily_services import get_todays_schedule
            from health.models import HealthProfile
            profile = HealthProfile.objects.filter(user=user, is_primary=True).first()
            if profile:
                schedule = get_todays_schedule(user, profile)
                total = sum(g['total'] for g in schedule)
                taken = sum(g['taken'] for g in schedule)
                health['supplements'] = {
                    'total': total,
                    'completed': taken,
                    'pct': round((taken / total) * 100) if total > 0 else 100,
                }
        except Exception:
            pass

        try:
            from health.bp_models import BPReading
            last_bp = BPReading.objects.filter(user=user).order_by('-measured_at').first()
            if last_bp:
                health['last_bp'] = {
                    'systolic': last_bp.systolic,
                    'diastolic': last_bp.diastolic,
                    'date': last_bp.measured_at.date().isoformat(),
                    'days_ago': (today - last_bp.measured_at.date()).days,
                }
        except Exception:
            pass

        try:
            from health.weight_models import WeightReading
            last_weight = WeightReading.objects.filter(user=user).order_by('-measured_at').first()
            if last_weight:
                health['last_weight'] = {
                    'weight_kg': float(last_weight.weight_kg),
                    'date': last_weight.measured_at.date().isoformat(),
                    'days_ago': (today - last_weight.measured_at.date()).days,
                }
        except Exception:
            pass

        try:
            from health.whoop_models import WhoopRecovery
            last_recovery = WhoopRecovery.objects.filter(user=user, score_state='SCORED').order_by('-cycle__start').first()
            if last_recovery:
                health['recovery'] = {
                    'score': last_recovery.recovery_score,
                    'hrv': float(last_recovery.hrv_rmssd_milli) if last_recovery.hrv_rmssd_milli else None,
                    'rhr': float(last_recovery.resting_heart_rate) if last_recovery.resting_heart_rate else None,
                }
        except Exception:
            pass

        data['health'] = health

        # ── Vehicle obligations expiring ──
        try:
            from vehicles.models import VehicleObligation
            data['vehicle_obligations'] = list(
                VehicleObligation.objects.filter(
                    vehicle__user=user, is_current=True,
                    end_date__gte=today, end_date__lte=today + timedelta(days=14)
                ).select_related('vehicle').values(
                    'id', 'obligation_type', 'end_date',
                    'vehicle__plate_number', 'vehicle__make', 'vehicle__model'
                )[:10]
            )
        except Exception:
            data['vehicle_obligations'] = []

        # ── Unread notifications count ──
        try:
            from notifications.models import Notification
            data['unread_notifications'] = Notification.objects.filter(user=user, read_status=False).count()
        except Exception:
            data['unread_notifications'] = 0

        data['today'] = today.isoformat()
        data['greeting_hour'] = timezone.now().hour

        return Response(data)