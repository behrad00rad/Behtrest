"""Staff-only referral controls with Django admin audit history."""
import json
from django.contrib.admin.models import LogEntry, CHANGE
from django.contrib.contenttypes.models import ContentType
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from common.api import ApiError, endpoint, success
from django.views.decorators.cache import never_cache
from .models import RegistrationPolicy, Referral, referral_code


def require_admin(request):
    if not request.user.is_staff or not request.user.has_perms(["accounts.change_registrationpolicy", "accounts.change_referral"]):
        raise ApiError("permission_denied", "You cannot manage referral settings.", 403)


def audit(actor, obj, fields):
    LogEntry.objects.create(user=actor, content_type=ContentType.objects.get_for_model(obj), object_id=str(obj.pk),
                            object_repr=str(obj)[:200], action_flag=CHANGE,
                            change_message=json.dumps([{"changed": {"fields": fields}}]))


def allowance(value, nullable=False):
    if nullable and value is None: return None
    if type(value) is not int or not 0 <= value <= 10000:
        raise ApiError("invalid_input", "Use an allowance between 0 and 10,000.")
    return value


@never_cache
@endpoint(["GET", "PATCH"], authenticated=True, rate=(30, 60))
@transaction.atomic
def settings(request):
    require_admin(request)
    policy, _ = RegistrationPolicy.objects.get_or_create(pk=1)
    policy = RegistrationPolicy.objects.select_for_update().get(pk=policy.pk)
    if request.method == "PATCH":
        if not request.data or set(request.data) - {"invite_required", "referrals_per_user"}:
            raise ApiError("invalid_input", "Only registration settings can be changed here.")
        if "invite_required" in request.data:
            if type(request.data["invite_required"]) is not bool: raise ApiError("invalid_input", "Use true or false for invite-only registration.")
            policy.invite_required = request.data["invite_required"]
        if "referrals_per_user" in request.data: policy.referrals_per_user = allowance(request.data["referrals_per_user"])
        policy.save()
        audit(request.user, policy, list(request.data))
    return success({"invite_required": policy.invite_required, "referrals_per_user": policy.referrals_per_user})


@never_cache
@endpoint(["GET"], authenticated=True)
def members(request):
    require_admin(request)
    query = request.GET.get("q", "").strip()[:150]
    try: page = int(request.GET.get("page", 1))
    except ValueError: raise ApiError("invalid_input", "Invalid page.")
    if not 1 <= page <= 100000: raise ApiError("invalid_input", "Invalid page.")
    users = get_user_model().objects.filter(Q(username__icontains=query) | Q(profile__display_name__icontains=query)).order_by("username")
    entries = list(users[(page - 1) * 20:page * 20 + 1])
    items = []
    for user in entries[:20]:
        referral, _ = Referral.objects.get_or_create(user=user)
        items.append({"id": user.pk, "username": user.username, "active": user.is_active,
                      "code": referral.code, "used": referral.used, "enabled": referral.enabled, "allowance_override": referral.allowance_override})
    return success({"items": items, "next_page": page + 1 if len(entries) > 20 else None})


@never_cache
@endpoint(["PATCH"], authenticated=True, rate=(30, 60))
@transaction.atomic
def member(request, pk):
    require_admin(request)
    from django.shortcuts import get_object_or_404
    user = get_object_or_404(get_user_model(), pk=pk)
    referral, _ = Referral.objects.get_or_create(user=user)
    referral = Referral.objects.select_for_update().get(pk=referral.pk)
    if not request.data or set(request.data) - {"enabled", "allowance_override", "regenerate"}:
        raise ApiError("invalid_input", "Only invite controls can be changed here.")
    for field in ["enabled", "regenerate"]:
        if field in request.data and type(request.data[field]) is not bool: raise ApiError("invalid_input", "Use true or false for invite controls.")
    if "enabled" in request.data: referral.enabled = request.data["enabled"]
    if "allowance_override" in request.data: referral.allowance_override = allowance(request.data["allowance_override"], nullable=True)
    if request.data.get("regenerate"): referral.code = referral_code()
    referral.save()
    audit(request.user, referral, list(request.data))
    return success({"updated": True})
