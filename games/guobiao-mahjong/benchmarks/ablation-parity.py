"""Independent NumPy outputs for the exact frozen teacher, FP32 and FP16 evaluation assets."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def predict(features, model):
    result = []
    for n in model['networks']:
        x = np.clip((features-np.asarray(n['mean']))/np.asarray(n['scale']), -5, 5)
        hidden = np.maximum(0, x@np.asarray(n['w1'])+np.asarray(n['b1']))
        z = hidden@np.asarray(n['w2'])+np.asarray(n['b2'])
        result.append(np.concatenate([np.logaddexp(0, z[:2]), 1/(1+np.exp(-np.clip(z[2:], -40, 40)))]).tolist())
    return result

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('output'); parser.add_argument('--data', default='artifacts/guobiao-mahjong/value/data-v2'); args = parser.parse_args()
    out = Path(args.output); data = Path(args.data); dataset = json.loads((data/'report.json').read_text()); assert digest(data/'groups.json') == dataset['groupsSha256']
    paths = {'teacher': out/'heads/teacher.json', 'fp32': out/'heads/student-fp32.json', 'fp16': out/'heads/student.json'}
    models = {name: json.loads(path.read_text()) for name, path in paths.items()}
    for n in models['fp32']['networks']:
        for key in ['mean', 'scale', 'w1', 'b1', 'w2', 'b2']:
            values = np.asarray(n[key]); assert np.array_equal(values, values.astype(np.float32).astype(np.float64)), key+' is not FP32'
    double_rounding = 0; maximum_rounding_difference = 0.0
    for full, half in zip(models['fp32']['networks'], models['fp16']['networks']):
        for key in ['w1', 'b1', 'w2', 'b2']:
            # Training uses FP64 and exports FP32 and FP16 independently. At a rare
            # FP16 midpoint, first rounding to FP32 can change the FP16 tie result.
            x = np.asarray(full[key]); h = np.asarray(half[key]); f32 = x.astype(np.float32)
            direct = f32.astype(np.float16).astype(np.float64)
            lo = (x+np.nextafter(f32, np.float32(-np.inf)).astype(np.float64))/2
            hi = (x+np.nextafter(f32, np.float32(np.inf)).astype(np.float64))/2
            assert np.all((h == direct) | (h == lo.astype(np.float16).astype(np.float64)) | (h == hi.astype(np.float16).astype(np.float64))), key+' is inconsistent with the FP32 rounding cell'
            double_rounding += int(np.sum(h != direct)); maximum_rounding_difference = max(maximum_rounding_difference, float(np.max(np.abs(h-direct))))
    rows = []; groups = json.loads((data/'groups.json').read_text())
    for kind in ['discard', 'pass', 'chow', 'pung', 'kong', 'concealed-kong', 'add-kong']:
        candidates = [r for g in groups if g['fold'] == 'test' for r in g['rows'] if r['plan']['action']['type'] == kind]; assert candidates
        for row in candidates[:2]:
            features = np.asarray(row['features']); rows.append({'actionType': kind, 'features': features.tolist(), 'predictions': {name: predict(features, m) for name, m in models.items()}})
    fixture = {'schemaVersion': 1, 'models': {name: digest(path) for name, path in paths.items()}, 'rows': rows}
    (out/'head-parity.json').write_text(json.dumps(fixture, separators=(',', ':'), allow_nan=False)+'\n')
    report = {'schemaVersion': 1, 'status': 'passed', 'numpy': np.__version__, 'sourceSha256': digest(Path(__file__)), 'datasetSha256': digest(data/'groups.json'), 'fixtureSha256': digest(out/'head-parity.json'), 'models': fixture['models'], 'checks': ['FP32 weights representable exactly', 'FP16 values consistent with the FP32 rounding cells', 'all seven action families'], 'doubleRoundingValues': double_rounding, 'maximumDoubleRoundingDifference': maximum_rounding_difference, 'quantizationPath': 'Training FP64 weights are separately rounded to FP32 and FP16, with shared FP32 normalization', 'rows': len(rows)}
    (out/'parity-source.py').write_bytes(Path(__file__).read_bytes()); (out/'head-parity-report.json').write_text(json.dumps(report, indent=2)+'\n'); print(json.dumps(report, indent=2))

if __name__ == '__main__': main()
