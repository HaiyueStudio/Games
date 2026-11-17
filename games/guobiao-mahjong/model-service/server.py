"""Shared HTTP contract for interchangeable local Mahjong policy models."""
import os
# Small convolutions run faster and more predictably without oversubscribed BLAS threads.
for name in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'VECLIB_MAXIMUM_THREADS'):
    os.environ.setdefault(name, '1')
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import urlsplit
from runtime import ModelRuntime

ROOT = Path(__file__).resolve().parent

def create_server(host, port, weights):
    runtime = ModelRuntime(weights)
    class Handler(BaseHTTPRequestHandler):
        def origin_allowed(self):
            origin = self.headers.get('Origin')
            if not origin: return True
            parsed = urlsplit(origin)
            return parsed.scheme in ('http', 'https') and parsed.hostname in ('localhost', '127.0.0.1', '::1')
        def reply(self, status, value):
            body = json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8')
            self.send_response(status)
            if self.origin_allowed() and self.headers.get('Origin'):
                self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
                self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        def do_OPTIONS(self):
            self.reply(204 if self.origin_allowed() else 403, {})
        def do_GET(self):
            if not self.origin_allowed(): return self.reply(403, {'error': 'Local origins only'})
            path = urlsplit(self.path).path
            if path == '/health': return self.reply(200, {'status': 'ready', 'protocol': 'haiyue.mcr/1', 'models': runtime.catalog()})
            if path == '/models': return self.reply(200, {'protocol': 'haiyue.mcr/1', 'models': runtime.catalog()})
            self.reply(404, {'error': 'Unknown route'})
        def do_POST(self):
            if not self.origin_allowed(): return self.reply(403, {'error': 'Local origins only'})
            path = urlsplit(self.path).path
            if not path.startswith('/agent/'): return self.reply(404, {'error': 'Unknown route'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 2_000_000: raise ValueError('Request size must be 1..2000000 bytes')
                self.connection.settimeout(30)
                request = json.loads(self.rfile.read(length))
                result = runtime.decide(path.removeprefix('/agent/'), request)
                self.reply(200, result)
            except KeyError as error: self.reply(404, {'error': str(error)})
            except (ValueError, TypeError) as error: self.reply(400, {'error': str(error)})
            except FileNotFoundError as error: self.reply(503, {'error': str(error)})
            except Exception as error: self.reply(500, {'error': type(error).__name__ + ': ' + str(error)})
    return ThreadingHTTPServer((host, port), Handler)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8787)
    parser.add_argument('--weights', type=Path, default=Path(os.environ.get('MAHJONG_WEIGHTS', ROOT / 'weights')))
    args = parser.parse_args()
    server = create_server(args.host, args.port, args.weights)
    print(f'Mahjong models listening on http://{args.host}:{server.server_port}', flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
