"""Start an isolated, persistent local playground API on port 8002."""
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.preview_settings'

if __name__ == '__main__':
    import django
    django.setup()
    from django.core.management import call_command
    call_command('migrate', interactive=False, verbosity=0)
    call_command('seed_preview')
    import uvicorn
    uvicorn.run('config.asgi:application', host='127.0.0.1', port=8002, access_log=False)
