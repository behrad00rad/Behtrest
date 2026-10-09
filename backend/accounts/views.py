from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.forms import PasswordResetForm, SetPasswordForm
from django.contrib.auth.tokens import default_token_generator
from django.db import transaction
from django.middleware.csrf import get_token
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from django.views.decorators.cache import never_cache

from common.api import ApiError, endpoint, success, validate_form
from .forms import LoginForm, ProfileForm, RegistrationForm


def serialize_user(user):
    return {
        "id": user.pk, "username": user.username, "email": user.email,
        "profile": {"display_name": user.profile.display_name, "bio": user.profile.bio},
    }


@never_cache
@endpoint(["GET"])
def session(request):
    return success({"user": serialize_user(request.user) if request.user.is_authenticated else None, "csrfToken": get_token(request)})


@never_cache
@endpoint(["POST"], rate=(5, 3600), account_field="email")
def register(request):
    form = validate_form(RegistrationForm(request.data))
    with transaction.atomic():
        user = form.save()
    login(request, user)
    return success({"user": serialize_user(user), "csrfToken": get_token(request)}, 201)


@never_cache
@endpoint(["POST"], rate=(10, 300), account_field="username")
def sign_in(request):
    form = validate_form(LoginForm(request.data))
    user = authenticate(request, username=form.cleaned_data["username"].lower(), password=form.cleaned_data["password"])
    if user is None:
        raise ApiError("invalid_credentials", "The username or password is incorrect.", 401)
    login(request, user)
    return success({"user": serialize_user(user), "csrfToken": get_token(request)})


@never_cache
@endpoint(["POST"], authenticated=True, rate=(30, 60))
def sign_out(request):
    logout(request)
    return success({"user": None, "csrfToken": get_token(request)})


@never_cache
@endpoint(["PATCH"], authenticated=True, rate=(30, 60))
def update_profile(request):
    allowed = {"display_name", "bio"}
    if not request.data or set(request.data) - allowed:
        raise ApiError("invalid_input", "Only display_name and bio can be changed here.")
    values = {field: request.data.get(field, getattr(request.user.profile, field)) for field in allowed}
    form = validate_form(ProfileForm(values, instance=request.user.profile))
    form.save()
    return success({"user": serialize_user(request.user)})


@never_cache
@endpoint(["POST"], rate=(5, 3600), account_field="email")
def password_reset(request):
    form = validate_form(PasswordResetForm(request.data))
    form.save(
        request=request,
        use_https=settings.FRONTEND_ORIGIN.startswith("https://"),
        domain_override=settings.FRONTEND_ORIGIN.split("://", 1)[-1],
        from_email=settings.DEFAULT_FROM_EMAIL,
        email_template_name="accounts/password_reset_email.txt",
        subject_template_name="accounts/password_reset_subject.txt",
    )
    return success({"message": "If an account matches that email, a reset link has been sent."})


@never_cache
@endpoint(["POST"], rate=(10, 300))
def password_reset_confirm(request):
    uid, token = request.data.get("uid"), request.data.get("token")
    if not isinstance(uid, str) or not isinstance(token, str) or len(uid) > 128 or len(token) > 128:
        raise ApiError("invalid_reset", "This reset link is invalid or expired.")
    try:
        user = get_user_model().objects.get(pk=force_str(urlsafe_base64_decode(uid)), is_active=True)
    except (ValueError, TypeError, OverflowError, UnicodeDecodeError, get_user_model().DoesNotExist):
        raise ApiError("invalid_reset", "This reset link is invalid or expired.")
    if not default_token_generator.check_token(user, token):
        raise ApiError("invalid_reset", "This reset link is invalid or expired.")
    form = validate_form(SetPasswordForm(user, request.data))
    previous_hash = user.password
    user.set_password(form.cleaned_data["new_password1"])
    # Compare-and-swap consumes a token once, including with SQLite (which
    # does not support SELECT FOR UPDATE).
    changed = get_user_model().objects.filter(pk=user.pk, password=previous_hash).update(password=user.password)
    if not changed:
        raise ApiError("invalid_reset", "This reset link is invalid or expired.")
    logout(request)
    return success({"message": "Password updated. You can sign in now.", "csrfToken": get_token(request)})
