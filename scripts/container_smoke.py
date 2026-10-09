"""Probe the CI-only localhost certificate, routing, headers, and persistence."""
import json
import ssl
import urllib.request
import urllib.error

# Caddy generates an internal certificate for localhost in this disposable job.
context = ssl._create_unverified_context()
origin = "https://localhost:8443"


def get(path):
    return urllib.request.urlopen(origin + path, context=context, timeout=10)


with get("/api/ready/") as response:
    assert json.load(response)["data"]["status"] == "ready"
with get("/login") as response:
    html = response.read().decode()
    assert "<div id=\"root\">" in html
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]
with get("/static/admin/css/base.css") as response:
    assert "text/css" in response.headers["Content-Type"]
with get("/api/auth/session/") as response:
    cookies = response.headers.get_all("Set-Cookie", [])
    assert any("csrftoken=" in cookie and "Secure" in cookie and "HttpOnly" in cookie for cookie in cookies)
try:
    get("/api/does-not-exist/")
    raise AssertionError("Unknown API routes must not serve the SPA.")
except urllib.error.HTTPError as error:
    assert error.code == 404
    assert json.load(error)["error"]["code"] == "not_found"
print("Container HTTPS, API, SPA, static, secure-cookie, and error-routing smoke checks passed.")
