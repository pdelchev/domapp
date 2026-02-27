from django.shortcuts import render

# Create your views here.
from rest_framework import viewsets, mixins
from rest_framework.permissions import IsAuthenticated
from .models import Document
from .serializers import DocumentSerializer


class DocumentViewSet(mixins.ListModelMixin,
                      mixins.CreateModelMixin,
                      mixins.RetrieveModelMixin,
                      mixins.DestroyModelMixin,
                      viewsets.GenericViewSet):
    """List, upload, view, delete documents — no edit (re-upload instead)."""
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Document.objects.filter(property__user=self.request.user).select_related('property')
        property_id = self.request.query_params.get('property')
        if property_id:
            qs = qs.filter(property_id=property_id)
        document_type = self.request.query_params.get('type')
        if document_type:
            qs = qs.filter(document_type=document_type)
        return qs