from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from common.api import health, ready

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health),
    path("api/ready/", ready),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("collection.urls")),
]
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

handler400 = "common.api.bad_request"
handler403 = "common.api.forbidden"
handler404 = "common.api.not_found"
handler500 = "common.api.server_error"
