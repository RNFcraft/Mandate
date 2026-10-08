# Mandate World 1700 on frozen Map v2

Normal http://127.0.0.1:3000/?scenario=1700 loads the published Mandate World scenario. No politicalPreview parameter is needed. This is a gameplay-oriented, historically recognizable starting setup with intentionally simplified borders and entities. No historical-basemaps polygons or assignments are inputs.

Existing independent atomic authoring is retained: 167 polity IDs and metadata, 329 rules, 41 relationships and eight strategic atomic anchors. Atomic geometry serves offline authoring/provenance only. Runtime authority is mandate-provinces-v1, 5,001 stable province:XXXXX IDs, scenario v4. There are no added administrative states, economy, war or political mechanics.

## Projection and publication

Run node --max-old-space-size=8192 scripts/generate-mandate-world-1700.cjs for preview; add --publish to replace the production scenario. The existing generator/publisher implements validation, complete staged folder, file sync, replacement and rollback. It preserves population, meta and composition bytes. Frozen map artifacts and the atomic population baseline are hash-guarded. No partitioning, mapping, coastline, adjacency or manifest regeneration is involved.

The shared province projection sums positive atomic overlap area by polity, including unassigned/null candidates. Maximum area wins; ties use ASCII polity ID order. Controllers use existing effective controller projection; all current published controllers equal owners (empty difference map). Province candidates and shares are retained for QA. Ambiguity triggers include runner share >=15% with winner margin <=20%, multiple candidates >=10%, anchor conflicts, all-neighbor isolation and nearby small disconnected fragments. Every explicit correction remains in ambiguity QA even after its structural problem is fixed.

scenarios/1700/province-political-authoring.json contains the data-driven overrides and capital anchors. Each correction has an exact province ID and reason. Current corrections:

- province:00001 -> timor_polities: Timor continuity: remove the detached Mataram province caused by the modern Indonesian sourceCountry proxy; retain the existing Timor polity across the frozen island.
- province:01735 -> circassian: Coarse-province coastal Caucasus continuity: joins the authored Anapa fragment to the existing Circassian mainland through its only intervening province. Dominant Russian proxy overlap (81.2%) is deliberately superseded; Circassian candidate share is 18.8%. Gameplay correction, not a precise historical border.
- province:02312 -> tibet: Himalayan frontier: remove the isolated Mughal province north of its land-connected territory; adopt the substantial Tibetan overlap candidate and retain the existing simplified mountain polity.
- province:03840 -> peru: Fill the inhabited Panama authoring omission using the existing Spanish Peru/Colombia gameplay bloc; no new polity or modern-border claim.
- province:03842 -> peru: Complete the inhabited Panama corridor with the existing Spanish Peru/Colombia gameplay bloc; no geometric change.

## Coverage and QA

| Measure | Published result |
|---|---:|
| Registered / active polities | 167 / 160 |
| Assigned / unassigned provinces | 4,946 / 55 |
| Assigned / unassigned people | 591,713,514 / 675 |
| Population coverage | 99.999885925% |
| Assigned / unassigned land km2 | 134,439,224.956 / 12,281,248.717 |
| All-land coverage | 91.629492184% |
| Relevant inhabited land coverage | 99.991361374% |
| Ambiguous provinces | 1,050 |
| Province corrections | 5 |
| Disconnected polities | 57 |
| All-neighbor isolation / suspicious mainland review | 17 / 2 |
| Owned capitals / validation failures | 160 / 0 |

Relevant inhabited land means frozen gameplay provinces with runtime population >0. Antarctica and remote zero-population islands remain null. The 675 unassigned baseline people belong to two Falkland provinces; no demographic or ownership adjustment is made merely to reach 100%. Population is unchanged: total 591,714,189, urban 46,409,598, rural 545,304,591, 9,113 cohorts.

Relationships retain existing types and references: 24 colonial_dependency, 2 personal_union, 11 subject_of, 4 tributary_of. No occupation is invented.

The following seven registry entries have no standalone province after projection: brunei, danish_caribbean, dutch_caribbean, macao_portuguese, maldives, malta_order, ragusa. Their metadata and relationships remain intact; capital is null. Assigning an entire large province/archipelago solely to retain a tiny polity would distort this fixed-scale map.

Twenty-nine explicit major city anchors choose the containing owned province, or a nearest-owned centroid fallback when the coastal clean mask excludes the point. Copenhagen and Quebec use this documented fallback. Other active polities receive the largest-population owned gameplay seat, with area and ASCII tie breaks; this is not a precise historical capital claim. Published scenario initialization preserves only existing, owned province capitals.

Mandatory anchors:

| Anchor | Polity | Province |
|---|---|---|
| Paris | fra_bourbon | province:01266 |
| Vienna | habsburg | province:01333 |
| Amsterdam | nld_republic | province:01376 |
| Rome | papal | province:01221 |
| Beijing | qing | province:03354 |
| Moscow | rus_tsardom | province:01846 |
| Edo | tokugawa | province:04938 |
| Venice | venice | province:01311 |

Largest by area: Russian Tsardom 15,516,877.746 km2; Qing 7,629,883.187; Peru 6,500,496.156. Largest by population: Mughal 144,639,435; Qing 99,227,800; Tokugawa 25,518,201. Largest by province count: Qing 508; Russia 398; Mughal 286. These are owner aggregates of the unchanged gameplay baseline, not independently researched national population estimates.

Audit output under data/generated/political-geography/1700/mandate-world-v1/ is ignored and regenerated offline. Files with province- prefix include summary, polity-summary, largest-polities, border-adjacencies, ambiguous, isolated, connectivity, tiny-polities, unassigned, overrides, capitals, relationships, assignments and political-geography JSON. Existing atomic audit outputs remain for provenance. The atomic source-country artifact audit exposes 198 proxy cases; zero province source-country warnings reflects the province hierarchy having no ADM fields, not proof of historical accuracy. Published political-province-qa.json provides the tracked summary for a clean checkout.

## Visual review and remaining limitations

scripts/capture-mandate-world-provinces.cjs captures the normal scenario at DPR2, 1600x1000 CSS / 3200x2000 PNG, with browser errors and network requests in screenshots/browser-smoke.json. All 32 views were inspected on 2026-10-08:

world, europe, hre, italy, balkans, baltic, scandinavia, british_isles, iberia, russia, ukraine_crimea, caucasus, middle_east, india, bengal, china, tibet_dzungaria, japan, central_asia, southeast_asia, indonesia, philippines, north_america, caribbean, mexico, south_america, africa, north_africa, west_africa, horn_africa, southern_africa, oceania.

Each PNG is data/generated/political-geography/1700/mandate-world-v1/screenshots/<view>.png. All sixteen requested views are included. The map uses shared province edges for international borders only when owners differ; the existing optional province grid remains a separate thin layer. No atomic political worker requests occur.

Remaining editorial border regions: simplified HRE and Baltic blocks, Caucasus/steppe edge, Himalayan frontier, Borneo micro-holdings, North American colonial/indigenous frontier, broad African proxy blocs and southern South American colonial reach. Existing simplifications are retained rather than inventing a new historical model. Two generic isolate reviews remain: Bangka's island case and an indigenous North American frontier province. Disconnected components include legitimate islands, colonies and separated holdings; the audit does not equate disconnection with an error. Tiny/zero-province polities and two coastal capital fallbacks are explicit scale limitations.

## Validation

Repeated actual production publication produced byte-identical hashes for nine political/runtime outputs. Synthetic and real temporary-folder tests check deterministic projection/publication, preservation of frozen map and population assets, rejection before replacement, polity/province/controller references, owned capitals, relationship retention, normal browser registry/colors and absence of atomic requests. Existing political-border mesh tests verify equal-owner edges disappear and ownership changes rebuild borders. Validation on 2026-10-08: targeted Mandate World, political geography and province runtime tests passed 35/35; full npm test passed 212/212 (8.7 minutes), including the actual normal political border mesh comparison. Normal browser smoke passed with 167 registered polities, 5,001 provinces, 160 owned capitals, unchanged population and no page errors or atomic/ADM2 political requests. No commit or push was made.
