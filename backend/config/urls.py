from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from common.api import health, ready
from collection.link_preview import metadata, pin_page
from collection import social
from collection import image_moderation
from collection.push import subscriptions

urlpatterns = [
    path("pin/<int:pk>", pin_page),
    path("pin/<int:pk>/", pin_page),
    path("api/pins/<int:pk>/metadata/", metadata),
    path("api/image-scans/<int:pk>/", image_moderation.scan_status),
    path("api/image-scans/<int:pk>/image/", image_moderation.preview),
    path("api/image-scans/<int:pk>/appeal/", image_moderation.appeal),
    path("api/image-scans/<int:pk>/review/", image_moderation.request_review),
    path("api/moderation/images/", image_moderation.processing_queue),
    path("api/profiles/<str:username>/follow/", social.follow),
    path("api/profiles/<str:username>/followers/", social.follow_list, {"direction": "followers"}),
    path("api/profiles/<str:username>/following/", social.follow_list, {"direction": "following"}),
    path("api/notifications/", social.notifications),
    path("api/push/subscriptions/", subscriptions),
    path("api/notifications/settings/", social.notification_settings),
    path("api/reports/", social.report),
    path("api/moderation/", social.moderation_queue),
    path("api/moderation/<int:pk>/", social.moderate),
    path("api/moderation/<int:pk>/media/", social.moderation_media),
    path("admin/", admin.site.urls),
    path("api/health/", health),
    path("api/ready/", ready),
    path("api/auth/", include("accounts.urls")),
    path("api/chat/", include("messaging.urls")),
    path("api/", include("collection.urls")),
]
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

handler400 = "common.api.bad_request"
handler403 = "common.api.forbidden"
handler404 = "common.api.not_found"
handler500 = "common.api.server_error"
