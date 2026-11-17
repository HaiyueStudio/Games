"""Hash-checked shard manifests keep complete trajectories out of giant duplicated JSON arrays."""
import hashlib,json
from pathlib import Path

def load(path):
    path=Path(path); data=json.loads(path.read_text())
    if isinstance(data,list): return data
    assert data['format']=='haiyue.episode-shards/1'
    episodes=[]
    for shard in data['shards']:
        p=path.parent/shard['path']; assert hashlib.sha256(p.read_bytes()).hexdigest()==shard['sha256']; episodes.append(json.loads(p.read_text()))
    assert len({(g['seed'],g['rotation']) for g in episodes})==len(episodes)
    return episodes
