from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import RegisterView, MeView, LogoutView, SubAccountListView, SubAccountDetailView

urlpatterns = [
    path('login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('register/', RegisterView.as_view(), name='register'),
    path('me/', MeView.as_view(), name='me'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('sub-accounts/', SubAccountListView.as_view(), name='sub-accounts'),
    path('sub-accounts/<int:user_id>/', SubAccountDetailView.as_view(), name='sub-account-detail'),
]
