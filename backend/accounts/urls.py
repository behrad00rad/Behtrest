from django.urls import path
from . import views

urlpatterns = [
    path("registration-policy/", views.registration_policy),
    path("referrals/", views.referrals),
    path("session/", views.session),
    path("register/", views.register),
    path("login/", views.sign_in),
    path("logout/", views.sign_out),
    path("profile/", views.update_profile),
    path("password-reset/", views.password_reset),
    path("password-reset/confirm/", views.password_reset_confirm),
]
