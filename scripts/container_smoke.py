"""Disposable localhost-only HTTPS, upload-worker and restart/persistence probes."""
import argparse
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import ssl
import tempfile
import time
import urllib.request
import urllib.error

# Only Caddy's disposable localhost internal certificate is exempted here.
context = ssl._create_unverified_context()
origin = "https://localhost:8443"
state_path = Path(tempfile.gettempdir()) / 'behtrest-container-smoke.json'
cookies = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPSHandler(context=context), urllib.request.HTTPCookieProcessor(cookies))
csrf = ''


def get(path, authenticated=True):
    req = urllib.request.Request(origin + path)
    return client.open(req, timeout=10) if authenticated else urllib.request.urlopen(req, context=context, timeout=10)


def post(path, data, content_type='application/json'):
    global csrf
    body = json.dumps(data).encode() if isinstance(data, dict) else data
    req = urllib.request.Request(origin + path, data=body, headers={'Content-Type': content_type, 'X-CSRFToken': csrf, 'Origin': origin})
    with client.open(req, timeout=15) as response:
        result = json.load(response)['data']
        csrf = result.get('csrfToken', csrf)
        return result


def upload(title):
    boundary = 'smoke' + secrets.token_hex(12)
    image = (Path(__file__).resolve().parents[1] / 'frontend/e2e/fixtures/blue.png').read_bytes()
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\n{title}\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="blue.png"\r\nContent-Type: image/png\r\n\r\n').encode() + image + f'\r\n--{boundary}--\r\n'.encode()
    pin = post('/api/posts/', body, f'multipart/form-data; boundary={boundary}')
    assert pin['moderation_status'] == 'pending'
    try:
        get(pin['image'], authenticated=False)
        raise AssertionError('Quarantine image was publicly accessible.')
    except urllib.error.HTTPError as error: assert error.code in [401, 404]
    return pin


def approved(pk):
    for _ in range(30):
        with get(f'/api/posts/{pk}/') as response: pin = json.load(response)['data']
        if pin['moderation_status'] == 'approved':
            with get(pin['image'], authenticated=False) as image:
                assert image.headers['Content-Type'].startswith('image/') and image.read()
            return pin
        time.sleep(1)
    raise AssertionError('Moderation worker did not approve the benign fixture within 30 seconds.')


parser = argparse.ArgumentParser()
parser.add_argument('--phase', choices=['initial', 'queue', 'restored'], default='initial')
phase = parser.parse_args().phase
with get('/api/ready/') as response: assert json.load(response)['data']['status'] == 'ready'
with get('/api/auth/session/') as response:
    csrf = json.load(response)['data']['csrfToken']
    assert any('csrftoken=' in cookie and 'Secure' in cookie and 'HttpOnly' in cookie for cookie in response.headers.get_all('Set-Cookie', []))

if phase == 'initial':
    with get('/login') as response:
        assert '<div id="root">' in response.read().decode()
        assert response.headers['X-Content-Type-Options'] == 'nosniff'
        assert "frame-ancestors 'none'" in response.headers['Content-Security-Policy']
    with get('/static/admin/css/base.css') as response: assert 'text/css' in response.headers['Content-Type']
    try:
        get('/api/does-not-exist/')
        raise AssertionError('Unknown API served the SPA.')
    except urllib.error.HTTPError as error:
        assert error.code == 404 and json.load(error)['error']['code'] == 'not_found'
    state = {'username': 'smoke_' + secrets.token_hex(8), 'password': secrets.token_urlsafe(32)}
    post('/api/auth/register/', {'username': state['username'], 'email': state['username'] + '@example.invalid', 'password1': state['password'], 'password2': state['password']})
    pin = approved(upload('Container persistence smoke')['id'])
    state['approved_id'] = pin['id']
    # Synthetic credentials exist only in this disposable runner's temp file.
    state_path.write_text(json.dumps(state), encoding='utf-8')
    os.chmod(state_path, 0o600)
else:
    state = json.loads(state_path.read_text(encoding='utf-8'))
    post('/api/auth/login/', {'username': state['username'], 'password': state['password']})
    if phase == 'queue':
        state['queued_id'] = upload('Restarted worker smoke')['id']
        state_path.write_text(json.dumps(state), encoding='utf-8')
    else:
        approved(state['approved_id'])
        approved(state['queued_id'])
        state_path.unlink()
print(f'Container smoke phase {phase} passed: HTTPS, private uploads and persistent worker processing.')
