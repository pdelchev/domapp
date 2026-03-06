from rest_framework import viewsets, mixins, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(mixins.ListModelMixin,
                          mixins.UpdateModelMixin,
                          viewsets.GenericViewSet):
    """List notifications and mark as read (PUT/PATCH)."""
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Notification.objects.filter(user=self.request.user)
        # Filter by type
        ntype = self.request.query_params.get('type')
        if ntype:
            qs = qs.filter(type=ntype)
        # Filter by read status
        read = self.request.query_params.get('read')
        if read == 'true':
            qs = qs.filter(read_status=True)
        elif read == 'false':
            qs = qs.filter(read_status=False)
        return qs


class UnreadCountView(APIView):
    """Return the count of unread notifications for badge display."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(user=request.user, read_status=False).count()
        return Response({'count': count})


class MarkAllReadView(APIView):
    """Mark all notifications as read."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        updated = Notification.objects.filter(
            user=request.user, read_status=False
        ).update(read_status=True)
        return Response({'updated': updated})


class DismissNotificationView(APIView):
    """Delete a single notification."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            notification = Notification.objects.get(pk=pk, user=request.user)
            notification.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Notification.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
