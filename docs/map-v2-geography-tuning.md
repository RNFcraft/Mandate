# Map v2: final geography tuning for visual review

> Historical preview/tuning report. Current authority: [frozen Map v2 runtime](map-v2-runtime.md), 5,001 provinces, mandate-provinces-v1. New preview generations use a separate output folder.


The accepted independent-geometry architecture remains intact: dissolved
Natural Earth land, independent partition, shared topology, spatial atomic
overlay and exact integer population allocation. Default target is now 5,000;
the generated preview contains **5,001 provinces**. This tuning pass did not perform freeze or runtime migration; those are now complete in the separate [frozen runtime integration](map-v2-runtime.md).

## Configuration and target mass

All numeric tuning lives in [`scripts/map-v2-tuning.json`](../scripts/map-v2-tuning.json).
`DEFAULTS` imports that file; `--config` accepts overrides. Unknown keys and
invalid numeric/bounded values fail rather than silently ignoring a typo.

| Parameter | Accepted 7,130 baseline | Current tuning |
| --- | ---: | ---: |
| Target count | 7,000 | 5,000 |
| Density weight / reference / clamp | 0.3 / 5 / 2.5 | 1.6 / 2 / 5 |
| Density floor | 1 | 0.7 |
| Seed jitter | 0.24 | 0.55 |
| Relaxation iterations | 5 | 3 |
| Relaxation strength | Full centroid movement | 0.55, 0.3575, 0.232375 |
| Retained seed anchor fraction | 0 | 0.4 |
| Tiny island grouping radius | 350 km | Up to 1,800 km for islands under 150 km² |
| Skinny repair | Detached/tiny parts only | Two safe merge passes, candidate area ≤90,000 km² |
| Minimum province area | 150 km² | 150 km² |
| Compactness / elongation warnings | 0.12 / 12 | 0.12 / 12, unchanged |
| Micro component threshold | 0.1 km² | 0.1 km², unchanged |
| Internal simplification | 0 | 0 |

The smoothed population field still uses 2-degree bins and a one-bin triangular
smoothing radius. Atomic polygon boundaries do not enter the partition.

```text
demand = min(5, 0.7 + 1.6 × log(1 + density / 2))
target mass = land area × demand
local target area is approximately proportional to 1 / demand
```

The bounded dense/sparse demand ratio is at most 5 / 0.7 ≈ 7.14. Component
budgets and initial spatial strata divide this target mass. Antarctic samples
receive an additional 0.08 mass multiplier; the large Antarctic mainland gets
16 seeds. Small genuine Antarctic components retain the usual minimum budget.

Weighted nearest-cell centroids continue to use the same demand field during
relaxation. Each step moves only partially toward `0.6 × centroid + 0.4 ×
initial seed`, with decreasing strength. This preserves much of the initial
equal-demand-mass placement instead of allowing full Lloyd iterations to drift
toward the more uniform sqrt(demand) equilibrium. It is a retained-placement
approximation, not an exact equal-mass power diagram or hard per-cell area
constraint. A density-step fixture checks that sparse/dense area contrast
survives all relaxation iterations.

Deterministic jitter is local-scale displacement inside spatial strata. The
anchor retains those offsets; no high-frequency edge noise is introduced.
Cells remain simple. Safe merges introduce some non-convex shapes without
moving coordinates or modifying coastlines. Voronoi appearance is reduced,
but remains recognizable.

## Cleanup and coastlines

Detached clipped fragments still reassign across positive-length shared land
arcs within their source component. Tiny groups merge with land neighbors.
Two additional passes consider small coastal/skinny groups and accept a merge
only when combined compactness improves by at least 25% and exceeds the
unchanged warning threshold. Neighbors cannot merge across water.

This pass repaired 562 detached fragments and made 46 safe skinny/coastal
merges. Tiny standalone islands can join maritime groups within the larger
tiny-island radius. Physical polygons and their coastlines remain untouched;
the maritime relation never becomes a land-adjacency edge. One genuinely
isolated small island remains standalone (Bouvet, approximately 55 km²).

## QA and population

| Metric | Old 7,130 pass | New 5,001 pass |
| --- | ---: | ---: |
| Tiny provinces | 89 | 3 |
| Tiny mainland provinces | Not separately reported | 0 |
| Tiny standalone island provinces | 42 | 1 |
| Micro physical polygons | 84 | 84 |
| Micro non-island components | Not separately reported | 0 |
| Compactness/skinny warnings | 250 | 198 |
| Elongation above threshold | — | 0 |
| Provinces with multiple physical polygons | 913 | 765 |
| Vertices | 455,638 | 442,772 |
| Median / p90 province area km² | 21,851.91 / 26,366.02 | 19,590.49 / 60,327.66 |

The 84 micro polygons are preserved real source islets, not mainland partition
fragments. The 198 warnings use the original compactness threshold: 190 concern
archipelago provinces and eight single-component provinces with complicated
coastlines. Aggregate coast-perimeter compactness remains harsh on archipelagos;
the metric has not been relaxed to make the count look better.

Independent geometry QA reports:

* 0 overlaps and overlap area 0;
* 0 invalid provinces, disconnected mainland provinces, shared-topology errors
  and segment crossings;
* 77 numerical gap residual fragments, combined **1.7763e-10 km²**;
* outside-mask residual area **1.8318e-10 km²**;
* coastline symmetric-difference area **3.6081e-10 km²**;
* source-mask and union areas both **146,720,473.673142 km²**;
* no significant gaps, ocean polygons or coastline strips;
* unchanged source land-mask hash.

Population transfer is unchanged: **591,714,189 → 591,714,189**, difference
**0**, with per-atom integer totals preserved. The same 138 wholly uncovered
atoms, containing 19,986 people, retain explicit nearest-province fallback
records with zero overlap area. Partially covered atoms number 7,520.

Cold final generation took **244.50 seconds**, while the existing regression
suite ran concurrently, versus 317.36 seconds for the old pass. Geometry QA
also passed the separate `--qa` source/hash/per-atom/province recheck.

The verified partition-cache replay took **186.22 seconds**. SHA256 values
matched for all seven deterministic artifacts: topology, province metadata,
mapping, maritime relations, components, source land and generation QA.
Timing is deliberately excluded. The source-land file also matches the
7,130-pass baseline byte for byte.

Full regression run: **200 passed** (188 existing tests plus 12 Map v2 tests).
After adding a focused shared-land-edge skinny-cleanup fixture and strengthening
artifact assertions for tiny mainland/micro non-island components, the final
targeted run passed all **13 tests**. Structural geometry tolerances were not relaxed;
only the count assertion changed to the requested 4,500–5,500 interval.

## Visual comparison

The old preview and screenshots are preserved offline under
`data/generated/map-v2-baseline-7130/{artifacts,screenshots}`. This is an ignored
authoring archive, not a second production pipeline.

The world view is noticeably coarser across northern Asia, northern North
America, deserts and the Australian interior. Europe and India remain detailed;
they actually receive more of the reduced global budget. This is intentional
redistribution, not uniform enlargement of every province. Japan retains
readable large cells. China has an evident coast/interior size gradient.

The following comparisons use identical geographic rectangles and province
seed inclusion, not administrative country membership. Units are median km²:

| Region | Old | New |
| --- | ---: | ---: |
| Western/Central Europe | 15,171 | 9,619 |
| India | 14,131 | 9,278 |
| Eastern China coast | 15,066 | 9,464 |
| Western China | 22,788 | 40,823 |
| Siberia | 23,420 | 57,263 |
| Sahara | 23,767 | 54,899 |
| Interior Canada | 23,481 | 64,219 |
| Australian interior | 23,605 | 64,444 |

Siberia/Europe median area ratio grows from 1.54 to **5.95**; Sahara/India from
1.68 to **5.92**; western/coastal China from 1.51 to **4.31**. Actual neighboring
cells vary, especially at density transitions and coasts.

Saved browser screenshots: `test-results/independent-{world,europe,india,china,
japan,indonesia,sahara,siberia,canada,australia}.png`, plus Alaska, Philippines,
Aegean, Scandinavia, Britain, Caribbean and land-mask/borders diagnostics.
All ten required views and the diagnostic were inspected. No visible coastal
strips or water connections were found.

Remaining visual limits: recognizable straight Voronoi boundaries; some
near-quadrilateral/strata regularity; natural narrow islands and complicated
coasts; polar projection distortion. Antarctica is intentionally coarse.
Remote tiny groups and the uncovered-atom source policy remain explicit.
The subsequent integration froze this exact accepted geometry; see [current runtime](map-v2-runtime.md).

## Commands

```powershell
node --max-old-space-size=8192 scripts/generate-gameplay-map.cjs --out tmp/new-geography-preview
node --max-old-space-size=8192 scripts/generate-gameplay-map.cjs --qa
node --max-old-space-size=8192 scripts/generate-gameplay-map.cjs --resume-partition --out tmp/map-v2-tuning-repeated
npm start
# http://127.0.0.1:3000/?mapPreview=gameplay
# http://127.0.0.1:3000/?mapPreview=gameplay&mapLayer=borders
npx playwright test tests/independent-gameplay.spec.cjs tests/gameplay-provinces.spec.cjs
npm test
```

The partition cache verifies config and source hashes. Atomic source/baseline
files were preserved in this historical tuning pass. The subsequent freeze migrated scenario/state authority to provinces and rejects old atomic saves. No commit or push is made.
