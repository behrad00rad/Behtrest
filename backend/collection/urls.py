from django.urls import path
from . import views

urlpatterns = [
    path("posts/<int:pk>/", views.post_owner_actions),
    path("comments/<int:pk>/", views.comment_owner_actions),
    path("boards/<int:pk>/", views.board_detail),
    path("boards/<int:pk>/manage/", views.board_owner_actions),
    path("saves/<int:pk>/", views.saved_post_owner_actions),
]
