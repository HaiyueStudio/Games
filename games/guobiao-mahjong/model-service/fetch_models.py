"""Download only the three public deployment weights, pinned and SHA-256 verified."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parent

def fetch_all(directory):
    lock = json.loads((ROOT / 'models.lock.json').read_text())
    directory.mkdir(parents=True, exist_ok=True)
    def fetch(item):
        target = directory / item['name']
        def valid(path):
            return path.exists() and path.stat().st_size == item['size'] and hashlib.sha256(path.read_bytes()).hexdigest() == item['sha256']
        if valid(target):
            print('Verified', item['name'], flush=True)
            return
        url = 'https://huggingface.co/{}/resolve/{}/{}'.format(lock['repository'], lock['revision'], item['path'])
        temporary = target.with_suffix('.download')
        try:
            with urllib.request.urlopen(url, timeout=120) as source, temporary.open('wb') as out:
                while True:
                    chunk = source.read(1024 * 1024)
                    if not chunk: break
                    out.write(chunk)
            if not valid(temporary): raise ValueError('Checksum mismatch: ' + item['name'])
            temporary.replace(target)
            print('Downloaded and verified', item['name'], flush=True)
        finally:
            temporary.unlink(missing_ok=True)
    with ThreadPoolExecutor(max_workers=3) as executor:
        list(executor.map(fetch, lock['files']))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', type=Path, default=ROOT / 'weights')
    fetch_all(parser.parse_args().directory)
