# Population Composition v1

HYDE supplies demographic mass. Composition is a derived authored scenario layer:
it assigns culture, religion, stratum and literacy without moving or changing a
single person between territories or rural/urban settlement. Monthly simulation,
source handling, allocation, topology and baseline metadata are unchanged.

The original `scenarios/1700/population.json` and its metadata are preserved
byte-for-byte under `data/population/baselines/1700/`. The adjacent manifest pins
the baseline SHA-256, hierarchy SHA-256, canonical geography SHA-256 and totals.
The generator always reads this original source, never its own composed output.
Keep these baseline artifacts immutable. Re-running the frozen HYDE importer can
recover the baseline independently; composition never invokes it.

## Authored data

`data/population/{cultures,religions,strata}.json` are arrays of `{id,name}` rows.
Every registry must contain `unclassified`; category names are data, not runtime
enums. The small starter set is illustrative, not a global historical dataset.
Stratum and settlement are independent: `commoner` can be rural or urban.

`scenarios/1700/population-composition.json` has `{version:1,rules:[...]}`.
The formal shape is in `data/population/population-composition.schema.json`;
the generator also checks registry membership, territory IDs, bounds and sums.
`data/population/composition-example.json` is a **synthetic demonstration**, not
historical evidence. It is excluded from the default production rules, which
are deliberately empty until composition is authored separately.

A rule has a unique ASCII-safe `id`, a `match` object, and one or more of
`cultureShares`, `religionShares`, `stratumShares`, `literacyBps`. All match
selectors combine with AND. Supported selectors:

- `territoryId`: exact canonical ID.
- `territoryIds`: nonempty explicit list of canonical IDs.
- `sourceCountry`: exact `gb:XXX:` prefix, e.g. `JPN`, including the colon boundary.
- `bbox`: `[west,south,east,north]`, inclusive bounds. West > east crosses the
  antimeridian. Membership uses the existing canonical `interior()` point of the
  largest polygon component, not polygon overlap or political ownership. Bbox
  generation loads exact canonical geometry and checks its hash/invariants.
- `settlement`: `rural` or `urban`.
- `stratumId`: a registered category, **only for literacy-only rules**. It is
  evaluated against the resulting child cohort after the three composition splits.

The `gb:XXX:` prefix is source-geography metadata, not 1700 sovereignty. It does
not cover `residual:` atoms; target those with explicit IDs/lists/bboxes/fallbacks.
Ownership and controllers are never read, so test RU/US ownership cannot affect
composition. Historical plausibility and gameplay utility take priority over
false census precision. No worldwide literacy figures or rates are inferred.

## Precedence and joint cohorts

For **each field separately**, geography specificity is:

1. Exact territory ID.
2. Explicit territory list.
3. Bbox + source country.
4. Bbox alone.
5. Source country.
6. Global fallback (`match:{}`).

At the same geography level, a settlement selector is more specific; for literacy,
a stratum selector further specializes the rule. A geographically narrower rule
still outranks a broader settlement/stratum rule. A rule only overrides fields it
defines. Rules of equal specificity that match the same population and disagree
on a field cause generation to fail, even if a higher-priority rule exists. Equal
values are allowed. Distribution key order and rule order have no effect.
Rules that match no nonzero population are reported as unused; matched includes
applicable rules whose values are overridden by a more specific rule.

Every supplied distribution is an object of registered ID -> integer basis points.
10000 means 100%. Sums must be **exactly 10000**; malformed data is rejected,
never normalized. Zero-weight categories are allowed and produce no cohorts.

Each original cohort is split by **culture, then religion, then stratum**. Each
split uses exact BigInt Hamilton apportionment; largest remainders receive the
remaining persons, with ascending ASCII category IDs breaking ties. With seven
persons and `a:5000,b:5000`, the result is `a:4,b:3`. Rounding is local to each
parent, so these are actual joint cohorts rather than independent marginal totals.
Small parents can lose low-share categories through integer rounding. Each input
count and every territory/settlement count is checked for exact conservation.

Missing dimensions become `unclassified`. Literacy is evaluated on each final
child; absent rules leave it `null` (unknown). Explicit null can override a broader
numeric value. No birth/death rates are assigned; existing runtime defaults apply.
Zero-count inputs produce no children. IDs are `p1700c-` plus 32 SHA-256 hex
characters of JSON `[territoryId,settlement,cultureId,religionId,stratumId]`.
Count, literacy, order, machine and timestamps do not affect IDs. Collisions fail.

## Regeneration and publication

From `D:\projects\Mandate\game`, generate a preview:

```powershell
node scripts/apply-population-composition-1700.cjs
```

This writes ignored `data/generated/population/1700/composed-population.json` and
`composition-summary.json`. After authoring and reviewing production rules:

```powershell
node scripts/apply-population-composition-1700.cjs --publish
```

`--publish` replaces **only** scenario `population.json`, after all validation,
mass checks and serialization succeed, using a flushed same-directory temp file
and atomic rename. Failed generation leaves existing population assets intact.
`population.meta.json` remains the frozen HYDE baseline report; its cohort counts
describe the source baseline, not the derived composition. Composition provenance
and output cohort counts are recorded in the composition audit. Default preview
does not alter either authoritative file. `--rules FILE`, `--output FILE`,
`--audit FILE`, `--baseline-dir DIR`, `--registries DIR`, `--hierarchy FILE` support
isolated authored data/tests; custom baselines need their own verified manifest
and are preview-only. Production publication requires the preserved 1700 baseline.
`--publish` and `--output` are mutually exclusive.

The audit reports input/output total, rural/urban mass, cohort counts, joint-cohort
aggregations by category, known/unknown literacy population, unique population with
any unclassified dimension, unclassified totals per dimension, matched/unused rule
IDs and SHA-256 provenance. It has no timestamps. Empty production rules intentionally
leave all 591,714,189 people unclassified with unknown literacy.
