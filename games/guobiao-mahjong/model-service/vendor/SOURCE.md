The two Python files are unchanged copies of `champion/numpy_resfused.py` and
`champion/feature.py` (the latter named `feature_reference.py` locally), from:

https://huggingface.co/Dannibal/ijcai-mahjong-ckpts-2026/tree/5670a37c87890ffe95ea0cc0431cb1c704ec8564/champion

The model repository declares MIT. The original model card and its license
metadata are preserved in MODEL_CARD.md; SHA-256 digests are in models.lock.json.
The linked GitHub repository returned 404 when checked on 2026-11-06; inference
code and weights remain downloadable from this explicitly MIT model repository.

Only `numpy_resfused.py` is executed by the service. `adapter.py` implements the
38-channel layout and 235-action encoding independently using Haiyue's visible
observation. It refreshes public history/meld channels on each request. The
reference agent refreshed them only when its own hand changed; that difference
can affect playing strength. Legal masks always come from the Haiyue referee,
including the eight-fan minimum, flowers, robbing kongs and exhaustion rules.
No Botzone fan-calculator dependency or its separate-wall exhaustion convention
is used. Published upstream strength numbers have not been reproduced here.
