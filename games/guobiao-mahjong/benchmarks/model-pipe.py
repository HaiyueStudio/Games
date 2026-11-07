"""Persistent, local-only benchmark transport for the unchanged production KD runtime."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'model-service'))
from runtime import ModelRuntime

runtime = ModelRuntime(Path(__file__).resolve().parents[1] / 'model-service' / 'weights')
for line in sys.stdin:
    request = json.loads(line)
    try:
        if request.get('kind') == 'prepare':
            for index in request['members']:
                runtime.load(index)
            response = {'requestId': request['requestId'], 'ready': True,
                        'weightsRevision': runtime.lockfile['revision']}
        else:
            response = runtime.decide(request['model'], request)
    except Exception as error:
        response = {'requestId': request.get('requestId'), 'error': str(error)}
    print(json.dumps(response, ensure_ascii=False, allow_nan=False), flush=True)
