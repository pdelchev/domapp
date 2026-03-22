from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Investment
from .serializers import InvestmentSerializer


class InvestmentViewSet(viewsets.ModelViewSet):
    """CRUD for investments — scoped to the current manager."""
    serializer_class = InvestmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Investment.objects.filter(
            user=self.request.user.get_data_owner()
        ).select_related('property')

        property_id = self.request.query_params.get('property')
        if property_id:
            qs = qs.filter(property_id=property_id)

        status = self.request.query_params.get('status')
        if status:
            qs = qs.filter(status=status)

        investment_type = self.request.query_params.get('type')
        if investment_type:
            qs = qs.filter(investment_type=investment_type)

        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())
