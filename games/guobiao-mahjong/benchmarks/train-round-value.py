from episode_io import load as load_episodes
"""Fit a frozen round value on historical training/calibration walls; never evaluation games."""
import argparse, hashlib, importlib.util, json
from pathlib import Path
spec = importlib.util.spec_from_file_location('round_values', Path(__file__).with_name('round_values.py')); rv = importlib.util.module_from_spec(spec); spec.loader.exec_module(rv)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--episodes', nargs='+', required=True); ap.add_argument('--output', required=True); args = ap.parse_args(); inputs = [Path(p) for p in args.episodes]; games = [g for p in inputs for g in load_episodes(p)]
    model, report = rv.fit(games); out = Path(args.output); out.mkdir(parents=True, exist_ok=True)
    (out/'model.json').write_text(json.dumps(model, separators=(',', ':'), allow_nan=False)+'\n')
    report = {'schemaVersion': 1, 'status': 'passed', 'modelSha256': sha(out/'model.json'), 'inputs': {str(p): sha(p) for p in inputs}, 'sourceSha256': sha(Path(rv.__file__)), 'featureNames': rv.FEATURE_NAMES, 'hiddenInputs': False, **report, 'limitations': ['Frozen approximate round value can introduce bootstrap bias', 'Calibration loss and return variance are not playing-strength evidence']}
    (out/'report.json').write_text(json.dumps(report, indent=2)+'\n'); (out/'round_values.py').write_bytes(Path(rv.__file__).read_bytes()); print(json.dumps(report, indent=2))
if __name__ == '__main__': main()
