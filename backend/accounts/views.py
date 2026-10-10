from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.forms import PasswordResetForm, SetPasswordForm
from django.contrib.auth.tokens import default_token_generator
from django.db import transaction
from django.db.models import F
from django.middleware.csrf import get_token
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from django.views.decorators.cache import never_cache

from common.api import ApiError, endpoint, success, validate_form
from .forms import LoginForm, ProfileForm, RegistrationForm
from .models import RegistrationPolicy, Referral, ReferralRedemption


def serialize_user(user):
    from collection.models import ImageScan
    scan = ImageScan.objects.filter(profile=user.profile).exclude(status__in=['approved', 'canceled']).order_by('-id').first()
    return {
        "id": user.pk, "username": user.username, "email": user.email,
        "can_moderate": user.is_staff and user.has_perm("collection.review_reports"),
        "can_manage_referrals": user.is_staff and user.has_perms(["accounts.change_registrationpolicy", "accounts.change_referral"]),
        "profile": {"display_name": user.profile.display_name, "bio": user.profile.bio, "avatar": user.profile.avatar.url if user.profile.avatar else None, "avatar_scan": {"id": scan.pk, "status": scan.status} if scan else None},
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
        policy, _ = RegistrationPolicy.objects.get_or_create(pk=1)
        code = request.data.get("referral_code", "")
        if not isinstance(code, str) or len(code) > 32:
            raise ApiError("invalid_referral", "Enter a valid referral code.", fields={"referral_code": ["Invalid referral code."]})
        code = code.strip()
        referral = None
        if code or policy.invite_required:
            referral = Referral.objects.select_for_update().filter(code=code, user__is_active=True, enabled=True).first()
            limit = referral.allowance_override if referral and referral.allowance_override is not None else policy.referrals_per_user
            if not referral or referral.used >= limit:
                raise ApiError("invalid_referral", "This referral code is invalid or has no invites remaining.", fields={"referral_code": ["Ask a member for an available invite code."]})
            # Conditional increment enforces the allowance even on databases where
            # row locks are unavailable. Account creation rolls it back on failure.
            if not Referral.objects.filter(pk=referral.pk, used__lt=limit, enabled=True, code=code).update(used=F("used") + 1):
                raise ApiError("invalid_referral", "This code has no invites remaining.")
        user = form.save()
        if referral:
            ReferralRedemption.objects.create(referral=referral, joined_user=user)
    login(request, user)
    return success({"user": serialize_user(user), "csrfToken": get_token(request)}, 201)


@never_cache
@endpoint(["GET"])
def registration_policy(request):
    policy, _ = RegistrationPolicy.objects.get_or_create(pk=1)
    return success({"invite_required": policy.invite_required})


@never_cache
@endpoint(["GET"], authenticated=True)
def referrals(request):
    policy, _ = RegistrationPolicy.objects.get_or_create(pk=1)
    referral, _ = Referral.objects.get_or_create(user=request.user)
    limit = referral.allowance_override if referral.allowance_override is not None else policy.referrals_per_user
    return success({"code": referral.code, "used": referral.used, "limit": limit, "enabled": referral.enabled,
                    "remaining": max(0, limit - referral.used) if referral.enabled else 0, "invite_required": policy.invite_required})


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
