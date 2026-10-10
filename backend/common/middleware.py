import ipaddress

from django.conf import settings
from .api import failure


class ProxyClientAddress:
    """Use only the header overwritten by our sole, private reverse proxy."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if getattr(settings, "BEHTREST_TRUST_PROXY", False):
            value = request.META.get("HTTP_X_BEHTREST_CLIENT_IP")
            if value:
                try:
                    request.META["REMOTE_ADDR"] = str(ipaddress.ip_address(value))
                except ValueError:
                    return failure("bad_request", "Invalid proxy address.", 400)
        return self.get_response(request)
