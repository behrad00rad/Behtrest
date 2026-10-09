import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
from django.core.asgi import get_asgi_application
http_application = get_asgi_application()
from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import OriginValidator
from django.conf import settings
from django.contrib.staticfiles.handlers import ASGIStaticFilesHandler
from django.urls import path
from messaging.consumers import ChatConsumer

if settings.DEBUG:
    http_application = ASGIStaticFilesHandler(http_application)

application = ProtocolTypeRouter({
    "http": http_application,
    "websocket": OriginValidator(AuthMiddlewareStack(URLRouter([
        path("ws/chat/", ChatConsumer.as_asgi()),
    ])), settings.CHAT_ALLOWED_ORIGINS),
})
