"""Exercise the copied V1 API with synthetic accounts, without logging account data."""
import contextlib
import importlib.util
import io
import json
import logging
import os
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / ".local" / "legacy-runtime"


def main():
    os.chdir(TARGET)
    sys.path.insert(0, str(TARGET))
    logging.disable(logging.CRITICAL)
    spec = importlib.util.spec_from_file_location("legacy_app", TARGET / "app.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    client = module.app.test_client()
    results = {}
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        results["feed"] = client.get("/get_feed").status_code
        avatar = client.get("/get_image?id=default")
        results["default_avatar"] = {"status": avatar.status_code, "content_type": avatar.content_type}
        results["empty_profile_query"] = client.get("/profile").status_code
        username = "legacy_check_" + uuid.uuid4().hex[:10]
        password = "SyntheticLegacyCheck!42"
        registered = client.post("/register/user", json={"username": username, "password": password})
        results["registration"] = {"status": registered.status_code, "response": registered.get_json()}
        logged_in = client.post("/login", json={"username": username, "password": password})
        login_data = logged_in.get_json() or {}
        results["synthetic_login"] = {"status": logged_in.status_code, "authenticated": login_data.get("auth") == 1}
        profile = client.get(f"/profile?{login_data.get('user_id')}")
        profiles = profile.get_json()
        results["synthetic_profile"] = {"status": profile.status_code, "exists": isinstance(profiles, list) and bool(profiles)}
        results["registration_avatar_malformed"] = isinstance(profiles, list) and bool(profiles) and profiles[0]["pfp"].startswith("http://http://")
    (TARGET / "checks.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
