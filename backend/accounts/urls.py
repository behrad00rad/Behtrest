from django.urls import path
from . import views
from . import referrals

urlpatterns = [
    path("admin/referrals/settings/", referrals.settings),
    path("admin/referrals/members/", referrals.members),
    path("admin/referrals/members/<int:pk>/", referrals.member),
    path("registration-policy/", views.registration_policy),
    path("referrals/", views.referrals),
    path("session/", views.session),
    path("guest/", views.guest),
    path("register/", views.register),
    path("login/", views.sign_in),
    path("logout/", views.sign_out),
    path("profile/", views.update_profile),
    path("interests/", views.update_interests),
    path("password-reset/", views.password_reset),
    path("password-reset/confirm/", views.password_reset_confirm),
]
