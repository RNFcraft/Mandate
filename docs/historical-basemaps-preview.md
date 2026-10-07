# historical-basemaps world_1700 local preview

This workflow is PREVIEW/AUDIT only. Production political geography remains a
draft. Raw GeoJSON and upstream license stay ignored under `data/source`; derived
polity inventories, mappings and preview outputs are unreviewed. No compatibility
between GPL-3.0 and Mandate is claimed. Project-level licensing review is required
before any production publication or distribution of derived artifacts.

## Pinned source and retrieval

- Repository: https://github.com/aourednik/historical-basemaps
- Upstream file: `geojson/world_1700.geojson`
- Exact repository commit: `da7a4b735ecef70aebdc9c73e409d8a2500d50f3`
- Raw file SHA-256: `eb73d6b00e98205fb2082de050c35e4d698224b17849628d82584610186b88a4`
- License notice: upstream GPL-3.0, stored locally as `historical-basemaps-LICENSE`.

Retrieve the pinned bytes inside the game workspace:

```powershell
New-Item -ItemType Directory -Force data/source/political-geography/1700
Invoke-WebRequest https://raw.githubusercontent.com/aourednik/historical-basemaps/da7a4b735ecef70aebdc9c73e409d8a2500d50f3/geojson/world_1700.geojson -OutFile data/source/political-geography/1700/historical-basemaps-world_1700.geojson
Invoke-WebRequest https://raw.githubusercontent.com/aourednik/historical-basemaps/da7a4b735ecef70aebdc9c73e409d8a2500d50f3/LICENSE -OutFile data/source/political-geography/1700/historical-basemaps-LICENSE
Get-FileHash -Algorithm SHA256 data/source/political-geography/1700/historical-basemaps-world_1700.geojson
```

The upstream README describes these as countries **and cultural regions**, a work
in progress with fuzzy or overlapping authority. Its NAME, SUBJECTO and PARTOF
labels are not independently validated historical claims. BORDERPRECISION is an
upstream ordinal (1 approximate, 2 moderately precise, 3 international-law border),
not the canonical atom assignment confidence. This preview preserves both concepts
in separate audit files and does not reinterpret either as historical certainty.

## Mapping and adapter

`scripts/historical-basemaps-adapter.cjs` parses strict GeoJSON, inventories all
features, detects exact overlaps where clipping succeeds, proposes IDs and adapts
an explicit NAME mapping. It does not infer owners from SUBJECTO, PARTOF or modern
ISO prefixes. Every entity is typed `source_entity_unreviewed` in the draft registry;
state/colonial/decentralized classifications require later authoring.

`historical-basemaps-polity-map.json` lives beside the ignored source and contains
`{version:1,source,sourceSha256,reviewStatus:"draft",mappings:{"SOURCE NAME":"id"}}`.
The SHA binds it to exact raw bytes. Proposed IDs use a bounded ASCII slug plus a
hash of the original NAME. Geometry never generates IDs. Edit the mapping explicitly
to choose other valid IDs. Missing names, stale hashes, unknown names, invalid IDs
and silent merging of distinct entities are rejected. Null/empty NAME features are
reported as excluded; they do not acquire invented identities.

Generate draft proposals once (existing authored mapping is never overwritten):

```powershell
node scripts/preview-historical-basemaps-1700.cjs --commit da7a4b735ecef70aebdc9c73e409d8a2500d50f3 --propose
```

Then run the explicit partial global preview:

```powershell
node --max-old-space-size=8192 scripts/preview-historical-basemaps-1700.cjs --commit da7a4b735ecef70aebdc9c73e409d8a2500d50f3 --exclude-invalid
```

Without `--exclude-invalid`, malformed named source features abort preview.
With it, whole invalid features are excluded and recorded; coordinates are not
repaired, simplified or edited. This run excludes Dutch Brazil, Amazon
hunter-gatherers and Khiva Khanate plus 191 unnamed features. The raw source
remains byte-identical. A future source correction must be explicit and reviewed.

The wrapper always rejects `--publish` and programmatic publication options.
It delegates to the existing generic importer in preview mode with an explicit
polityId field and an empty relationship registry. Relationships remain manual
review candidates. Commit SHA, raw/mapping/adapted hashes, source URL, license
notice and mapping method are recorded. No scenario files are replaced.

## Source inspection and preview findings

The full machine-readable report is ignored at
`data/generated/political-geography/1700/historical-basemaps/`.

| Item | Result |
| --- | --- |
| Features / geometry types | 782 / all MultiPolygon |
| Named features / distinct non-null NAMEs | 591 / 584 |
| Unnamed features | 191 |
| Properties | NAME, ABBREVN, SUBJECTO, PARTOF, BORDERPRECISION |
| String properties | 591 strings and 191 nulls each |
| BORDERPRECISION | 1: 8; 2: 0; 3: 774 |
| Unique SUBJECTO / PARTOF | 566 / 584 non-null, plus null in each |
| Invalid / null geometries | 7 / 0 |
| Duplicate names | Atakapa 2; Austrian Empire 2; Minang 2; Ottoman Empire 3; Polynesians 2; central Asian khanates 2 |
| Detected positive-overlap feature pairs | 969 (including unnamed geometries) |
| Failed pairwise clipping diagnostics | 9, recorded explicitly; no zero-overlap claim for those pairs |
| Mapped / unmapped names | 584 / 0 (draft) |
| Proposed registry / imported features | 584 / 588 |
| Relationship candidates | 29: SUBJECTO 22, PARTOF 7; runtime relations 0 |
| Assigned / unassigned atoms | 41,671 / 10,591 (79.7348% assigned) |
| Assigned / unassigned population | 545,394,590 / 46,319,599 (92.1720% assigned) |
| Assigned / unassigned area km² | 104,210,060.1732 / 42,852,041.3188 (70.8613% assigned) |
| Ambiguous atoms / population | 4,599 / 50,395,952 |
| Confidence HIGH / MEDIUM / LOW / UNASSIGNED | 35,020 / 3,379 / 3,272 / 10,591 |

Major review priorities based on the preview, not corrected historical claims:

- Italy: the largest ambiguous atom contains 2,048,867 people, with Milan 48.31%
  and Venice 34.66% overlap. Other large atoms span Papal States/Tuscany/Modena.
- Australia: large overlapping source regions, e.g. Bidjara/Dharawala ~31,092 km²
  and Gunggari/Bidjara ~23,997 km². These must not be interpreted as modern sovereign states.
- Africa: substantial unassigned mass, especially modern-source NGA/COD/TZA/BEN
  groups. Prefixes are diagnostic geographic origins, not historical ownership.
- Amazonia, Khiva and Dutch Brazil: excluded malformed features make coverage
  incomplete. No source geometry was repaired to force a complete map.
- North America: nine pairwise clipping diagnostics failed, including unnamed
  geometries. Atomic assignment itself completed without clipping failures.
- Netherlands/Spanish Habsburg/England/Savoy-Piedmont relationship labels do not
  all match NAMEs exactly. PARTOF also contains spelling variants (Scottalnd,
  Illinnois, Papous). They remain unresolved candidates, not inferred dependencies.
- Labels such as Post-Ming Warlords, Dutch Formosa, New Amsterdam, Austrian Empire
  and broad colonial coverage need independent chronology/meaning review for 1700.
  The filename and BORDERPRECISION=3 do not establish historical correctness.

## Audits and narrow foundation bug fix

Source audits: `source-provenance.json`, `source-schema.json` (complete unique
values), `source-inventory.json`, `source-overlaps.json`, `relationship-candidates.json`,
`proposed-polity-map.json`, `mapping-audit.json`, `excluded-source-features.json`,
`source-precision.json`, `preview-summary.json`, `frozen-hashes.json`.

`assignment/` contains the generic summary, polity summary, ambiguity/unassigned
lists, confidence buckets, full territory assignments and preview snapshots.
Inventory area uses the existing canonical area on unioned validated features;
raw feature area is separately labeled and excludes no raw rows from inspection.
Source precision by polity is separate from each atom's overlap confidence.

The first import exposed one concrete foundation validation bug:
`gb:AFG:17698898B34314103911118` has canonical area 21,655.5832265422 km²;
its Safavid intersection measures 21,655.587450955623 km² (relative excess
1.9507271531438164e-7). The canonical area transform measures vertices after
planar clipping; removing collinear vertices introduces this sub-ppm difference.
Across all 52,262 atoms, exactly one case exceeded the old tolerance, and no
atomic clipping failed. The validation tolerance alone increased from 0.1 ppm
to 1 ppm, retaining the existing 100% audit clamp. Assignment/ranking rules,
canonical area algorithm, geography and population are unchanged. A synthetic
regression reproduces the collinear-vertex case without copied GPL geometry.

Tests use synthetic GeoJSON, explicit mappings and isolated ignored folders.
They require neither a network connection nor the downloaded dataset.

Validation: all 8 new synthetic tests passed; full `npm test` passed all 181
tests in 8.3 minutes. Repeated global previews produced byte-identical bytes
for all 9 generic assignment output files. Canonical geography, hierarchy,
production population/meta, production political assets and the generic importer
remain byte-identical; their before/after hashes are in `frozen-hashes.json`.
