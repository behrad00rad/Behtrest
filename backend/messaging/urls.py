from django.urls import path
from . import views

urlpatterns = [
    path("summary/", views.summary),
    path("conversations/", views.conversations),
    path("conversations/<int:pk>/", views.conversation),
    path("conversations/<int:pk>/members/", views.members),
    path("conversations/<int:pk>/messages/", views.messages),
    path("conversations/<int:pk>/receipts/", views.receipts),
    path("conversations/<int:pk>/attachments/", views.attachment_upload),
    path("messages/<int:pk>/", views.message_actions),
    path("messages/<int:pk>/reactions/", views.reactions),
    path("messages/<int:pk>/report/", views.reports),
    path("attachments/<int:pk>/", views.attachment_download),
    path("settings/", views.chat_settings),
    path("blocks/", views.blocks),
]
