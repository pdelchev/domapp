from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/', include('properties.urls')),
    path('api/', include('tenants.urls')),
    path('api/', include('leases.urls')),
    path('api/', include('finance.urls')),
    path('api/', include('documents.urls')),
    path('api/', include('notifications.urls')),
    path('api/', include('dashboard.urls')),
    path('api/', include('problems.urls')),
    path('api/', include('investments.urls')),
    path('api/', include('music.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)