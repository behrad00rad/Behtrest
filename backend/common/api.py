import hashlib
import json
import math
from functools import wraps

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.db.models import F
from django.http import Http404, JsonResponse
from django.utils import timezone


def success(data=None, status=200):
    return JsonResponse({"data": data}, status=status)


def failure(code, message, status=400, fields=None):
    error = {"code": code, "message": message}
    if fields:
        error["fields"] = fields
    return JsonResponse({"error": error}, status=status)


class ApiError(Exception):
    def __init__(self, code, message, status=400, fields=None):
        self.code, self.message, self.status, self.fields = code, message, status, fields


def validate_form(form):
    if not form.is_valid():
        fields = {name: [str(message) for message in messages] for name, messages in form.errors.items()}
        raise ApiError("validation_error", "Please check the highlighted fields.", fields=fields)
    return form


def consume_limit(action, identity, limit, seconds):
    """Atomic fixed-window counters. No raw IPs/emails/usernames are stored."""
    from accounts.models import RateLimitBucket
    now = timezone.now()
    window = math.floor(now.timestamp() / seconds)
    key = hashlib.sha256(f"{action}:{identity}:{window}".encode()).hexdigest()
    expires = timezone.datetime.fromtimestamp((window + 1) * seconds, tz=timezone.get_current_timezone())
    # Updating in one statement avoids lost increments between workers.
    bucket, _ = RateLimitBucket.objects.get_or_create(key=key, defaults={"expires_at": expires})
    RateLimitBucket.objects.filter(pk=bucket.pk).update(count=F("count") + 1)
    bucket.refresh_from_db(fields=["count"])
    return max(1, math.ceil((expires - now).total_seconds())) if bucket.count > limit else 0


def endpoint(methods, *, authenticated=False, rate=None, account_field=None):
    def decorate(view):
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            if request.method not in methods:
                response = failure("method_not_allowed", "This method is not supported.", 405)
                response["Allow"] = ", ".join(methods)
                return response
            if authenticated and not request.user.is_authenticated:
                return failure("authentication_required", "Please sign in to continue.", 401)
            try:
                request.data = {}
                # Consume the IP bucket before parsing to also limit malformed requests.
                if rate and settings.API_RATE_LIMITS_ENABLED:
                    wait = consume_limit(view.__name__, request.META.get("REMOTE_ADDR", "unknown"), *rate)
                    if wait:
                        response = failure("rate_limited", "Too many attempts. Please try again later.", 429)
                        response["Retry-After"] = str(wait)
                        return response
                if request.method in {"POST", "PATCH", "PUT", "DELETE"} and request.body:
                    if request.content_type != "application/json":
                        raise ApiError("unsupported_media_type", "Send JSON with Content-Type application/json.", 415)
                    try:
                        request.data = json.loads(request.body)
                    except (ValueError, UnicodeDecodeError):
                        raise ApiError("invalid_json", "The request body must contain valid JSON.")
                    if not isinstance(request.data, dict):
                        raise ApiError("invalid_json", "The request body must be a JSON object.")
                    if any(not isinstance(value, (str, bool, int, float, type(None))) for value in request.data.values()):
                        raise ApiError("invalid_input", "Nested values are not supported.")
                    for key, value in request.data.items():
                        if key in {"password", "password1", "password2", "new_password1", "new_password2"}:
                            if not isinstance(value, str) or len(value) > 1024:
                                raise ApiError("validation_error", "Please check the highlighted fields.", fields={key: ["Use a password of at most 1024 characters."]})
                    if any(key in request.data for key in ("user_id", "owner", "owner_id", "author", "author_id")):
                        raise ApiError("invalid_owner", "Ownership is determined by your signed-in account.")
                if account_field and settings.API_RATE_LIMITS_ENABLED:
                    account = request.data.get(account_field, "")
                    if isinstance(account, str) and account.strip():
                        wait = consume_limit(view.__name__ + ":account", account.strip().casefold(), *rate)
                        if wait:
                            response = failure("rate_limited", "Too many attempts. Please try again later.", 429)
                            response["Retry-After"] = str(wait)
                            return response
                return view(request, *args, **kwargs)
            except ApiError as error:
                return failure(error.code, error.message, error.status, error.fields)
            except Http404:
                return failure("not_found", "This item was not found.", 404)
            except ValidationError as error:
                fields = error.message_dict if hasattr(error, "message_dict") else {"__all__": error.messages}
                return failure("validation_error", "Please check the highlighted fields.", fields=fields)
            except IntegrityError:
                return failure("conflict", "An item with these details already exists.", 409)
        return wrapped
    return decorate


@endpoint(["GET"])
def health(request):
    return success({"status": "ok", "service": "bintrest"})


def csrf_failure(request, reason=""):
    return failure("csrf_failed", "Your security token expired. Refresh the page and try again.", 403)


def bad_request(request, exception):
    return failure("bad_request", "The request could not be understood.", 400)


def forbidden(request, exception):
    return failure("forbidden", "You do not have access to this resource.", 403)


def not_found(request, exception):
    return failure("not_found", "This page was not found.", 404)


def server_error(request):
    return failure("server_error", "Something went wrong. Please try again.", 500)
