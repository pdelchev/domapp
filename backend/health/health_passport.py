"""
Health Passport PDF Export Service

§PURPOSE: Generate a shareable PDF with user's complete health summary
          for sharing with doctors and healthcare providers.

§SECTIONS: User-selectable — header, blood results, BP, weight, supplements,
          timeline, cardiovascular risk, recommendations

§OUTPUT: PDF bytes suitable for download or email attachment

§USAGE:
  from health.health_passport import generate_health_passport
  pdf_bytes = generate_health_passport(profile, sections=['blood', 'bp', 'weight'])
"""

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from io import BytesIO
from django.utils import timezone

try:
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch, cm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
except ImportError:
    raise ImportError("reportlab not installed. Run: pip install reportlab==4.0.7")


def _format_date(date_obj) -> str:
    """Format date for display."""
    if not date_obj:
        return ''
    if isinstance(date_obj, str):
        return date_obj
    return date_obj.strftime('%d.%m.%Y') if hasattr(date_obj, 'strftime') else str(date_obj)


def _format_number(value, decimals=2) -> str:
    """Format number with decimals."""
    if value is None:
        return '—'
    try:
        return f"{float(value):.{decimals}f}"
    except (ValueError, TypeError):
        return str(value)


def _get_blood_results_data(profile) -> Dict[str, Any]:
    """Gather recent blood test results (last 5 reports)."""
    from .models import BloodReport

    reports = BloodReport.objects.filter(profile=profile).order_by('-test_date')[:5]

    results_data = {
        'reports': [],
        'summary': ''
    }

    for report in reports:
        results = list(report.blood_result_set.all()[:10])  # Top 10 results per report
        results_data['reports'].append({
            'test_date': _format_date(report.test_date),
            'lab_name': report.lab_name or 'Unknown Lab',
            'score': report.overall_score or 0,
            'results': [
                {
                    'name': r.biomarker.name if r.biomarker else r.name_extracted,
                    'value': _format_number(r.value, 2),
                    'unit': r.unit or '',
                    'flag': r.flag or '',
                }
                for r in results
            ]
        })

    return results_data


def _get_bp_data(profile) -> Dict[str, Any]:
    """Gather blood pressure summary (last 30 days)."""
    from .bp_models import BPReading

    today = timezone.now().date()
    cutoff = today - timedelta(days=30)

    readings = BPReading.objects.filter(
        profile=profile,
        measured_at__date__gte=cutoff
    ).order_by('-measured_at')

    if not readings.exists():
        return {'summary': 'No BP readings in last 30 days', 'readings_count': 0}

    systolic_vals = [r.systolic for r in readings if r.systolic]
    diastolic_vals = [r.diastolic for r in readings if r.diastolic]

    data = {
        'readings_count': len(readings),
        'avg_systolic': _format_number(sum(systolic_vals) / len(systolic_vals), 0) if systolic_vals else '—',
        'avg_diastolic': _format_number(sum(diastolic_vals) / len(diastolic_vals), 0) if diastolic_vals else '—',
        'latest': {
            'systolic': _format_number(readings.first().systolic, 0) if readings.exists() else '—',
            'diastolic': _format_number(readings.first().diastolic, 0) if readings.exists() else '—',
            'date': _format_date(readings.first().measured_at) if readings.exists() else '—',
        },
        'min_systolic': _format_number(min(systolic_vals), 0) if systolic_vals else '—',
        'max_systolic': _format_number(max(systolic_vals), 0) if systolic_vals else '—',
    }

    return data


def _get_weight_data(profile) -> Dict[str, Any]:
    """Gather weight and BMI data."""
    from .weight_models import WeightEntry

    latest = WeightEntry.objects.filter(profile=profile).order_by('-date').first()

    if not latest:
        return {'summary': 'No weight data recorded', 'weight': None}

    dob = profile.date_of_birth
    age = (timezone.now().date() - dob).days // 365 if dob else None

    # Simple BMI calculation (needs height which may not be available)
    bmi = None
    if hasattr(latest, 'height') and latest.height:
        try:
            height_m = latest.height / 100
            bmi = latest.weight / (height_m ** 2)
        except:
            pass

    return {
        'weight_kg': _format_number(latest.weight, 1),
        'date': _format_date(latest.date),
        'bmi': _format_number(bmi, 1) if bmi else '—',
        'status': _categorize_bmi(bmi) if bmi else 'Unknown'
    }


def _categorize_bmi(bmi: float) -> str:
    """Categorize BMI."""
    if bmi < 18.5:
        return 'Underweight'
    elif bmi < 25:
        return 'Normal weight'
    elif bmi < 30:
        return 'Overweight'
    else:
        return 'Obese'


def _get_supplements_data(profile) -> Dict[str, Any]:
    """Gather active supplement regimen."""
    from .models import SupplementSchedule

    schedules = SupplementSchedule.objects.filter(
        profile=profile,
        is_active=True
    ).select_related('supplement').order_by('sort_order')

    supplements = [
        {
            'name': s.supplement.name,
            'dose': f"{s.dose_amount} {s.dose_unit}",
            'frequency': f"{s.dose_amount}x {s.time_slot}",
        }
        for s in schedules
    ]

    return {
        'count': len(supplements),
        'supplements': supplements[:10]  # Top 10
    }


def _get_timeline_data(profile) -> Dict[str, Any]:
    """Gather 90-day timeline summary."""
    from .models import MetricTimeline

    days_back = timezone.now().date() - timedelta(days=90)

    timeline = MetricTimeline.objects.filter(
        profile=profile,
        date__gte=days_back
    ).values_list('metric_type', flat=True).distinct()

    return {
        'metrics_tracked': list(timeline),
        'days_count': 90,
    }


def _get_cardiovascular_risk_data(profile) -> Dict[str, Any]:
    """Gather cardiovascular risk assessment."""
    from .bp_services import get_cardiovascular_risk_score

    try:
        risk_data = get_cardiovascular_risk_score(profile)
        return {
            'risk_score': risk_data.get('risk_score', 0),
            'risk_level': risk_data.get('risk_level', 'Unknown'),
            'factors': risk_data.get('risk_factors', [])[:5]
        }
    except:
        return {'risk_score': None, 'risk_level': 'Unable to calculate'}


def _get_recommendations_data(profile) -> Dict[str, Any]:
    """Gather health recommendations."""
    from .recommendations import get_user_recommendations

    try:
        recs = get_user_recommendations(profile)
        top_recs = recs[:3] if isinstance(recs, list) else []
        return {
            'recommendations': [str(r) for r in top_recs],
            'count': len(top_recs)
        }
    except:
        return {'recommendations': [], 'count': 0}


def generate_health_passport(profile, sections: List[str] = None) -> bytes:
    """
    §MAIN: Generate health passport PDF.

    Args:
        profile: HealthProfile instance
        sections: List of sections to include
                 ('header', 'blood', 'bp', 'weight', 'supplements', 'timeline', 'risk', 'recommendations')
                 Default: all sections

    Returns:
        PDF bytes ready for download/email
    """

    if sections is None:
        sections = ['header', 'blood', 'bp', 'weight', 'supplements', 'timeline', 'risk', 'recommendations']

    # Create PDF in memory
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5*inch, bottomMargin=0.5*inch)

    # Styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=12,
        alignment=TA_CENTER,
    )
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=8,
        spaceBefore=8,
        borderPadding=4,
        borderColor=colors.HexColor('#dbeafe'),
        borderWidth=1,
    )
    normal_style = styles['Normal']

    # Build document
    story = []

    # Header section
    if 'header' in sections:
        story.append(Paragraph(f'Health Passport', title_style))

        header_data = [
            ['Patient:', profile.full_name or 'Not specified'],
            ['Date of Birth:', _format_date(profile.date_of_birth) if profile.date_of_birth else '—'],
            ['Sex:', 'Male' if profile.sex == 'M' else 'Female' if profile.sex == 'F' else '—'],
            ['Report Generated:', _format_date(timezone.now().date())],
        ]

        header_table = Table(header_data, colWidths=[2*inch, 4*inch])
        header_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))

        story.append(header_table)
        story.append(Spacer(1, 0.2*inch))

    # Blood Results section
    if 'blood' in sections:
        story.append(Paragraph('Blood Test Results', heading_style))

        blood_data = _get_blood_results_data(profile)

        if blood_data['reports']:
            for report in blood_data['reports'][:2]:  # Last 2 reports
                report_text = f"{report['lab_name']} — {report['test_date']} (Score: {report['score']})"
                story.append(Paragraph(report_text, normal_style))

                if report['results']:
                    result_data = [['Test', 'Value', 'Unit', 'Flag']]
                    for r in report['results'][:8]:  # Top 8 results
                        result_data.append([r['name'], r['value'], r['unit'], r['flag'] or ''])

                    result_table = Table(result_data, colWidths=[2*inch, 1*inch, 1*inch, 0.5*inch])
                    result_table.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dbeafe')),
                        ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
                        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                        ('FONTSIZE', (0, 0), (-1, -1), 9),
                        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f9ff')]),
                    ]))
                    story.append(result_table)
                    story.append(Spacer(1, 0.1*inch))
        else:
            story.append(Paragraph('No blood test results recorded.', normal_style))

        story.append(Spacer(1, 0.15*inch))

    # Blood Pressure section
    if 'bp' in sections:
        story.append(Paragraph('Blood Pressure', heading_style))

        bp_data = _get_bp_data(profile)

        if bp_data.get('readings_count', 0) > 0:
            bp_table_data = [
                ['Metric', 'Value'],
                ['Latest (Systolic/Diastolic)', f"{bp_data['latest']['systolic']}/{bp_data['latest']['diastolic']} mmHg"],
                ['30-Day Average', f"{bp_data['avg_systolic']}/{bp_data['avg_diastolic']} mmHg"],
                ['Range (Systolic)', f"{bp_data['min_systolic']} - {bp_data['max_systolic']} mmHg"],
                ['Readings in Period', str(bp_data['readings_count'])],
            ]

            bp_table = Table(bp_table_data, colWidths=[2.5*inch, 3.5*inch])
            bp_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dbeafe')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f9ff')]),
            ]))
            story.append(bp_table)
        else:
            story.append(Paragraph('No BP readings recorded.', normal_style))

        story.append(Spacer(1, 0.15*inch))

    # Weight section
    if 'weight' in sections:
        story.append(Paragraph('Weight & BMI', heading_style))

        weight_data = _get_weight_data(profile)

        if weight_data.get('weight_kg'):
            weight_table_data = [
                ['Metric', 'Value'],
                ['Current Weight', f"{weight_data['weight_kg']} kg"],
                ['BMI', weight_data['bmi']],
                ['Category', weight_data['status']],
                ['As of', weight_data['date']],
            ]

            weight_table = Table(weight_table_data, colWidths=[2.5*inch, 3.5*inch])
            weight_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dbeafe')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f9ff')]),
            ]))
            story.append(weight_table)
        else:
            story.append(Paragraph('No weight data recorded.', normal_style))

        story.append(Spacer(1, 0.15*inch))

    # Supplements section
    if 'supplements' in sections:
        story.append(Paragraph('Supplement Regimen', heading_style))

        supp_data = _get_supplements_data(profile)

        if supp_data['supplements']:
            supp_table_data = [['Supplement', 'Dose', 'Frequency']]
            for s in supp_data['supplements']:
                supp_table_data.append([s['name'], s['dose'], s['frequency']])

            supp_table = Table(supp_table_data, colWidths=[2.5*inch, 1.5*inch, 2*inch])
            supp_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dbeafe')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f9ff')]),
            ]))
            story.append(supp_table)
        else:
            story.append(Paragraph('No active supplements.', normal_style))

        story.append(Spacer(1, 0.15*inch))

    # Timeline section
    if 'timeline' in sections:
        story.append(Paragraph('Tracked Metrics (90-Day)', heading_style))

        timeline_data = _get_timeline_data(profile)

        if timeline_data['metrics_tracked']:
            metrics_text = ', '.join(timeline_data['metrics_tracked'])
            story.append(Paragraph(metrics_text, normal_style))
        else:
            story.append(Paragraph('No metrics tracked in last 90 days.', normal_style))

        story.append(Spacer(1, 0.15*inch))

    # Cardiovascular Risk section
    if 'risk' in sections:
        story.append(Paragraph('Cardiovascular Risk Assessment', heading_style))

        risk_data = _get_cardiovascular_risk_data(profile)

        if risk_data.get('risk_score') is not None:
            risk_color = colors.HexColor('#ef4444') if risk_data['risk_level'] == 'High' else colors.HexColor('#f97316')
            story.append(Paragraph(f"Risk Level: <font color='#ef4444'><b>{risk_data['risk_level']}</b></font>", normal_style))
            story.append(Paragraph(f"Score: {_format_number(risk_data['risk_score'], 0)}/100", normal_style))

            if risk_data['factors']:
                story.append(Paragraph('Key Risk Factors:', normal_style))
                for factor in risk_data['factors']:
                    story.append(Paragraph(f"• {factor}", normal_style))
        else:
            story.append(Paragraph(risk_data.get('risk_level', 'Unable to calculate risk.'), normal_style))

        story.append(Spacer(1, 0.15*inch))

    # Recommendations section
    if 'recommendations' in sections:
        story.append(Paragraph('Health Recommendations', heading_style))

        rec_data = _get_recommendations_data(profile)

        if rec_data['recommendations']:
            for i, rec in enumerate(rec_data['recommendations'], 1):
                story.append(Paragraph(f"{i}. {rec}", normal_style))
        else:
            story.append(Paragraph('No specific recommendations at this time.', normal_style))

    # Footer
    story.append(Spacer(1, 0.2*inch))
    footer_text = f'<font size="8">Generated by DomApp Health Passport on {_format_date(timezone.now().date())}. This is a summary for informational purposes. Consult with healthcare providers for medical decisions.</font>'
    story.append(Paragraph(footer_text, normal_style))

    # Build PDF
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
