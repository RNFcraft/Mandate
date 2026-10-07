# Mandate World 1700 v1

"Mandate World 1700 is a gameplay-oriented, historically recognizable starting
scenario. Borders and political entities are intentionally simplified."

This is an independently authored game dataset. Gameplay and internal consistency
take priority over exact historical fidelity. No historical-basemaps polygons,
feature IDs, assignment output or NAME mapping are input to this generator. The
GPL historical-basemaps preview remains separate, ignored reference/audit data.

## Authoring asset

`scenarios/1700/political-geography-authoring.json` is the authored source of truth
for **167 playable polities**, **329 rules**, **41 initial relationships** and
**8 strategic-anchor gameplay overrides**. The runtime polity registry remains
the existing single GameState registry; no political mechanics are added.

The asset contains version/year/datasetId/description, polity metadata, major IDs,
rules, relationships and overrides. Polity IDs are explicitly chosen in authored
data, not inferred by geometry or from modern source prefixes. A polity type is
metadata, including kingdom, confederation, decentralized_region, indigenous_region,
frontier and colonial_administration. Major powers have authored presentation colors.

A rule is `{id,match,ownerPolityId,reason}`. Selectors may combine with AND:
`sourceCountry`, `[west,south,east,north]` bbox, `territoryIds`, `territoryId`.
sourceCountry matches **hierarchy adm0Id**, including residual atoms; it is a
modern geographic authoring proxy, never independent historical evidence.
Bbox membership reuses the existing canonical equal-area centroid helper and
supports longitude wrap. An atom is not split to fit a rectangle.

Precedence: exact territory > explicit list > bbox+sourceCountry > bbox >
sourceCountry > fallback. Equal-specificity rules targeting different owners fail,
including lower-priority conflicts hidden by stronger rules. Duplicate rule IDs,
unknown polity/territory/country references and malformed selectors fail too.
There is no iteration-order or current DEV ownership dependence.

Overrides require territoryId, ownerPolityId and reason; controllerPolityId and
source are optional. Missing source receives an explicit **authored gameplay
decision** marker, not a fabricated citation. Referenced decisions can provide
their actual source separately. Overrides apply last; duplicate territories fail.
Eight explicit atoms preserve Paris, Amsterdam, Vienna, Moscow, Beijing, Edo,
Venice and Rome as strategic anchors. Normal start control equals owner everywhere.

## Main simplifications

- HRE is represented by Bavaria, Saxony, Hanover, Brandenburg-Prussia, Rhenish,
  Swabian and North German blocks; no imperial constitutional mechanics.
- Italy is reduced to Savoy, Genoa, Milan, Venice, Emilian Duchies, Tuscany,
  Papal States and Naples/Sicily. Some canonical atoms are much larger than the
  desired states; these are deliberate whole-atom gameplay approximations.
- England/Ireland and Scotland remain separate with a personal union. Baltic,
  Crimean, Transylvanian, Wallachian and Moldavian regions use coarse authored
  selectors. Russian far northeastern communities are a separate abstraction.
- Qing is separated from Tibet and Dzungaria. Mughal India has Maratha, Rajput,
  Mysore, Tamil, Malabar and Ahom regional carve-outs. No claim of exact authority.
- Central Asia, mainland Southeast Asia, Vietnam and maritime polities are
  simplified into readable starting blocs. Some port colonies use whole atoms.
- New Spain, Peru, Portuguese Brazil, New France, English colonies and Caribbean
  administrations are distinct from their metropoles. Amazonia, the Plains,
  woodlands, Arctic, Pacific coast, Mapuche and Pampas are indigenous regions.
- African states coexist with broad forest, Sahel, highland and river entities.
  Oceania uses broad indigenous confederations, not invented modern nation-states.
- SourceCountry-only proxy assignments remain visible in audit and are legitimate
  authoring choices **requiring review**, not assertions that modern borders existed
  in 1700. Future authoring may refine them without changing the mesh.

Broad context references are listed in the authoring asset: Oxford's Europe circa
1700 teaching resource, Smithsonian's Qing dynasty overview and Encyclopaedia
Iranica's Safavid overview. These identify recognizable powers; no coordinates
or boundaries were copied from them. Every territorial rule is a gameplay decision.

## Preview and publication

Generate preview only:

```powershell
node --max-old-space-size=8192 scripts/generate-mandate-world-1700.cjs
```

Start the local map with `npm start`, then open:

http://127.0.0.1:3000/?scenario=1700&politicalPreview=mandate-world-v1

This selects only the Mandate World ignored preview snapshots. The existing
`politicalPreview=1` foundation preview remains supported independently. Only
allowlisted dataset names are accepted; arbitrary paths are rejected. Existing
owner colors, shared-arc border stitching, runtime population and game controls
are reused. The minimal debug output shows the clicked atomic territory's
owner/controller/population and is positioned above the canvas. No UI redesign.

Production remains the existing draft until explicit publication. The exact
future command, **not run as part of this task**, is:

```powershell
node --max-old-space-size=8192 scripts/generate-mandate-world-1700.cjs --publish
```

Publication validates all rules/references and coverage first, stages a copy of
the scenario folder, flushes the four political assets, and replaces the folder
with rollback on normal I/O failure. Population/meta, composition and other assets
are preserved byte-for-byte. Publication requires scenario-local authoring.
Runtime ownership/controllers remain the sole authority after initialization;
loaded saves are not overwritten by static authoring. The editor preserves the
authoring asset independently of its payload.

## Audit and current coverage

Ignored output: `data/generated/political-geography/1700/mandate-world-v1/`.

| Metric | Preview result |
| --- | --- |
| Active / registered polities | 167 / 167 |
| Assigned territories | 52,131 / 52,262 = 99.7493% |
| Assigned population | 591,660,278 / 591,714,189 = 99.9909% |
| Assigned canonical area | 134,697,584.8055 km² = 91.5923% |
| Assigned relevant inhabited area | 99.9313% |
| Unassigned territories / population | 131 / 53,911 |
| Unassigned area | 12,364,516.6866 km², mostly Antarctica |
| Owner/controller differences | 0 |
| Gameplay overrides | 8 |
| Relationships | colonial_dependency 24, subject_of 11, tributary_of 4, personal_union 2 |

"Relevant inhabited area" means area of a canonical atom with frozen baseline
population > 0. This is an audit denominator, not a newly invented land mask.
Coverage is derived from the immutable baseline; no people are reassigned or
regenerated. Unfinished Panama (49,107 people), San Marino (3,837), Falklands (675)
and the Siachen proxy (292) remain null alongside remote/uninhabited atoms.
Leaving these incomplete is explicit; no forced 100% target.

Required audits: summary.json, polity-summary.json, largest-polities.json,
unassigned-territories.json, border-adjacencies.json, tiny-polities.json,
disconnected-polities.json. Additional audits: isolated-territories.json,
source-country-artifacts.json, manual-overrides.json, territory-assignments.json,
rule-usage.json, frozen-hashes.json and three political preview snapshots.

Connectivity uses only shared arc references already present in canonical topology.
No geometry, edge positions or topology files are edited. Adjacencies aggregate
existing arc counts, not newly measured border geometry. Audit warns conservatively:

- 81 polities have more than one land-connected component. Islands, colonies and
  coastal residual slivers explain many; no automatic deletion or reassignment.
- 13 tiny cases mean one-or-fewer atoms **or** <10,000 baseline people. Emilian
  Duchies is one large atom with 944,567 people; this is a mesh-scale limitation,
  not an assertion that it is geographically tiny. Small/zero-population island
  polities reflect the frozen baseline and are not "corrected" demographically.
- 69 atoms differ in owner from all their land neighbors. Three satisfy the large
  enclave threshold (>=10,000 km² or >=100,000 people): Emilia, a Canadian woodland
  atom and Cayenne. These are flagged for review.
- 198 proxy-country cases use only a sourceCountry rule. The audit exposes this
  modern-shape shortcut rather than treating it as historical evidence.
- Major-polity population guard flags Portuguese Brazil, English Atlantic Colonies,
  New France and Oman below the conservative 500,000-person threshold. This is
  not a historical population estimate or reason to alter the frozen baseline.
- Components >1,500 km from their main component representative are flagged as
  isolated-distance candidates. Sea-connected empires may legitimately trigger it.

Synthetic tests cover precedence, lower-priority conflict rejection, deterministic
bytes, null/decentralized entities, relationships, gameplay overrides, shared arcs,
frozen files, preview-only behavior and fixture publication rollback. Browser
validation verifies colors, runtime authority and visible click inspection and
stores `map-preview.png` in ignored audit output. Run full `npm test`.

Validation on 2026-10-06: full `npm test` passed all 188 tests (8.3 minutes).
The rendered screenshot was visually inspected; owner/controller/population debug
is visible. Repeated real generation produced byte-identical contents for all
16 JSON audit/snapshot outputs. All eight protected SHA-256 hashes matched.
Production political assets remained unchanged; no production publication ran.

Files for this dataset: `scenarios/1700/political-geography-authoring.json`,
`scripts/mandate-world-authoring.cjs`, `scripts/mandate-world-audit.cjs`,
`scripts/generate-mandate-world-1700.cjs`, `tests/mandate-world.spec.cjs`,
this document, `scripts/scenarios.cjs`, `client/scenarios/store.js`,
`client/map/main.js`, `client/game/controls.css`, and rebuilt
`client/map.bundle.js` / `client/map.bundle.js.map`. Existing historical-basemaps
preview changes are retained separately.
