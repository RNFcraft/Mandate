# Political Geography 1700 v1

This foundation assigns existing canonical atoms to authored **polities**. It
does not split atoms, replace geometry, infer ownership from `gb:XXX`, or use the
RU/US development scenario as historical evidence. No historical political
boundary source exists in the local repository: `data/source` contains modern
geoBoundaries ADM2 and HYDE population rasters. The committed historical layer
is an empty `draft`, with empty registry, relations and overrides. Ordinary
loading retains the explicitly documented DEV fallback until publication.

The rendered map is a gameplay approximation using fixed canonical atomic
territories. Premodern authority was often overlapping, decentralized or poorly
defined. A crisp polygon boundary does not imply historically surveyed modern
borders. Historical recognizability, internal consistency and gameplay take
precedence over false cartographic precision.

## Authored schemas

`scenarios/1700/polities.json` is an array of
`{id,name,shortName,type,color}`. IDs follow the existing ASCII scenario tag
convention; names and types are data, and `color` is a presentation hex color.
No government form is encoded into IDs or hardcoded in runtime.

`polity-relations.json` contains `{version:1,relations:[{type,from,to}]}`.
Optional `reason` and `source` are textual. Supported types: `subject_of`,
`personal_union`, `colonial_dependency`, `tributary_of`, `protectorate_of`.
Personal union is symmetric and normalized by ASCII order; other types are
directional. Unknown references, self relations and duplicates fail validation.
This metadata is not diplomacy simulation.

`political-geography.json` contains
`{version:1,year:1700,geography:"mandate-atomic-v1",status,owners,controllers,provenance}`.
Statuses are `draft`, `ready`, `published`. `owners` maps canonical territory
IDs to polity IDs; omission or explicit null means unassigned. `controllers`
contains only differences from owner, including explicit null. All references
are validated. Duplicate JSON keys are rejected, including escaped spellings.

`political-geography-overrides.json` contains `{version:1,overrides:[...]}`.
Each row requires `{territoryId,ownerPolityId,reason,source}` and may include
`controllerPolityId`. Null is valid. Overrides apply last and are unique per
territory; missing controller means the overridden owner. Reasons and sources
remain embedded in published provenance and the audit.

## Required historical input

Supply a reviewed WGS84 lon/lat GeoJSON `FeatureCollection`, with valid closed
Polygon/MultiPolygon geometry and an explicit stable polity ID property on
every feature. Use `--polity-field` to configure that property. Cut polygons at
the antimeridian before import. Register every referenced polity in
`polities.json`; author relationships and justified overrides separately.
Supply source name, date, version, URL/DOI/citation when available, and review
license/permission metadata before selecting the dataset. Do not invent a
complete historical source from modern ISO prefixes or model memory.

Example **synthetic input only**, not a historical assignment:

```json
{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"polityId":"alpha"},"geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}}]}
```

## Import and publication

The offline importer reuses canonical `adm2-spatial.cjs` area/intersection and
the existing part-wise spatial index. Same-polity source patches are unioned
before overlap evaluation to prevent double counting. For each atom, largest
positive exact intersection area wins; exact ties use ascending ASCII polity
ID. No overlap yields null. No atom is subdivided.

HIGH means winner >=90% of atomic area; MEDIUM >=60%; LOW <60%; no overlap is
UNASSIGNED. An assignment is ambiguous when winner <60% or runner >=10%.
Use `--high`, `--medium`, `--runner-ambiguity` to configure fractional thresholds.
Overlapping polity sources may both cover the same land; percentages describe
independent intersections, not a partition or certainty about sovereignty.

Preview the current empty foundation:

```powershell
node --max-old-space-size=8192 scripts/import-political-geography-1700.cjs
```

After supplying and registering a real reviewed source, the exact command
template is (replace the source metadata with the dataset's actual values):

```powershell
node --max-old-space-size=8192 scripts/import-political-geography-1700.cjs --source data/source/political-geography/1700/historical.geojson --polity-field polityId --source-name "SOURCE NAME" --source-date "1700" --source-version "SOURCE VERSION" --source-citation "SOURCE CITATION"
```

Explicit atomic publication uses the same inputs plus `--publish`:

```powershell
node --max-old-space-size=8192 scripts/import-political-geography-1700.cjs --source data/source/political-geography/1700/historical.geojson --polity-field polityId --source-name "SOURCE NAME" --source-date "1700" --source-version "SOURCE VERSION" --source-citation "SOURCE CITATION" --publish
```

Repeat `--source FILE` for additional files; source metadata flags apply to
all files in that invocation. Use a separate invocation/adapter if sources need
distinct bibliographic metadata. All paths stay within the game repository.
`--scenario-dir`, `--polities`, `--relations`, `--overrides`, `--audit` are available
for authoring fixtures; publication requires scenario-local registries.

All computation, reference validation, serialization and frozen/input SHA
checks finish before a flushed temporary file atomically replaces the single
political assignment asset. Failure preserves scenario assets. Source raw-byte
SHA-256, registry/relation/override hashes, canonical/hierarchy/baseline hashes,
mapping method and thresholds are recorded without timestamps or machine
paths. Identical input bytes produce identical output bytes. Reordering source
features preserves assignments but intentionally changes raw-file provenance SHA.

## Runtime and debug

Published politics initializes existing GameState `countries` (compatibility
adapter), `ownership`, and sparse `controllers`; the public `polities` view
aliases the same registry. No second runtime ownership system exists.
Relationships initialize `systems.polityRelations`. Loaded saves, including
old saves, remain sole authority; static assets never overwrite loaded state.

The existing renderer colors atoms and stitches political borders from shared
canonical arcs. `politicalBorderArcs` can query owner or controller differences
without producing a new mesh. No war/diplomacy or daily/monthly mechanics are added.

After preview generation, open `/?scenario=1700&politicalPreview=1` to inspect
the ignored preview using the existing renderer. This changes only the in-memory
scenario. `/?scenario=1700&politicalDebug=1` inspects the ordinary runtime and
labels draft ownership as DEV TEST DATA. Clicking an atomic territory displays
territory ID, owner, controller and runtime population. Console query:
`inspectPoliticalTerritory(territoryId)`.

## Ignored audit

`data/generated/political-geography/1700/` contains `summary.json`,
`polity-summary.json`, `ambiguous-territories.json`, `unassigned-territories.json`,
`manual-overrides.json`, full `territory-assignments.json`, and preview snapshots
of political geography, polities and relations. Summary reports territory,
area and frozen baseline population assigned/unassigned, relationship counts,
confidence buckets and overrides. Polity rows include territory count, area,
population, urban and rural, including a null row for unassigned land. Audit
population is derived from the immutable baseline, never regenerated or changed.

Synthetic regression tests cover validation, assignment, determinism, overrides,
runtime/save authority, shared borders, atomic failure, API/editor preservation,
debug preview and frozen hashes. Run `npm test`.

## Frozen asset verification

SHA-256 before and after implementation matches for every row below.

| Asset | Unchanged SHA-256 |
| --- | --- |
+| `data/processed/canonical/atomic.topo.json` | `9b3cc5de449778a3ed7edd4f6105b7ab3016b1af25227a4ff5c8c8cf0d1bbcc8` |
| `client/data/adm2/hierarchy.json` | `49b8c3f498427877b5e84db79597cfd3ce2b123e4c78cae72a35c2cb68df9ce0` |
| `scenarios/1700/population.json` | `008c8d376d0dd6cf5106479bc4ae1d3ed50010865c35c0b07de037cf6434b517` |
| `scenarios/1700/population.meta.json` | `fd7194fd71fe8c2e1bbe07221145aad95918a4d950d2d5cfdc68fc4ac9a5881f` |
| `scenarios/1700/ownership.json` | `fd2b3d11c3f6d84afdf16c73894b15c332dad06e82ad130798bb8c95b5058c37` |
| `scenarios/1700/countries.json` | `6e322d58aa9d18279964843f91de571c46e2dbc48b6d9d70635d21514e420be1` |
