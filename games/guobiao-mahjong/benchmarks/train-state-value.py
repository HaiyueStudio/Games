from episode_io import load as load_episodes
"""Fit and archive a decision critic from historical public trajectories before new capture."""
import argparse, hashlib, json
from pathlib import Path
import decision_values as dv
import round_values as rv

def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--episodes', nargs='+', required=True); ap.add_argument('--round-value', required=True); ap.add_argument('--output', required=True); args=ap.parse_args()
    inputs=[Path(p) for p in args.episodes]; model, report=dv.fit([g for p in inputs for g in load_episodes(p)], json.loads(Path(args.round_value).read_text()))
    model['roundValueSha256']=sha(args.round_value); out=Path(args.output); out.mkdir(parents=True, exist_ok=True); (out/'model.json').write_text(json.dumps(model, separators=(',', ':'), allow_nan=False)+'\n')
    report.update(schemaVersion=1,status='passed',modelSha256=sha(out/'model.json'),roundValueSha256=sha(args.round_value),inputs={str(p):sha(p) for p in inputs},sourceSha256=sha(dv.__file__),roundSourceSha256=sha(rv.__file__))
    (out/'report.json').write_text(json.dumps(report, indent=2)+'\n'); (out/'decision_values.py').write_bytes(Path(dv.__file__).read_bytes()); print(json.dumps(report, indent=2))
if __name__=='__main__': main()
