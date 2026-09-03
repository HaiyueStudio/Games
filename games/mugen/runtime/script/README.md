# G08-B/C minimal CMD/CNS and combat profile

G08-B is an opt-in executable profile. The animation viewer keeps `scriptProfile: none`; a game import must request `scriptProfile: g08-minimal`. This prevents a character with unsupported script features from being presented as playable while still allowing its AIR actions to be inspected.

## CMD allowlist

- `[Defaults]`: `command.time` (1–60), `command.buffer.time` (1–30). Per-command `time` also accepts the official legacy value `0`.
- `[Remap]`: identity mappings only. Disabled or non-identity remaps fail with `E_MUGEN_UNSUPPORTED_FEATURE`.
- `[Command]`: `name`, `command`, optional `time` and `buffer.time`.
- Directions `B/DB/D/DF/F/UF/U/UB` plus legacy diagonal spellings `BD/FD/FU/BU`, buttons `a/b/c/x/y/z/s`, comma sequences, simultaneous `+`, hold `/`, release/charge `~N`, four-way `$`, and no-other-input `>`.
- Command names are matched case-insensitively according to the frozen M08 census. Duplicate names are alternatives; the runtime reports each active folded name once.
- A command must complete inside its `time` window. Official `time=0` still permits a one-step command on the current input edge, but supplies no earlier tick for a multi-step sequence. Completed commands remain active for `buffer.time`; hold-only commands are valid only on the current tick.
- CPU command activation and physical controls converge in the same tick snapshot. The deterministic legacy AI source sets `AILevel` and asserts command names; the matcher applies the same command buffer and the script runtime performs all state/controller decisions.

## CNS allowlist

- `StateDef -1` and non-negative `StateDef` sections. States `-2/-3`, custom-state ordering and full common-state semantics are deferred to M09 and fail import.
- StateDef fields: `type`, `movetype`, `physics`, `anim`, `velset`, `ctrl`.
- Controllers: `ChangeState`, `ChangeAnim`, `VelSet`, `VelAdd`, `VelMul`, `PosSet`, `PosAdd`, `CtrlSet`, `StateTypeSet`, `VarSet`, `VarAdd`, `HitDef`, `LifeAdd/Set`, `PowerAdd/Set`, `MoveHitReset`, `Gravity`, `Null`.
- Controller gates: repeated `triggerall` values are AND; expressions in one `triggerN` group are AND; numbered groups are OR. `persistent=0` executes at state time zero, otherwise a positive value is a tick modulus. `ignorehitpause=1` permits only that controller to execute while authoritative hit pause is active.
- Expressions: finite float32 numbers, booleans, state/move/physics literals, parentheses, unary `+/-/!`, arithmetic, comparisons, `&&/||`, `Command =/!= "name"`, `Var(n)` and `FVar(n)`.
- References: `Alive`, `Anim`, `AnimElem`, `AnimElemTime(n)`, `AnimTime`, `Command`, `Ctrl`, `Facing`, `HitCount`, `HitPauseTime`, `HitShakeOver`, `HitVel X/Y`, `InGuardDist`, `Life/LifeMax`, `MoveContact/MoveGuarded/MoveHit`, `MoveType`, `P2Dist X/Y`, `Pos X/Y`, `Power/PowerMax`, `RoundNo/RoundState`, `StateNo/StateType`, `Time`, `Vel X/Y`.

## G08-C HitDef and collision subset

- `HitDef`: `attr`, `damage`, `hitflag`, `guardflag`, `ground.type`, hit/guard pause, ground/air/guard stun time, ground/air/guard velocity, `getpower`, `givepower`, `kill`, and `guard.kill`. Every value is compiled to typed IR; unknown fields fail import.
- AIR is the only authoritative collision source. `Clsn1` is an attack box and `Clsn2` is a push/defense box. Box2D, sprite pixels and renderer bounds do not participate.
- One HitDef activation can contact each target once. Both fighters' contacts are collected before mutations, so trades and double KO are independent of P1/P2 resolution order.
- Holding facing-relative back guards only when the defender state matches `guardflag`. Guard applies chip damage, guard pause, power and guard stun; an empty `guardflag` is explicitly unguardable.
- Hit pause freezes state/action time, round timer, physics and position integration. Hit and guard recovery return the G08-C fixture to configured neutral state/action; later M09 common-state work owns full MUGEN recovery behavior.
- Push is deterministic, uses stable fighter slot order for exact ties, redistributes at stage bounds and never changes fighter identity.
- KO is decided after simultaneous damage. Single KO awards the survivor after a configured integer hold; double KO is a draw round.

State entry applies StateDef metadata, animation, velocity and control once. State `-1` dispatch runs before the current state. A successful `ChangeState` stops the old controller list; the target state's controllers begin on the next tick. X velocity and relative `PosAdd X` follow facing. `physics=A` applies deterministic gravity; `S/C` apply configured friction. The VM has fixed command, controller, expression-depth and per-tick evaluation budgets.

## Explicitly not in G08-C

Throws, reversal, hit override, custom states, juggle/fall/bounce, attack distance overrides, armor, helpers/projectiles/explods, state `-2/-3`, trigger redirection, non-identity remapping and all unlisted fields/controllers/triggers are rejected rather than ignored. `PlaySnd`/`StopSnd` and HUD/browser wiring remain separate G08-D integration work over the existing G06 audio slice. Full official KFM script compatibility belongs to M09.

## M09 parity extensions

The paragraph above describes the frozen historical G08-C profile. M09 now layers native throw/custom-state combat plus a deterministic entity authority over it. Helper, Projectile and Explod controllers compile into staged entity commands; helpers execute their own state machines and redirections; projectile AIR boxes participate in contact; and Explod actors render in stable below/above layers. Unsupported M09 behavior still fails closed. See the M09 G05 goal for the live closure list rather than treating the G08-C exclusions as the current runtime capability list.
