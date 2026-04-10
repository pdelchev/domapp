"""
Financial Reports Service

§PURPOSE: Aggregate and analyze property financial data (income, expenses, tax)
          with breakdowns by tenant, category, and time period.

§FUNCTIONS:
  - get_property_report(property, year, month_range) → Income/expense/net breakdown
  - get_income_summary(property, period) → Rent collected vs due
  - get_expense_summary(property, period) → Expenses by category
  - get_tax_report(user, year) → Taxable income summary across properties
  - get_annual_report(user, year) → YoY comparison

§USAGE:
  from finance.finance_reports import get_property_report
  report = get_property_report(property_id=1, year=2026)
  # Returns: { property, income, expenses, net, outstanding, ... }
"""

from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Optional, Dict, List, Any
from django.utils import timezone
from django.db.models import Sum, Q
from dateutil.relativedelta import relativedelta


def get_income_summary(property, period: str = 'month', year: int = None, month: int = None) -> Dict[str, Any]:
    """
    §INCOME: Rent collected vs due for a property.

    Args:
        property: Property instance
        period: 'month' or 'year'
        year: Year (default: current)
        month: Month (only for period='month')

    Returns:
        {
            'due_total': 5000,
            'due_count': 2,
            'collected_total': 4500,
            'collected_count': 2,
            'pending_total': 500,
            'pending_count': 1,
            'collection_rate': 90,  # percentage
            'by_tenant': [
                {'tenant': 'John Doe', 'due': 2500, 'collected': 2500, 'pending': 0},
                ...
            ]
        }
    """
    from leases.models import Lease
    from finance.models import RentPayment

    if year is None:
        year = timezone.now().year
    if month is None:
        month = timezone.now().month

    # Date range
    if period == 'month':
        start_date = date(year, month, 1)
        end_date = start_date + relativedelta(months=1) - timedelta(days=1)
    else:  # year
        start_date = date(year, 1, 1)
        end_date = date(year, 12, 31)

    # Get active leases for property
    leases = Lease.objects.filter(property=property, is_active=True).select_related('tenant')

    # Aggregate by tenant
    by_tenant = []
    total_due = Decimal('0')
    total_collected = Decimal('0')
    total_pending = Decimal('0')
    total_due_count = 0
    total_collected_count = 0
    total_pending_count = 0

    for lease in leases:
        payments = RentPayment.objects.filter(
            lease=lease,
            due_date__gte=start_date,
            due_date__lte=end_date,
        )

        tenant_due = payments.aggregate(total=Sum('amount_due'))['total'] or Decimal('0')
        tenant_collected = payments.filter(status='paid').aggregate(total=Sum('amount_paid'))['total'] or Decimal('0')
        tenant_pending = tenant_due - tenant_collected

        if tenant_due > 0:
            by_tenant.append({
                'tenant': lease.tenant.full_name,
                'tenant_id': lease.tenant.id,
                'due': float(tenant_due),
                'collected': float(tenant_collected),
                'pending': float(tenant_pending),
                'payment_count': payments.count(),
                'collection_rate': int((float(tenant_collected) / float(tenant_due) * 100)) if tenant_due > 0 else 0,
            })

            total_due += tenant_due
            total_collected += tenant_collected
            total_pending += tenant_pending
            total_due_count += payments.count()
            total_collected_count += payments.filter(status='paid').count()
            total_pending_count += payments.filter(status='pending').count()

    collection_rate = 0
    if total_due > 0:
        collection_rate = int((float(total_collected) / float(total_due)) * 100)

    return {
        'period': period,
        'year': year,
        'month': month if period == 'month' else None,
        'due_total': float(total_due),
        'due_count': total_due_count,
        'collected_total': float(total_collected),
        'collected_count': total_collected_count,
        'pending_total': float(total_pending),
        'pending_count': total_pending_count,
        'collection_rate': collection_rate,
        'by_tenant': by_tenant,
    }


def get_expense_summary(property, period: str = 'month', year: int = None, month: int = None) -> Dict[str, Any]:
    """
    §EXPENSES: Expense breakdown by category for a property.

    Args:
        property: Property instance
        period: 'month' or 'year'
        year: Year (default: current)
        month: Month (only for period='month')

    Returns:
        {
            'total_expenses': 3200,
            'by_category': {
                'utilities': {'electricity': 500, 'water': 300, ...},
                'maintenance': 1200,
                'tax': 500,
                ...
            },
            'paid': 2500,
            'unpaid': 700,
            'items': [
                {'category': 'Electricity', 'amount': 500, 'due_date': '2026-04-15', 'status': 'paid'},
                ...
            ]
        }
    """
    from finance.models import Expense

    if year is None:
        year = timezone.now().year
    if month is None:
        month = timezone.now().month

    # Date range
    if period == 'month':
        start_date = date(year, month, 1)
        end_date = start_date + relativedelta(months=1) - timedelta(days=1)
    else:  # year
        start_date = date(year, 1, 1)
        end_date = date(year, 12, 31)

    expenses = Expense.objects.filter(
        property=property,
        due_date__gte=start_date,
        due_date__lte=end_date,
    ).order_by('category')

    # Aggregate by category
    by_category = {}
    total_expenses = Decimal('0')
    total_paid = Decimal('0')
    total_unpaid = Decimal('0')
    items = []

    for expense in expenses:
        category = expense.get_category_display()
        amount = expense.amount
        is_paid = expense.paid_date is not None

        if category not in by_category:
            by_category[category] = Decimal('0')

        by_category[category] += amount
        total_expenses += amount

        if is_paid:
            total_paid += amount
        else:
            total_unpaid += amount

        items.append({
            'id': expense.id,
            'category': category,
            'description': expense.description or '',
            'amount': float(amount),
            'due_date': expense.due_date.isoformat() if expense.due_date else None,
            'paid_date': expense.paid_date.isoformat() if expense.paid_date else None,
            'status': 'paid' if is_paid else 'unpaid',
        })

    return {
        'period': period,
        'year': year,
        'month': month if period == 'month' else None,
        'total_expenses': float(total_expenses),
        'paid': float(total_paid),
        'unpaid': float(total_unpaid),
        'by_category': {k: float(v) for k, v in by_category.items()},
        'items': items,
    }


def get_property_report(property, year: int = None, month_range: Optional[tuple] = None) -> Dict[str, Any]:
    """
    §REPORT: Comprehensive property financial report.

    Args:
        property: Property instance
        year: Year (default: current)
        month_range: Tuple (start_month, end_month) for period within year (default: full year)

    Returns:
        {
            'property': {...},
            'period': {'year': 2026, 'months': 1-12 or specific},
            'income': {...},
            'expenses': {...},
            'net': 7300,
            'outstanding_rent': 1500,
            'mortgage_paid': 12000,  # if available
            'net_after_mortgage': -4700,
            'summary': {...}
        }
    """
    from properties.models import Property as PropModel

    if year is None:
        year = timezone.now().year

    if month_range is None:
        month_range = (1, 12)

    # Get income for period
    income_data = None
    expenses_data = None
    total_net = Decimal('0')

    if month_range == (1, 12):
        # Full year
        income_data = get_income_summary(property, period='year', year=year)
        expenses_data = get_expense_summary(property, period='year', year=year)
    else:
        # Multiple months — aggregate
        start_month, end_month = month_range
        income_by_month = []
        expenses_by_month = []
        total_income = Decimal('0')
        total_expenses = Decimal('0')

        for month in range(start_month, end_month + 1):
            income = get_income_summary(property, period='month', year=year, month=month)
            expenses = get_expense_summary(property, period='month', year=year, month=month)
            income_by_month.append(income)
            expenses_by_month.append(expenses)
            total_income += Decimal(str(income['collected_total']))
            total_expenses += Decimal(str(expenses['total_expenses']))

        income_data = {
            'period': 'month_range',
            'months': f"{start_month}-{end_month}",
            'collected_total': float(total_income),
            'total_expenses': float(total_expenses),
            'by_month': income_by_month,
        }
        expenses_data = {
            'total_expenses': float(total_expenses),
            'by_month': expenses_by_month,
        }

    total_income = Decimal(str(income_data['collected_total']))
    total_expenses = Decimal(str(expenses_data['total_expenses']))
    net = total_income - total_expenses

    # Get property details
    prop = PropModel.objects.get(pk=property.id)

    return {
        'property': {
            'id': prop.id,
            'name': prop.name,
            'address': prop.address,
            'type': prop.property_type,
        },
        'period': {
            'year': year,
            'month_range': month_range if month_range != (1, 12) else None,
        },
        'income': income_data,
        'expenses': expenses_data,
        'net': float(net),
        'outstanding_rent': income_data.get('pending_total', 0),
        'collection_rate': income_data.get('collection_rate', 0),
        'summary': {
            'total_income': float(total_income),
            'total_expenses': float(total_expenses),
            'net_income': float(net),
            'expense_ratio': float((total_expenses / total_income * 100)) if total_income > 0 else 0,
        }
    }


def get_tax_report(user, year: int = None) -> Dict[str, Any]:
    """
    §TAX: Tax report across all user's properties.

    Returns taxable income (rent - deductible expenses) per property.

    Returns:
        {
            'user_id': 1,
            'year': 2026,
            'properties': [
                {
                    'property': {...},
                    'gross_rent': 12000,
                    'deductible_expenses': {
                        'maintenance': 1000,
                        'utilities': 2000,
                        'insurance': 800,
                        'tax': 0,  # property tax is not deductible in some jurisdictions
                        'other': 500,
                    },
                    'total_deductible': 4300,
                    'taxable_income': 7700,
                }
            ],
            'total_gross_rent': 50000,
            'total_deductible_expenses': 18000,
            'total_taxable_income': 32000,
        }
    """
    from properties.models import Property

    if year is None:
        year = timezone.now().year

    properties = Property.objects.filter(owner__user=user)

    properties_tax = []
    total_gross = Decimal('0')
    total_deductible = Decimal('0')

    for prop in properties:
        income_data = get_income_summary(prop, period='year', year=year)
        expenses_data = get_expense_summary(prop, period='year', year=year)

        gross_rent = Decimal(str(income_data['collected_total']))
        deductible = Decimal('0')

        # Deductible categories (varies by jurisdiction; this is a generic template)
        deductible_categories = {
            'utilities': Decimal('0'),
            'maintenance': Decimal('0'),
            'insurance': Decimal('0'),
            'other': Decimal('0'),
        }

        for category, amount in expenses_data['by_category'].items():
            amount_dec = Decimal(str(amount))
            if 'electricity' in category.lower() or 'water' in category.lower() or 'internet' in category.lower():
                deductible_categories['utilities'] += amount_dec
            elif 'maintenance' in category.lower():
                deductible_categories['maintenance'] += amount_dec
            elif 'insurance' in category.lower():
                deductible_categories['insurance'] += amount_dec
            else:
                deductible_categories['other'] += amount_dec

        for cat_amount in deductible_categories.values():
            deductible += cat_amount

        taxable = gross_rent - deductible

        properties_tax.append({
            'property': {
                'id': prop.id,
                'name': prop.name,
                'address': prop.address,
            },
            'gross_rent': float(gross_rent),
            'deductible_expenses': {k: float(v) for k, v in deductible_categories.items()},
            'total_deductible': float(deductible),
            'taxable_income': float(taxable),
        })

        total_gross += gross_rent
        total_deductible += deductible

    total_taxable = total_gross - total_deductible

    return {
        'user_id': user.id,
        'year': year,
        'properties': properties_tax,
        'total_gross_rent': float(total_gross),
        'total_deductible_expenses': float(total_deductible),
        'total_taxable_income': float(total_taxable),
        'note': 'Consult with tax professional for jurisdiction-specific deductions',
    }


def get_annual_report(user, year: int = None) -> Dict[str, Any]:
    """
    §ANNUAL: Year-over-year comparison.

    Compares current year with previous year.
    """
    if year is None:
        year = timezone.now().year

    prev_year = year - 1

    # Current year
    current = get_tax_report(user, year=year)

    # Previous year (if data exists)
    previous = get_tax_report(user, year=prev_year)

    # Calculate changes
    gross_change = current['total_gross_rent'] - previous['total_gross_rent']
    expense_change = current['total_deductible_expenses'] - previous['total_deductible_expenses']
    income_change = current['total_taxable_income'] - previous['total_taxable_income']

    gross_pct = (gross_change / previous['total_gross_rent'] * 100) if previous['total_gross_rent'] > 0 else 0
    income_pct = (income_change / previous['total_taxable_income'] * 100) if previous['total_taxable_income'] > 0 else 0

    return {
        'user_id': user.id,
        'current_year': year,
        'previous_year': prev_year,
        'current': current,
        'previous': previous,
        'yoy_change': {
            'gross_rent': {
                'amount': float(gross_change),
                'percentage': float(gross_pct),
            },
            'expenses': {
                'amount': float(expense_change),
                'percentage': float((expense_change / previous['total_deductible_expenses'] * 100)) if previous['total_deductible_expenses'] > 0 else 0,
            },
            'taxable_income': {
                'amount': float(income_change),
                'percentage': float(income_pct),
            },
        }
    }
