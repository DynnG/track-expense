"""Exit nonzero on failure. Configure your hosting monitor to run this/check ready."""
import json
import os
import sys
import urllib.request

try:
    with urllib.request.urlopen(os.getenv('HEALTH_URL', 'http://127.0.0.1:8000/api/v1/health/ready'), timeout=10) as response:
        if response.status != 200 or json.load(response).get('status') != 'ready':
            raise RuntimeError('not_ready')
    print(json.dumps({'event': 'health_check', 'status': 'ready'}))
except Exception:
    print(json.dumps({'event': 'health_check', 'status': 'unavailable'}))
    sys.exit(1)
