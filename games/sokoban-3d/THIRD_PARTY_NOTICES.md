# Third-party notices

## Google DeepMind Boxoban level data

Sokoban 3D levels 3–10 redistribute ASCII maps 0–7 from
`medium/valid/003.txt`. Levels 11–16 redistribute maps 0–5 from
`hard/000.txt`.

- Project: https://github.com/google-deepmind/boxoban-levels
- Medium source: https://github.com/google-deepmind/boxoban-levels/blob/master/medium/valid/003.txt
- Hard source: https://github.com/google-deepmind/boxoban-levels/blob/master/hard/000.txt
- License: Apache License 2.0 — https://github.com/google-deepmind/boxoban-levels/blob/master/LICENSE

The ASCII maps are unchanged. HaiYue adds display names, difficulty labels,
source metadata, rendering, controls, persistence, and level-selection UI.

## Sasquatch III — David W. Skinner

Levels 17–66 reproduce the **complete 50-level Sasquatch III collection**,
released June 2000, in its original order. Author: **David W. Skinner**,
**sasquatch@bentonrea.com**.

- Author's page (preserved mirror): https://www.onlinespiele-sammlung.de/sokoban/sokobangames/skinner/
- Original collection file: https://www.onlinespiele-sammlung.de/sokoban/sokobangames/skinner/s3.txt
- Original author site: http://users.bentonrea.com/~sasquatch/sokoban/
- Redistribution permission on the author's page: "These sets may be freely distributed provided they remain properly credited."
- Unmodified source: `assets/levels/sasquatch-iii.txt`
- SHA-256: `f975a40b00ba1fdf355f81521c7447ef40cf9395fa0f6858e00060c44d24e96f`

The original map rows, including exterior spaces, are preserved unchanged.
The game distinguishes exterior void from enclosed playable floor at runtime.
Display names, 3D presentation and difficulty-group labels are added by Haiyue.
The author's description rates the collection from medium to very hard.

The temporary Warehouse Workshop levels have been replaced. The original
sixteen levels retain their indices. Save version 3 preserves their completion
records from version 2 and resets replaced workshop boards and their records.
