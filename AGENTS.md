# Mandate — instructions for coding agents

## Scope and product
- Mandate is a browser-based political/economic grand strategy (1700–2200). The eventual player controls a political actor through institutions, not an omnipotent state.
- Use Russian for user-facing reports unless asked otherwise. Keep reports short and concrete.
- The simulation must work independently of any LLM. Generated language must never become authoritative world state.

## Sources of truth
- Working code and tests are authority for what is implemented. `README.md` and `docs/` explain the current system; `ROADMAP/` contains designs, not necessarily implemented features.
- Read only documents relevant to the task. Do not perform a repo-wide audit or rewrite settled plans for a narrow implementation request.
- Do not confuse optional synthetic demonstrations with the production 1700 scenario.
- Useful entry points: `shared/simulation.cjs`, `shared/economy.cjs`, `shared/population.cjs`, `scripts/scenarios.cjs`, `client/map/`, `tests/`.
- For production/goods work, consult `ROADMAP/production-system-v1.md`, `ROADMAP/goods-registry-and-material-lifecycle.md` and relevant tests. For other work, consult only the matching roadmap/docs.

## Invariants: do not change incidentally
- Frozen map: `mandate-provinces-v1`, exactly 5,001 stable `province:XXXXX` IDs. Do not regenerate/modify geometry, adjacency, hashes, or migration data for unrelated tasks.
- Atomic ADM2 mesh is offline source/authoring data, not gameplay geography.
- Do not rescale/change HYDE population totals or authored composition, 1700 ownership, capitals, polities, or scenario assets as side effects.
- Preserve scenario v4, GameState v2, save envelope v2 and their compatibility/validation unless the task explicitly requests a versioned migration.
- `GameState` and portable `shared/` modules own simulation consequences. UI, overlays, sprites, events, and LLM outputs must not independently mutate authoritative simulation outcomes.

## Determinism and economy
- One in-game day per simulation tick. Monthly population/economy updates are implemented; weekly/quarterly/yearly systems are mostly designs, not an implemented dispatcher.
- Identical initial state, seed, commands and tick count must produce identical results regardless of playback speed.
- Preserve explicit execution order, validation-before-commit/transactional month boundary, save/load continuation and failure atomicity. No wall-clock inputs, uncontrolled randomness, or extra RNG draws.
- Keep cash, quantities, inventory book value and accounting deterministic using validated safe integers and BigInt intermediates where needed. Preserve cash/goods balance and overflow rejection.
- Market IDs are independent from province IDs. Enterprises own physical inventories; markets clear orders and do not own duplicate warehouses. Cross-market shipping and FX are not implemented.
- Production recipes are data-defined, currently with `inputs[]`, a single `output`, `workersPerBatch` and enterprise capacity. Do not add a hardcoded chain-depth limit or industry-specific simulation branches.
- New inputs purchased in a month are available for later production, not another production pass in the same month. Do not invent instant inter-market deliveries.
- The synthetic accounting unit is not a real historical currency. Real 1700 world economy has not been authored.

## Change discipline
- Prefer the smallest working vertical slice over speculative scaffolding or broad refactors. Follow existing style and validation conventions.
- Add new goods/recipes as data where possible; preserve compatibility for existing food-only scenarios and saves.
- Keep synthetic economics in test fixtures or clearly labeled opt-in demos, never silently publish invented global historical enterprises/prices into `scenarios/1700` or `modern`.
- Do not touch the paused separate LLM lab without explicit request.
- Do not commit, push, force-push, reset, or modify unrelated files unless explicitly asked.

## Verification and handoff
- For economy changes, run focused tests (notably `tests/economy.spec.cjs`, plus new tests). Use `npm run test:ci` when appropriate; full `npm test` may require ignored offline GIS inputs.
- Verify determinism, cash/goods conservation, inventory ownership, multi-month chains, failure atomicity, and save/load when affected. Distinguish tests actually run from unverified claims.
- Report changed files, observable behavior, test commands/results, and any limitations or follow-up dependencies. Avoid repeating project-wide plans in the final report.
