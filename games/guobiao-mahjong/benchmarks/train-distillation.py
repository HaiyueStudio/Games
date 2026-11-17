"""Offline-only larger critic -> FP16 compact student. Neither teacher nor optimizer ships to the browser."""
import argparse
import base64
import hashlib
import importlib.util
import json
import math
import time
from pathlib import Path
import numpy as np

spec = importlib.util.spec_from_file_location('value_trainer', Path(__file__).with_name('train-values.py'))
core = importlib.util.module_from_spec(spec); spec.loader.exec_module(core)
digest = core.digest
def write(path, data): path.write_text(json.dumps(data, separators=(',', ':'), allow_nan=False)+'\n')
def checksum(data):
    result = 0x811c9dc5
    for b in data: result = ((result ^ b) * 0x01000193) & 0xffffffff
    return result
def forward(x, params): return core.forward(x, params)
def q(pred): return pred[:, 0]-pred[:, 1]
def value_loss(pred, target, indices):
    pair = []
    for ids in indices:
        delta = q(pred[ids])-q(target[ids]); pair.extend((delta-delta.mean())**2)
    all_ids = np.concatenate(indices)
    return float(np.mean((pred[all_ids, :2]-target[all_ids, :2])**2)+np.mean(pair))
def policies(pred, indices, logs, temperature):
    results = []
    for ids in indices:
        z = (q(pred[ids])+logs[ids])/temperature; z -= z.max(); prob = np.exp(z); prob /= prob.sum(); results.append(prob)
    return results
def kl_value(student, teacher): return float(np.mean([np.sum(t*(np.log(np.maximum(t, 1e-15))-np.log(np.maximum(s, 1e-15)))) for s, t in zip(student, teacher)]))

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('data'); parser.add_argument('--output', required=True); parser.add_argument('--config', default=str(Path(__file__).with_name('distillation-config.json'))); args = parser.parse_args()
    directory = Path(args.data); out = Path(args.output); out.mkdir(parents=True, exist_ok=True); config = json.loads(Path(args.config).read_text()); report = json.loads((directory/'report.json').read_text())
    assert config['schemaVersion'] == 1 and config['members'] == 3 and config['teacherHidden'] > 64 and 1 <= config['studentHidden'] <= 32
    assert digest(directory/'groups.json') == report['groupsSha256']; archive = json.loads((directory/'source/manifest.json').read_text()); assert archive['datasetReportSha256'] == digest(directory/'report.json')
    for name, sha in report['fingerprints'].items(): assert digest(directory/'source'/name) == sha
    groups = json.loads((directory/'groups.json').read_text()); raw = []; targets = []; membership = []; action_types = []; logs = []
    for i, g in enumerate(groups):
        supported = [r for r in g['rows'] if g['prior'][r['plan']['index']] >= config['settings']['minimumPrior']]
        assert supported
        for r in g['rows']:
            raw.append(r['features']); membership.append(i); action_types.append(r['plan']['action']['type']); values = []
            for outcome in r['outcomes']: values.append([outcome['fans'][0]/32, sum(outcome['fans'][1:])/96, float(outcome['winner'] == 0), float(outcome['winner'] is not None and not outcome['selfDrawn'] and outcome['from'] == 0)])
            targets.append(np.mean(values, axis=0)); prior = g['prior'][r['plan']['index']]; logs.append(config['settings']['priorWeight']*math.log(max(1e-12, prior)) if prior >= config['settings']['minimumPrior'] else -1e6)
    raw = np.asarray(raw); y = np.asarray(targets); logs = np.asarray(logs); membership = np.asarray(membership); width = len(report['featureNames']); assert raw.shape[1] == width and np.isfinite(raw).all()
    indices = [np.flatnonzero(membership == i) for i in range(len(groups))]; folds = {f: [indices[i] for i, g in enumerate(groups) if g['fold'] == f] for f in report['config']['folds']}
    seeds = report['config']['folds']; assert all(not set(a)&set(b) for i, a in enumerate(seeds.values()) for b in list(seeds.values())[i+1:])
    train_ids = np.concatenate(folds['train']); mean = raw[train_ids].mean(0); scale = np.maximum(raw[train_ids].std(0), .05); x = core.normalize(raw, mean, scale); rng = np.random.default_rng(config['seed'])
    teachers = []; students = []; histories = []; bootstraps = []
    def fit(hidden, member, teacher=None):
        params = [rng.normal(0, .05, (width, hidden)), np.zeros(hidden), rng.normal(0, .02, (hidden, 4)), np.array([-2., -3., -2., -2.])]
        opt = core.Adam(params); target = y if teacher is None else (1-config['teacherWeight'])*y+config['teacherWeight']*teacher
        counts = bootstraps[member]; train_groups = [i for i, g in enumerate(groups) if g['fold'] == 'train' for _ in range(counts[g['seed']])]
        best = None; best_loss = float('inf'); history = []; stale = 0; epochs = config['teacherEpochs'] if teacher is None else config['studentEpochs']; patience = config['teacherPatience'] if teacher is None else config['studentPatience']
        for epoch in range(epochs):
            shuffled = rng.permutation(train_groups)
            for batch in np.array_split(shuffled, math.ceil(len(shuffled)/32)):
                ids = np.concatenate([indices[i] for i in batch]); pred, z, h = forward(x[ids], params); dz = np.zeros_like(z)
                dz[:, :2] = (pred[:, :2]-target[ids, :2])*core.sigmoid(z[:, :2])/len(ids); dz[:, 2:] = .08*(pred[:, 2:]-target[ids, 2:])/len(ids)
                at = 0
                for i in batch:
                    n = len(indices[i]); sl = slice(at, at+n); local = ids[sl]; delta = q(pred[sl])-q(target[local]); delta -= delta.mean()
                    dq = 2*delta/len(ids)
                    if teacher is not None:
                        sp = policies(pred[sl], [np.arange(n)], logs[local], config['temperature'])[0]; tp = policies(teacher[local], [np.arange(n)], logs[local], config['temperature'])[0]
                        dq += config['policyWeight']*config['temperature']*(sp-tp)/len(batch)
                    dz[sl, 0] += dq*core.sigmoid(z[sl, 0]); dz[sl, 1] -= dq*core.sigmoid(z[sl, 1]); at += n
                opt.update(params, core.gradient(x[ids], h, dz, params))
            pred = forward(x, params)[0]; score = value_loss(pred, target, folds['calibration'])
            if teacher is not None: score += config['policyWeight']*config['temperature']**2*kl_value(policies(pred, folds['calibration'], logs, config['temperature']), policies(teacher, folds['calibration'], logs, config['temperature']))
            history.append(score)
            if score < best_loss-1e-7: best_loss = score; best = [p.copy() for p in params]; stale = 0
            else: stale += 1
            if stale >= patience: break
        print(json.dumps({'stage': 'teacher' if teacher is None else 'student', 'member': member, 'bestEpoch': int(np.argmin(history))+1, 'epochs': len(history), 'calibrationLoss': best_loss}), flush=True)
        histories.append({'stage': 'teacher' if teacher is None else 'student', 'member': member, 'loss': history}); return best
    for member in range(config['members']):
        boot = rng.choice(seeds['train'], len(seeds['train']), replace=True); bootstraps.append({s: int(np.sum(boot == s)) for s in seeds['train']}); teachers.append(fit(config['teacherHidden'], member))
    teacher_predictions = [forward(x, p)[0] for p in teachers]
    for member in range(config['members']): students.append(fit(config['studentHidden'], member, teacher_predictions[member]))
    # Actual deployment values: shared FP32 normalization, FP16 weights, evaluated after round-trip.
    runtime_mean = mean.astype('<f4').astype(np.float64); runtime_scale = scale.astype('<f4').astype(np.float64); quantized = [[v.astype('<f2').astype(np.float64) for v in p] for p in students]
    sx = core.normalize(raw, runtime_mean, runtime_scale); teacher_pred = np.mean(teacher_predictions, axis=0); student_members = [forward(sx, p)[0] for p in quantized]; student_pred = np.mean(student_members, axis=0); metrics = {}
    for fold, rows in folds.items():
        all_ids = np.concatenate(rows); tp = policies(teacher_pred, rows, logs, config['temperature']); sp = policies(student_pred, rows, logs, config['temperature']); regret = []; agreement = []
        for ids in rows:
            tq = q(teacher_pred[ids])+logs[ids]; sq = q(student_pred[ids])+logs[ids]; chosen = int(np.argmax(sq)); regret.append(float(tq.max()-tq[chosen])); agreement.append(int(np.argmax(tq)) == chosen)
        metrics[fold] = {'groups': len(rows), 'plans': len(all_ids), 'teacherLoss': value_loss(teacher_pred, y, rows), 'studentLoss': value_loss(student_pred, y, rows), 'teacherQrmse': float(np.sqrt(np.mean((q(student_pred[all_ids])-q(teacher_pred[all_ids]))**2))), 'policyKL': kl_value(sp, tp), 'planAgreement': float(np.mean(agreement)), 'teacherRegretFan': float(np.mean(regret)*32), 'ownFanMAE': float(np.mean(np.abs(student_pred[all_ids, 0]-y[all_ids, 0]))*32)}
    model_base = dict(schemaVersion=1, featureVersion=report['featureVersion'], featureNames=report['featureNames'], settings=config['settings'], fanScale=32, objective='expected own fan minus mean opponents fan, current hand')
    teacher_model = dict(model_base, networks=[core.packed(p, mean, scale) for p in teachers]); student_model = dict(model_base, networks=[core.packed(p, runtime_mean, runtime_scale) for p in quantized])
    write(out/'teacher.json', dict(teacher_model, role='offline-only-teacher')); write(out/'student.json', student_model)
    # Keep the exact pre-quantization student for controlled playing-strength ablations.
    # Its normalization is already FP32, isolating weight quantization from normalization changes.
    full_precision = [[v.astype('<f4').astype(np.float64) for v in p] for p in students]
    write(out/'student-fp32.json', dict(model_base, networks=[core.packed(p, runtime_mean, runtime_scale) for p in full_precision]))
    sources = out/'source/benchmarks'; sources.mkdir(parents=True, exist_ok=True)
    for source in [Path(__file__), Path(__file__).with_name('train-values.py'), Path(args.config)]:
        (sources/source.name).write_bytes(source.read_bytes())
    payload = mean.astype('<f4').tobytes()+scale.astype('<f4').tobytes()+b''.join(v.astype('<f2').tobytes() for p in students for v in p)
    packed = {k: v for k, v in model_base.items()}; packed.update(format='haiyue.value-fp16/1', hidden=config['studentHidden'], members=3, payload=base64.b64encode(payload).decode(), byteLength=len(payload), checksum=checksum(payload), payloadSha256=hashlib.sha256(payload).hexdigest()); write(out/'packed.json', packed)
    cal = metrics['calibration']; gates = config['gates']; passed = cal['teacherQrmse'] <= gates['maximumCalibrationQrmse'] and cal['policyKL'] <= gates['maximumCalibrationKL'] and cal['teacherRegretFan'] <= gates['maximumTeacherRegretFan'] and cal['studentLoss'] <= cal['teacherLoss']*gates['maximumCalibrationLossRatio']
    fixture = []
    for action_type in ['discard', 'pass', 'chow', 'pung', 'kong', 'concealed-kong', 'add-kong']:
        candidates = [i for i, t in enumerate(action_types) if t == action_type and groups[membership[i]]['fold'] == 'test']
        assert candidates
        for i in candidates[:2]: fixture.append({'actionType': action_type, 'features': raw[i].tolist(), 'predictions': [v[i].tolist() for v in student_members]})
    write(out/'parity.json', {'schemaVersion': 1, 'rows': fixture})
    result = dict(schemaVersion=1, generatedAt=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), status='passed' if passed else 'rejected', config=config, configSha256=digest(Path(args.config)), dataReportSha256=digest(directory/'report.json'), groupsSha256=report['groupsSha256'], sourceArchiveSha256=digest(directory/'source/manifest.json'), trainerSha256=digest(Path(__file__)), helperSha256=digest(Path(__file__).with_name('train-values.py')), teacherSha256=digest(out/'teacher.json'), studentSha256=digest(out/'student.json'), packedSha256=digest(out/'packed.json'), payloadSha256=packed['payloadSha256'], paritySha256=digest(out/'parity.json'), folds=seeds, metrics=metrics, teacherParameters=sum(v.size for p in teachers for v in p), studentParameters=sum(v.size for p in students for v in p), runtimePayloadBytes=len(payload), history=histories, limitations=report['limitations']+['Distillation fidelity is not independent evidence of playing strength', 'KD Student 0 policy backbone is unchanged; this compresses only the added value heads'])
    result['studentFp32Sha256'] = digest(out/'student-fp32.json')
    write(out/'training-report.json', result); print(json.dumps({'status': result['status'], 'teacherParameters': result['teacherParameters'], 'studentParameters': result['studentParameters'], 'runtimePayloadBytes': len(payload), 'metrics': metrics}, indent=2), flush=True)
    if not passed: raise SystemExit('Calibration distillation gates rejected this student')
if __name__ == '__main__': main()
