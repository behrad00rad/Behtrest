from django.urls import path
from . import views
from . import pins

urlpatterns = [
    path('posts/<int:pk>/text-card/', views.update_text_card),
    path('pins/<int:pk>/download', pins.download),
    path('pins/<int:pk>/download/', pins.download),
    path('comments/<int:pk>/likes/', pins.comment_like),
    path('pins/<int:pk>/likes/', pins.like),
    path('pins/<int:pk>/events/', pins.event),
    path('pins/<int:pk>/related/', pins.related),
    path('pins/<int:pk>/related', pins.related),
    path('feed', views.feed),
    path('profiles/<str:username>/liked/', pins.liked),
    path('feed/', views.feed),
    path('posts/', views.create_post),
    path('posts/<int:pk>/', views.post_owner_actions),
    path('posts/<int:pk>/comments/', views.comments),
    path('comments/<int:pk>/', views.comment_owner_actions),
    path('boards/', views.boards),
    path('boards/<int:pk>/', views.board_detail),
    path('boards/<int:pk>/manage/', views.board_owner_actions),
    path('boards/<int:pk>/posts/', views.board_posts),
    path('boards/<int:pk>/saves/', views.save_to_board),
    path('boards/<int:pk>/saves/<int:post_pk>/', views.remove_from_board),
    path('saves/<int:pk>/', views.saved_post_owner_actions),
    path('profiles/<str:username>/', views.profile_detail),
    path('profile/avatar/', views.avatar_upload),
    path('profile/avatar/remove/', views.avatar_delete),
    path('people/', views.people_search),
    path('tags/', views.tag_list),
]
