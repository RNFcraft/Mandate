# Map v2: independent gameplay geometry

> Historical preview/tuning report. Current authority: [frozen Map v2 runtime](map-v2-runtime.md), 5,001 provinces, mandate-provinces-v1. New preview generations use a separate output folder.


**Historical 7,130-province baseline.** The accepted architecture below remains
in use. Current defaults and the final ~5,000-province tuning results are in
[map-v2-geography-tuning.md](map-v2-geography-tuning.md). Numbers and the density
formula below describe the preserved first independent pass.

This authoring preview replaces the rejected atomic-union layout. Atomic cells
determine data, not visible gameplay borders. IDs remain experimental; no
ownership, save, simulation, population baseline or atomic-source migration is
performed. The previous generator and its fixture tests remain available.

## Commands

Run from the repository root:

```powershell
node --max-old-space-size=8192 scripts/generate-gameplay-map.cjs
node --max-old-space-size=8192 scripts/generate-gameplay-map.cjs --qa
npm start
# http://127.0.0.1:3000/?mapPreview=gameplay
# http://127.0.0.1:3000/?mapPreview=gameplay&mapLayer=borders
npx playwright test tests/independent-gameplay.spec.cjs tests/gameplay-provinces.spec.cjs
npm test
```

`--qa` independently rechecks existing geometry, source/mapping hashes, every
atomic allocation and each province's population total; writes
`qa-recheck.json`. Structural failures exit with code 1. Geometry QA always
runs during generation. Full generation takes about **317 seconds** on the
current machine, including the overlay and independent geometric QA. The
validated partition-cache run took **257 seconds**; it still recomputes overlay
and QA. Timings are in `timing.json`, separate from deterministic artifacts.

```powershell
node scripts/generate-gameplay-map.cjs --target 6000 --out tmp/map-v2-6000
node scripts/generate-gameplay-map.cjs --target 8000 --out tmp/map-v2-8000
node scripts/generate-gameplay-map.cjs --config tmp/map-v2-config.json
node scripts/generate-gameplay-map.cjs --resume-partition
node scripts/generate-gameplay-map.cjs --help
```

All current tuning lives in `scripts/map-v2-tuning.json`, exposed as `DEFAULTS`
by `scripts/gameplay-partition.cjs`. JSON config
overrides those numeric keys. Example:

```json
{
  "targetProvinceCount": 7000,
  "densityWeight": 0.3,
  "densityClamp": 2.5,
  "relaxationIterations": 5,
  "seedJitter": 0.24,
  "islandProvinceArea": 1000,
  "archipelagoDistanceKm": 350,
  "minProvinceArea": 150,
  "simplificationTolerance": 0
}
```

Area thresholds are km². Optional shared-arc simplification tolerance is meters;
zero retains the already straight internal edges. Exterior vertices remain
locked, and crossing repair falls back to original arcs if necessary. Density
reference, scanline spacing, tile size, seed, compactness/elongation thresholds,
micro-component threshold and QA tolerances are also configurable. Offline
partition caches live in ignored `data/generated/map-v2-partitions`; config,
land-mask, atomic and population hashes must match before reuse.

## Land mask and partition

Chosen source: the original repository shapefile
`data/map/countries/ne_10m_admin_0_countries.shp`. Mapshaper dissolves all
countries together with gap filling disabled. No political seam remains.
No dataset is downloaded. The mask keeps the source's land/lake inventory.

Source comparison:

| Dissolved source | Components | Vertices |
| --- | ---: | ---: |
| Original Natural Earth Admin0 | 4,063 | 411,010 |
| Existing simplified `world.topo.json` countries | 1,574 | 48,287 |

The original source retains substantially more islands and coastline detail.
The canonical mask is fixed before generating gameplay boundaries. Its
coordinates are not independently simplified for each province.

Each source polygon is a physical land component. Component budgets use area
and a bounded adjustment:

`multiplier = min(2.5, 1 + 0.3 * log(1 + density / 5))`

Density comes from a smoothed 2-degree field of baseline atomic population and
area; internal ADM edges never enter the partition algorithm. Samples use
cos(latitude) area weights. Budget allocation uses deterministic largest
remainders. Spatial weighted median strata provide initial seeds, with a small
deterministic in-stratum displacement to reduce grid bias. Five constrained,
weighted Lloyd iterations keep seeds on land samples.

Voronoi cells are generated independently inside each seeded component in an
affine longitude/latitude plane with a component latitude correction. A KD-tree
accelerates neighbor lookup; convex-cell vertex checks add any missing bisector
constraints. Thus the local-neighbor accelerator does not approximate the
Voronoi partition. Cells are clipped to their component mask. Cached tiles
accelerate clipping but do not determine the cell boundaries.

Concave coastlines and peninsulas can split a clipped cell. Detached parts are
reassigned across actual shared positive-length land borders. The final
mainland shapes are connected. Small source islands join nearby provinces or
remote archipelago groups within the configurable maritime radius. Physical
islands stay separate; no polygon is drawn through ocean. Maritime membership
is stored separately from actual land adjacency. Tiny isolated provinces are
excluded from click geometry below zoom 8; their land remains visible.

All pieces and the source land mask undergo one common topology build with
noding/clean, overlap preservation and no gap fill. Province groups reuse those
shared arcs. The existing codec packs coordinates losslessly. A 1e-9 degree
snap tolerance aligns numerically coincident vertices. The land object's
exterior is also the province-union exterior, preventing duplicate coastline
contours or strips.

Gameplay area is calculated from the new geometry with an analytic spherical
surface integral for linear longitude/latitude edges. The integral is invariant
to collinear vertices inserted during topology noding; simple vertex-based
equal-area approximations can otherwise report false coastline-area drift.

## Atomic data transfer

The unchanged source is `data/processed/canonical/atomic.topo.json`, with
52,262 atomic IDs. Population is summed from cohorts in
`data/population/baselines/1700/population.json`. The baseline geography hash
must match the atomic source. Atomic IDs, cohorts and scenarios remain intact.

`mapping.json` now has one row per atom and multiple intersection records:

```text
atomId → areaKm2, coveredAreaKm2, intersections[]
intersections[] → provinceId, overlapAreaKm2, areaFraction,
                  allocationFraction, population, optional fallback reason
```

Intersection areas use the existing repository cylindrical equal-area
approximation. `areaFraction` is overlap / atomic area; `allocationFraction`
normalizes the positive overlaps for transferring the atom's entire population.
Per-atom Hamilton/largest-remainder rounding with ASCII province-ID ties keeps
each atom total and the global total exact. Gameplay province area is never
the sum of these atomic overlap areas.

Bounding-box indexes reduce the real overlay to **130,309 candidate pairs**,
rather than 52k × 7k. Exact convex containment/separating-axis checks and cached
vector tiles accelerate intersections. One near-collinear tile case fell back
successfully to the original untiled polygons; the QA lists that retry.

The two geographic sources differ near coasts and on small islands:
**138 atoms**, with **19,986 people**, have no positive clean-mask intersection.
They receive an explicit `outside-clean-mask-nearest-province` allocation, with
zero overlap area and fraction. No fictitious intersection is recorded and no
population is dropped. Partial coverage is reported for 7,522 atoms. This
source mismatch remains a review item, not a hidden geometric repair.

## Artifacts and preview

Default output is `client/data/map-v2`:

| File | Purpose |
| --- | --- |
| `provinces.topo.json` | Shared province and canonical land topology |
| `provinces.json` | Geometry area, population, intersected atoms, seed/component IDs, compactness, elongation, true land adjacency |
| `mapping.json` | Fractional atomic overlay and exact integer allocations |
| `maritime.json` | Island-component membership; no land edges |
| `components.json` | Source component areas, weights and seed budgets |
| `source-land.geojson` | Fixed source mask for independent QA |
| `qa.json` / `qa-recheck.json` | Generation audit / independent artifact recheck |
| `timing.json` | Measured runtime and stage timings; excluded from reproducibility hashes |

The superseded generator now defaults to `client/data/map-v2-legacy`. Its old
`atoms.json` debug artifact was preserved in ignored
`data/generated/map-v2-legacy`, outside the current preview directory.

The preview uses the existing `WorldMap` interaction/rendering infrastructure.
It adds preview-only display resolution, a region selector and modes:
normal, land mask only, land mask + gameplay borders, density, area,
compactness warnings and island grouping. `mapLayer=borders` selects the
required mask/border diagnostic. It loads no scenarios, simulation, political
API or ADM2 chunks. Hover/click shows ID, area, population, seed, source land
component, compactness, physical geometry-component count and intersected atoms.

## Measured default pass

Target **7,000**; actual **7,130**. Differences come from remote island groups
and physical-fragment cleanup; IDs are not frozen.

| QA metric | Value |
| --- | ---: |
| Mask / union area km² | 146,720,473.673142 / 146,720,473.673142 |
| Gap / ocean area km² | 1.837e-10 / 2.038e-10 |
| Significant overlaps / overlap area | 0 / 0 |
| Invalid / disconnected mainland provinces | 0 / 0 |
| Shared-topology errors / segment crossings | 0 / 0 |
| Provinces with multiple physical polygons | 913 |
| Province area km²: min / median / p90 / max | 0.02079 / 21,851.91 / 26,366.02 / 41,756.29 |
| Population: min / median / max | 0 / 5,005 / 2,737,461 |
| Compactness: min / median / max | 0.00649 / 0.77735 / 0.93787 |
| Skinny/compactness warnings / tiny provinces | 250 / 89 |
| Tiny standalone island provinces | 42 |
| Micro physical components | 84 |
| Shared vertices | 455,638 |
| Population input / output / difference | 591,714,189 / 591,714,189 / 0 |

The difference operation returns 94 floating-point residual gap fragments;
their combined surface area is 1.837e-10 km², with no visible/significant gap.
Coastline mismatch area is 3.875e-10 km²; length is explicitly not computed.
QA independently checks source-mask symmetric difference in disjoint tiles,
18,181 bbox-filtered province pair intersections, ring validity, physical
component counts, shared-arc owners/orientations and segment intersections.
No inherited atomic overlap certificate substitutes for this new geometry QA.

Fresh generation and a verified partition-cache generation produced identical
SHA256 values for all seven primary deterministic artifacts. Existing tests:
188 passed. New/current gameplay generator and preview tests: 11 passed.
The old atomic-union fixture tests remain green.

## Visual review and remaining problems

Saved and inspected `test-results/independent-*.png`: world, Europe, India,
Japan, Indonesia, Sahara, Siberia, Canada, Alaska, Australia, Philippines,
Aegean, Scandinavia, Britain and Caribbean, plus land mask + borders.
Dense areas have independently generated readable cells, rather than inherited
ADM confetti; Sahara and Siberia no longer contain giant atomic/ADM shapes.
No visible light coastline strips or water connections appeared in this tour.

Remaining issues:

* Straight Voronoi edges and some strata/grid regularity remain visible.
* Narrow natural islands/peninsulas such as Palawan, Crete, northern Sulawesi
  and the Aleutians still yield elongated shapes; inspect the QA warnings.
* Polar projection distortion is conspicuous, particularly in Antarctica.
* Remote tiny island groups remain in the geometry and statistics; low-LOD
  click filtering prevents individual micro-territory picking.
* Nearest-province allocations for absent atomic islands need a geographic
  source-policy review before this becomes authoritative gameplay data.

This report describes the first independently generated visual pass. Subsequent tuning selected 5,001 provinces and [freeze integration](map-v2-runtime.md) migrated ownership, population, GameState and saves. States/regions and resources remain unimplemented.
