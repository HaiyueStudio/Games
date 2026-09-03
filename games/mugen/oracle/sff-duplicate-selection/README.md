# MUGEN 1.1 SFF duplicate-key oracle

This local oracle resolves how official Windows MUGEN 1.1b1 selects two SFF v1 records with the same `(group,item)` key.

The Petra source SFF contains two distinct `9000,666` records: source index 3 and source index 1531. Three runs use the same AIR reference and placement:

1. `latest-official-result.*` uses the unmodified SFF.
2. `first-only-control.*` renumbers only source index 1531, leaving index 3 addressable as `9000,666`.
3. `last-only-control.*` renumbers only source index 3, leaving index 1531 addressable as `9000,666`.

The original run renders the same large crop as the last-only control, while the first-only control renders the distinct smaller image. The official rule is therefore **last SFF source record wins**. The runtime log in every JSON record also confirms that the SFF and AIR loaded successfully.

`selection-evidence.json` freezes source and screenshot hashes. The screenshots are visual evidence, not byte-equality claims: capture framing and window decoration differ between runs.
