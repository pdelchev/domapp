from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Lease
from .serializers import LeaseSerializer
from .services import generate_payments_for_lease, calculate_first_payment_date


class LeaseViewSet(viewsets.ModelViewSet):
    """
    CRUD for leases — scoped to manager's properties.

    Extra actions:
      POST /api/leases/{id}/generate_payments/ — trigger payment generation
    """
    serializer_class = LeaseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Lease.objects.filter(
            property__user=self.request.user.get_data_owner()
        ).select_related('tenant', 'property')

        property_id = self.request.query_params.get('property')
        if property_id:
            qs = qs.filter(property_id=property_id)

        tenant_id = self.request.query_params.get('tenant')
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)

        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        return qs

    def perform_create(self, serializer):
        """
        On lease creation:
        1. Save the lease
        2. Set next_payment_date if recurring
        3. Generate initial payment records
        """
        lease = serializer.save()

        if lease.rent_frequency != 'one_time' and lease.auto_generate_payments:
            # Set the generation cursor
            lease.next_payment_date = calculate_first_payment_date(lease)
            lease.save(update_fields=['next_payment_date'])
            # Generate initial payments
            generate_payments_for_lease(lease)

    def perform_update(self, serializer):
        """On update, if frequency/amount changed, reset cursor if needed."""
        lease = serializer.save()

        # If lease was just activated and has no cursor, initialize it
        if (lease.status == 'active'
                and lease.rent_frequency != 'one_time'
                and lease.auto_generate_payments
                and lease.next_payment_date is None):
            lease.next_payment_date = calculate_first_payment_date(lease)
            lease.save(update_fields=['next_payment_date'])
            generate_payments_for_lease(lease)

    @action(detail=True, methods=['post'])
    def generate_payments(self, request, pk=None):
        """Manually trigger payment generation for a lease."""
        lease = self.get_object()

        if lease.rent_frequency == 'one_time':
            return Response(
                {'detail': 'One-time leases do not support auto-generation.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if lease.status != 'active':
            return Response(
                {'detail': 'Only active leases can generate payments.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        count = generate_payments_for_lease(lease)
        return Response({
            'payments_created': count,
            'next_payment_date': str(lease.next_payment_date),
        })
