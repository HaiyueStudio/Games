---
license: mit
tags:
  - mahjong
  - imitation-learning
  - knowledge-distillation
  - game-ai
  - ijcai-2026
---

# IJCAI-2026 MCR Mahjong — Champion & Campaign Checkpoints

Model checkpoints from the IJCAI-2026 MCR (Mahjong Competition Rules) campaign.
The competition entry is **kdens3**: a 3×KD-student mean-softmax ensemble.
Code: https://github.com/SuuTTT/IJCAI-mahjong  (see `MANIFEST.md` there).

## Contents

### `champion/` — the DEPLOYED entry (kdens3)
- `kdens_s{0,1,2}_fp16.npz` — three distilled students. **fp16 storage, fp32 compute, numpy-only** (no torch at inference).
- `numpy_resfused.py`, `feature.py` — the inference stack used in the botzone bot.
- Load: build features with `feature.py`, run each `kdens_s*` via `numpy_resfused.py`, mean the softmaxes over the 3 students, argmax over legal moves.
- Metric: **2.5054 placement-pts vs aug_s0 baseline** (ci_lo 2.5012; replicated 2.5057 / 2.5018) over ~200k paired identical-wall games. Sim-11: official **2nd of 25**.

### `ckpt/kd/` — KD students (source of the ensemble)
- `kd_128x40_s{0..5}.pkl` + `.bn.pkl` — 128-wide × 40-block resnet students distilled from the aug teacher pool. `.bn.pkl` holds batchnorm running stats (needed for inference).

### `ckpt/aug/` — augmented BC baselines
- `aug_128x40_s{0..13}.pkl` + `.bn.pkl`. `aug_s0` is the fixed A/B comparison anchor for every gate.

### `ckpt/value/` — value critic ensemble
- `VALUE_C_60K.pt`, `VALUE_C_60K_s{1..7}.pt`, `value_e2e_ckpt.pt`. Used in the E14 value-guidance study (genuine null result).

### `ckpt/placeval/` — placement + value heads
- `placeval_s{0,1,2}.pt`.

### `ckpt/oppbelief/` — opponent-belief models
- `oppbelief_s{0..5}.pt`, `oppbelief_more60k_s{20,21,22}.pt` (60k-step), `oppbelief_big_s{10,11}.pt`. `.traininfo.json` sidecars record hyperparameters.

### `ckpt/dealin/`, `ckpt/dealin_pc/`, `ckpt/dealin_pc_v2/` — deal-in predictors
- v1, pointcloud (pc), and pc_v2 deal-in probability nets used for the coherent-fold defense study.

### `ckpt/kdcurve/`, `ckpt/kd10/`, `ckpt/paperx/`, `ckpt/danger/` — ablation nets
- Teacher-count curve (`kd1t/kd2t/kd4t`), 10-teacher variant, paper ablations (a03/a09/half/quarter), danger/field-clone defense nets.

### `rl_league/<L>/latest.msgpack` — representative RL league policies
- Final policies from selected league runs (Suphx-style GRP + oracle critic). Opponent `pool.pkl` files (~1.1G each) are **not** stored — regenerate during league training.

## Training data
Corpora: `Dannibal/ijcai-mahjong-corpora-2026`. Eval testset: `Dannibal/mcr-final2026-testset`.
