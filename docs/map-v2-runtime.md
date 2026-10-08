# Map v2: frozen province runtime

The accepted **5,001 provinces** are frozen as `mandate-provinces-v1`, geometry version 1. Freeze replaces ordered `preview:XXXXX` IDs with `province:XXXXX` and verifies identical decoded coordinates, arcs, polygon arc references and canonical land. No geometry generation or tuning change belongs to this integration.

## Artifact and provenance

`client/data/map-v2/manifest.json` records schema/freeze version, generator schema, seed 1700, accepted tuning, atomic population source hash, land mask hash, geometry hash and artifact SHA-256 values. `hierarchy.json` contains provinces with empty ADM0/ADM1 arrays. `adjacency.json` derives only from actual shared land edges; point contacts and maritime grouping create no land neighbors. **States/regions are not implemented.**

| Artifact | SHA-256 |
| --- | --- |
| Decoded geometry | `954c01fb20f141cdb0998a3adbf1f751821e710f34ef2b8166967ce260f1b64d` |
| Packed topology | `ba8faf6a87470fc6db3ef9c0dd24ec8cc21c2b6886089fb8424640551d450b5d` |
| Atomic→province mapping | `93260a8147ac0b46269f76ba7d40ed78369c89b6c77bbbcfc41801d40c4cb6a7` |
| Canonical land mask | `946f58c6b017abe5a35d747b4a600911cef597fa82ca7311c7c87a52c933121f` |

## Migration

Both active tracked scenarios, `1700` and `modern`, use scenario v4 and province-keyed ownership, controllers and capitals. Maximum positive overlap area chooses owner and effective controller independently; ties use ASCII IDs. Capitals select greatest overlap with an owned province or are cleared with QA. Replacement folders are prepared before publication; reruns are idempotent. Historical backups and atomic authoring inputs remain unchanged.

The initial freeze preserved DEV assignments in 1700 (339 owned provinces, 288 migration QA rows). Subsequently, [Mandate World 1700](mandate-world-1700.md) published 4,946 owned provinces, 167 registered polities and 160 owned province capitals. Modern has 4,989 owned provinces and 3,270 ambiguous QA rows. Neither has missing-overlap province fallback. Multiple contributing candidates are reported as ambiguous even when deterministic area selection resolves them; this is not a structural failure or historical accuracy claim.

Population projects each original cohort independently with `allocationFraction` and largest remainder; equal remainders use ASCII province IDs. Only matching province and full demographic identity can merge. Culture, religion, stratum, settlement, literacy and rates remain correlated. All 64,495 original cohorts are checked; output has 9,113 cohorts. Exact totals: **591,714,189 people; urban 46,409,598; rural 545,304,591; difference zero**. The atomic HYDE baseline remains immutable. `population-migration-qa.json` and `population.meta.json` record conservation and provenance.

138 atomic cells lie outside the clean land mask. The accepted explicit nearest-province allocation retains 19,986 people. `uncovered-atoms.json` lists every cell, positive-population cells, destination and distance; maximum distance across all cells is 1,676.881799 km. This allocation exception creates no geometry or land bridge. Existing mapping policy is preserved.

Population import/composition and historical political publication remain offline atomic authoring steps, but publication compiles results to province assets. Normal runtime does not load the fractional mapping.

## Runtime and rendering

`npm ci` followed by `npm start` builds the browser bundle and serves tracked assets. Ordinary `/?scenario=1700` fetches province topology/hierarchy/manifest and scenario assets. GameState v2 and save envelope v2 require `mandate-provinces-v1`; old atomic saves/states are rejected before installation, without implicit migration.

The browser fills provinces, compares legal owner across shared topology edges and draws canonical coastline. Same-owner internal lines are hidden at world zoom and subtle at zoom ≥2. Controller is separate. Normal startup requests no ADM2 chunks or `/api/political`, needs no ignored `data/processed`, and performs no GIS union/clipping/matching. Legacy worker access requires explicit atomic debug.

Existing province Path2D objects are batched into one Canvas fill per owner to avoid antialias seams; this does not merge or modify geometry. Canvas backing dimensions equal CSS viewport × `min(devicePixelRatio,2)`; pixelated styling is removed. Pan, zoom, hover, selection and DEV editing use provinces. `/?mapPreview=gameplay` still inspects accepted geometry. `/?mapDebug=atomic&editor=1` exposes the retained internal inspector without gameplay state.

## Commands and checks

```sh
npm ci
npm start
node scripts/freeze-gameplay-map.cjs
node scripts/migrate-province-scenarios.cjs
node --max-old-space-size=8192 scripts/generate-gameplay-map.cjs --qa
npm run test:ci
npm test
```

Freeze reruns verify hashes without rewriting the artifact. Generator defaults to separate `client/data/map-v2-preview` and refuses frozen destinations. `--qa` audits frozen data and writes only excluded `qa-recheck.json`. Geometry changes require a future explicit versioned migration.

CI uses Node 24, locked `npm ci` and Chromium. It checks tracked runtime, simulation, population, independent geometry fixtures, preview, DPR, IDs/hashes/adjacency, save rejection and startup without ignored GIS assets or ADM2 data. That startup fixture copies runtime files and shares installed dependencies. Full local `npm test` additionally requires prepared offline GIS source and exercises the retained heavy audit and historical/parallel population pipelines.

Tests produce `test-results/map-v2-normal-world-dpr2.png` and `map-v2-network.json`; preview visual tours remain in test-results. Geometry conservation is proved by the decoded digest; screenshots supplement it.

Economy, states/regions and complete historical population composition remain outside this pass. Current 1700 uses Mandate World authored political ownership; the original RU/US freeze fixture has been replaced without changing frozen geography or population.

## Integration validation, 2026-10-08

Actual local runs: frozen `--qa` passed with 5,001 provinces, overlap zero and no structural failures; freeze/migration reruns were idempotent. Decoded geometry digest matches the accepted topology from Git HEAD. Targeted runtime/preview/simulation checks passed (22 tests); full local suite including offline GIS passed (208 tests, 8.4 minutes). After successful `npm ci`, the CI runtime set passed on installed Chromium (77 tests). GitHub Actions itself was not run because this pass creates no commit or push.

Actual `npm start` on port 3000 and separate startup without ignored GIS/ADM2 data passed. Scenario 1700 reports province authority, 5,001 territories and the exact conserved population. DPR2 Canvas is 2,880×1,800 at a 1,440×900 viewport; normal network has no atomic chunks or political worker endpoint. Gameplay preview also reports 5,001 provinces; both pages have no browser errors. The normal world screenshot was inspected after batching same-owner fills to eliminate antialias seams.

Allocation exception details: 27 of the 138 uncovered atoms contain people; their combined 19,986 people remain allocated. Greatest positive-population fallback distance is 200.686371 km (7 people); the overall 1,676.881799 km maximum belongs to a zero-population atom. Scenario ambiguous QA rows represent 144 distinct provinces in 1700 and 1,635 in modern, reported separately for ownership and control.

Subsequent Mandate World publication on 2026-10-08: normal 1700 uses 167 registered polities, 4,946 owned provinces and 160 valid owned capitals; targeted tests passed 35/35 and full suite 212/212 (8.7 minutes). Frozen artifacts and population assets remain unchanged. See mandate-world-1700.md for political QA and 32 inspected normal runtime screenshots.
