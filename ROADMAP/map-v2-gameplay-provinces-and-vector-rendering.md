# Mandate — Map v2: Gameplay Provinces, Regions & Vector Rendering

> Status: high-priority roadmap item  
> Scope: replace the current tiny gameplay-territory experience with a larger HoI4-like province layer while preserving the existing high-resolution atomic geography underneath  
> Priority: do this before continuing deeper economy implementation

## 1. Why Map v2 is needed

The current map uses a very fine atomic territorial mesh.

That mesh is useful internally, but it is too fragmented for normal gameplay.

Problems with using the current atomic territories directly as gameplay territories:

- too many tiny territories;
- many shapes follow modern administrative/city boundaries;
- geometry can look irregular and visually noisy;
- map interaction becomes tedious;
- future economy, warfare, logistics and infrastructure would become unnecessarily heavy;
- modern administrative borders visually leak into a historical world;
- the current rendering can look pixelated / low quality at some zoom levels.

The goal is **not** to throw away the existing map.

The goal is to introduce a proper gameplay geography layer above it.

---

## 2. New geographic hierarchy

The planned hierarchy is:

```text
CANONICAL ATOMIC MESH
~52k small polygons
technical internal layer

        ↓ aggregation

GAMEPLAY PROVINCES
normal playable territories
HoI4-like scale

        ↓ grouping

STATES / REGIONS
larger administrative/economic groups
```

Each layer has a different purpose.

---

## 3. Atomic mesh remains

The existing ~52k atomic territories should **not be deleted**.

They remain the canonical high-resolution geographic substrate.

They are useful for:

- historical population allocation;
- HYDE population data;
- procedural geology;
- resource basin intersection;
- land area;
- coastline precision;
- spatial calculations;
- data import;
- future environmental layers;
- precise ownership aggregation when needed;
- scenario migration.

The key change is:

> Atomic territories are no longer the primary gameplay territories.

They become mostly invisible technical geography.

---

## 4. Gameplay provinces

The smallest normal player-facing territory should become a **gameplay province**.

A gameplay province is made from multiple adjacent atomic territories.

Provinces should be:

- contiguous;
- reasonably compact;
- readable on the map;
- large enough to avoid micro-territory spam;
- stable between campaigns;
- independent from current political ownership.

They should resemble the scale and usability of provinces in grand-strategy games such as HoI4 rather than modern municipal/county boundaries.

---

## 5. Province-size philosophy

Province density should depend on geography and gameplay value.

### More detailed areas

More and smaller provinces are appropriate in:

- Europe;
- dense parts of China;
- India;
- Japan;
- heavily populated agricultural regions;
- strategically dense coastal areas.

### Larger provinces

Much larger provinces are appropriate in:

- Siberia;
- Sahara;
- interior Canada;
- Central Asian deserts;
- sparsely populated interior Australia;
- other remote low-density regions.

The result should not be uniform global subdivision.

---

## 6. Province shape rules

Province generation / authoring should aim for:

- connected shapes;
- relatively clean boundaries;
- no tiny detached fragments unless geographically necessary;
- no ridiculous long thin corridors;
- no micro-polygons created only because of modern cities;
- sensible island handling;
- preserved coastlines;
- reasonable strategic shapes.

Where possible, boundaries may consider natural geography such as:

- rivers;
- mountain ranges;
- coastlines;
- major desert transitions.

However, the goal is gameplay readability, not perfect physical-geography reconstruction.

---

## 7. Provinces must be stable

Gameplay province geometry should be a **fixed part of Mandate's base world**, not procedurally regenerated each campaign.

Why:

- saves need stable territory IDs;
- scenarios need stable references;
- historical starts need stable mappings;
- AI and warfare need stable geography;
- economy and infrastructure need stable spatial anchors;
- debugging and testing need reproducibility.

Resource geology may be randomized by campaign seed.

Gameplay province geography should not be.

---

## 8. States / regions

Above provinces, create larger **states / regions**.

These are groups of gameplay provinces.

Possible later uses:

- administration;
- economic statistics;
- taxation;
- infrastructure programs;
- population summaries;
- regional policy;
- construction;
- political organization;
- military logistics.

The exact state/region mechanics are deferred.

The important architectural point is:

```text
atomic cells
→ provinces
→ states / regions
```

---

## 9. Modern borders must disappear from the political map

Modern ADM0 / ADM1 / ADM2 borders should **not** appear as historical political borders.

Modern source geography may remain internally for provenance and data processing.

For example:

```text
gb:XXX
```

can remain as technical source metadata.

But the player-facing political map must not reveal the skeleton of 20th/21st-century administrative geography.

---

## 10. Political borders come from ownership

Political borders should be derived dynamically from province ownership.

Basic rule:

```text
if owner(A) == owner(B)
→ no political border between A and B

if owner(A) != owner(B)
→ draw political border
```

Example:

```text
Province A → France
Province B → France
Province C → Spain

A/B:
no international border

B/C:
France–Spain border
```

Political borders should therefore reflect the actual current game state, not baked-in source boundaries.

---

## 11. Internal province borders

Internal gameplay-province borders may still exist visually, but they should be subordinate to political borders.

Possible behavior:

- hidden at far zoom;
- subtle at medium zoom;
- visible at close zoom;
- thinner and less prominent than international borders.

They should never visually dominate the political map.

---

## 12. Dynamic ownership

Province geometry is fixed.

Ownership is dynamic.

```text
province geometry
= stable

province owner
= mutable
```

Wars, revolutions, annexations, collapses and unions should change ownership/state membership without redrawing the underlying province geometry.

This allows political history to diverge freely while keeping stable spatial references.

---

## 13. Vector rendering requirement

The map should use a proper **vector rendering pipeline**.

The goal is to eliminate visible pixelation / raster-like degradation.

Desired rendering pipeline:

```text
canonical vector geometry
→ shared arcs / compact vector representation
→ WebGL-compatible vector renderer
→ anti-aliased display
→ devicePixelRatio-aware rendering
```

The coastline and borders should remain crisp during zoom.

The map should not rely on stretched bitmap textures for political geometry.

---

## 14. Do not use SVG as the main global map renderer

SVG may still be useful for UI or small diagrams.

For the main world map, the preferred architecture is a performant vector pipeline such as:

```text
TopoJSON / shared arcs
→ WebGL rendering
```

Reasons:

- better performance with large world geometry;
- efficient zoom/pan;
- cleaner boundary handling;
- suitable for thousands of provinces;
- avoids DOM overload.

---

## 15. Shared topology remains important

Province boundaries should share canonical arcs where possible.

Benefits:

- no cracks between polygons;
- consistent borders;
- smaller data size;
- easier political-border generation;
- deterministic rendering.

The existing shared-topology work should be reused rather than discarded.

---

## 16. Aggregation of existing data

Existing data should be preserved and aggregated into gameplay provinces.

### Population

```text
atomic population
→ sum into gameplay province
```

### Resources

Future resource geology may intersect atomic cells.

```text
atomic/resource intersections
→ aggregate into province-facing values
```

### Ownership

Historical/political assignment should ultimately resolve to gameplay provinces.

Temporary atomic ownership can be aggregated or migrated.

### Area

```text
atomic area
→ province area
```

The atomic mesh remains the high-resolution source of truth where useful.

---

## 17. Gameplay-facing map levels

A practical visual hierarchy may become:

```text
far zoom
→ country colors + international borders

medium zoom
→ gameplay provinces + major regional detail

close zoom
→ province borders + settlements / infrastructure / local overlays
```

Modern administrative source borders should not appear in this hierarchy.

---

## 18. Map v2 priority

Map v2 should be completed **before deeper economy work continues**.

Reason:

future systems will depend heavily on territorial scale:

- markets;
- enterprise locations;
- roads;
- railways;
- ports;
- resources;
- military movement;
- logistics;
- construction;
- population summaries.

It is better to establish the correct gameplay geography now than migrate all later systems afterward.

---

## 19. Proposed implementation order

```text
1. Define Gameplay Province layer
   atomic mesh → larger playable provinces

2. Build stable province IDs and adjacency

3. Build States / Regions layer
   provinces → larger groups

4. Migrate/aggregate existing data
   population
   ownership
   area
   future resource hooks

5. Remove modern administrative borders
   from political rendering

6. Derive political borders
   from dynamic ownership only

7. Clean up vector rendering
   crisp anti-aliased geometry
   no visible pixelation

8. Add zoom-dependent province/internal borders

9. Validate map visually and structurally

10. Freeze Map v2 geography

11. Resume economy implementation
```

---

## 20. Decisions considered settled

1. The existing ~52k atomic territories remain as an internal technical layer.
2. Atomic territories are no longer the intended primary gameplay territory.
3. A new gameplay-province layer will be introduced.
4. Gameplay provinces will be much larger and more readable.
5. Province scale should vary by population/geography rather than being globally uniform.
6. Province geometry should be fixed and stable between campaigns.
7. Provinces group upward into states/regions.
8. Modern administrative borders must not define the visual political map.
9. Political borders are derived from current ownership.
10. Same-owner neighboring provinces should not have an international border between them.
11. Internal province borders should be visually subordinate.
12. Ownership changes dynamically while province geometry remains stable.
13. Existing atomic population/geographic work must be preserved through aggregation.
14. Future procedural resources can still use the atomic layer internally.
15. The player-facing map should use a proper vector rendering pipeline.
16. Visible pixelation should be eliminated.
17. WebGL/vector rendering is preferred for the full world map rather than an SVG-only global renderer.
18. Shared topology/arcs should be retained where practical.
19. Map v2 becomes the next high-priority technical milestone before deeper economy work.
20. Gameplay provinces are generated from the atomic adjacency graph using weighted seeds plus connected graph growth, not simple centroid clustering.
21. Target scale is around 12,000 land provinces, with roughly 10,000–15,000 accepted during tuning.
22. Generation includes an automatic repair/cleanup phase followed by limited manual or semi-automatic correction.
23. Tiny islands do not automatically become standalone gameplay provinces; archipelago MultiPolygon provinces are allowed.
24. Final neighboring province polygons must use shared canonical boundary arcs.
25. Gameplay province ownership becomes the primary political ownership authority; atomic ownership is derived where needed.
26. States/regions are built after provinces, usually from roughly 5–20 neighboring gameplay provinces.
27. Final province IDs, mappings, adjacency and topology are frozen only after visual and structural validation.

---

## 21. Intentionally deferred

Not yet fixed:

- exact final gameplay province count inside the agreed ~10k–15k working range;
- exact numeric coefficients for province-size weighting and compactness;
- exact state/region count;
- exact natural-boundary weighting once river/mountain data is integrated;
- exact LOD thresholds;
- exact renderer library/engine;
- exact line widths and map styling;
- exact terrain overlay behavior;
- exact settlement icon system;
- exact infrastructure rendering.

These should be decided during implementation and visual review.

---


## 22. Gameplay province generation — settled approach

The base gameplay map should be authored automatically from the existing atomic mesh and then cleaned/frozen.

Target scale:

- roughly HoI4-like gameplay readability;
- target around **12,000 land gameplay provinces worldwide**;
- acceptable working range roughly **10,000–15,000** while tuning;
- the final count is determined by visual/geographic quality rather than by hitting one exact number.

The generation pipeline is:

```text
atomic topology
→ atomic adjacency graph
→ density / scale weighting
→ seed placement
→ connected region growth
→ cleanup / repair
→ shared-boundary topology rebuild
→ topological simplification
→ visual + structural validation
→ manual / semi-automatic cleanup of bad cases
→ stable IDs
→ freeze
```

### 22.1 Atomic adjacency graph

Every atomic cell becomes a graph node.

Normal graph edges exist only where two atoms share a real land boundary.

Each node carries at least:

- atomic ID;
- area;
- population;
- population density;
- centroid;
- coastline / island status;
- current geometry/topology references;
- future optional terrain / natural-boundary attributes.

This graph is used for province construction.

### 22.2 Province-size weighting

Province size is intentionally non-uniform.

Dense, strategically important geography should produce smaller provinces.

Sparse geography should produce much larger provinces.

The first implementation should use a compact weighting model based mainly on:

- population;
- population density;
- land area;
- coastline / island context;
- compactness of the growing province.

Natural barriers such as rivers and mountains may later be added as boundary-cost modifiers, but they are not required for the first usable generation pass.

The practical result should be:

```text
Europe / India / dense China / Japan
→ many smaller provinces

Siberia / Sahara / interior Canada / Australia
→ fewer much larger provinces
```

### 22.3 Seed placement

Generation starts from province seeds.

Seeds should be distributed with weighted farthest-point / spacing logic rather than random placement.

Dense regions receive more seeds.

Sparse regions receive fewer seeds.

Important settlements may be preferred as seed anchors where settlement data is available, but the algorithm must still work without requiring settlement seeds everywhere.

### 22.4 Connected graph growth

After seed placement, provinces grow across the atomic adjacency graph.

An atom may be assigned only through adjacency to its growing province.

The growth cost should prefer:

1. reaching the target local province scale;
2. compact shapes;
3. short/shared borders;
4. avoiding long thin corridors;
5. avoiding tiny enclaves or detached fragments;
6. respecting coastline/island structure.

This guarantees that normal mainland gameplay provinces are connected by construction.

The generator should not simply group atoms by nearest centroid.

### 22.5 Cleanup and repair pass

The first graph partition is not considered final.

A repair pass must detect and fix:

- provinces below minimum useful size;
- one-atom slivers;
- narrow spikes;
- long thin corridors;
- isolated fragments;
- accidental holes;
- excessive numbers of polygon components;
- suspiciously tiny borders;
- pathological compactness;
- topology errors.

Bad atoms are reassigned to the most suitable neighboring province.

This pass may run repeatedly until structural checks pass.

### 22.6 Islands and archipelagos

A tiny island does **not** automatically become a gameplay province.

Island handling uses separate rules:

- large islands may contain multiple normal provinces;
- medium islands may become one province;
- nearby small islands may be grouped into one archipelago province;
- a gameplay province may therefore be a MultiPolygon;
- microscopic islets may remain geographic geometry without becoming independent clickable gameplay units;
- tiny islets may disappear at distant LOD while remaining in canonical geography.

For island grouping, a separate maritime-grouping relation may be used.

This relation is only for province membership and must not be confused with normal land adjacency or army movement.

The goal is to eliminate the current "spray of tiny clickable dots" problem.

### 22.7 Province geometry is rebuilt after membership

Atomic membership remains the high-resolution data basis.

The player-facing province polygon is generated after grouping:

```text
member atomic cells
→ union
→ shared province boundaries
→ topology repair
→ topological simplification / smoothing
→ final vector geometry
```

Neighboring provinces must share the **same canonical boundary arc**.

Two independently simplified copies of the same border are not allowed.

This prevents:

- cracks;
- overlaps;
- double borders;
- mismatched vertices;
- visible gaps.

### 22.8 Internal borders vs coastlines

Internal province borders may be cleaned and simplified relatively strongly for readability.

Coastlines must be treated more conservatively so islands and shorelines remain recognizable.

Simplification must be topology-preserving.

The gameplay boundary does not need to reproduce every tiny bend inherited from modern administrative source polygons.

### 22.9 Atomic geometry remains underneath

The cleaned gameplay province geometry does not replace the atomic substrate.

Atomic membership remains authoritative for high-resolution data aggregation.

Examples:

```text
population:
atomic cohorts → province aggregate

resource geology:
atomic intersections → province aggregate

area:
atomic area → province aggregate
```

This means visual cleanup of province borders does not destroy the original HYDE/population/resource work.

### 22.10 Authority of the geographic layers

After migration, gameplay authority should be:

```text
ATOMIC CELL
internal spatial/data substrate
population allocation
geology
precise source geometry
provenance

GAMEPLAY PROVINCE
primary playable spatial unit
owner / controller
war and movement
infrastructure
settlements
enterprises
resource exploitation
province-facing population
local construction

STATE / REGION
administrative/economic grouping
regional statistics
tax / policy aggregation
large programs and projects
```

Gameplay political ownership should ultimately live on the **gameplay province**.

Atomic ownership should not remain an independent competing gameplay authority; where needed it is derived from the parent province.

### 22.11 States / regions

States / regions are generated only after gameplay provinces are stable.

They use a second adjacency graph whose nodes are gameplay provinces.

Initial guideline:

- usually around **5–20 neighboring provinces per state/region**;
- size may vary substantially by geography;
- states must remain contiguous except where island geography reasonably requires MultiPolygon grouping;
- exact global state count is not a target by itself.

States are a larger administrative/economic layer, not the minimum military or ownership unit.

### 22.12 Automatic validation

The generator should produce a machine-readable QA report.

At minimum validate:

- every atomic cell belongs to exactly one gameplay province;
- no mainland province has disconnected components;
- no invalid polygon rings;
- no overlaps between gameplay provinces;
- no gaps produced by internal boundaries;
- shared borders resolve to shared topology;
- adjacency is symmetric;
- minimum/maximum scale outliers are reported;
- extreme compactness outliers are reported;
- microscopic standalone island provinces are reported;
- total province count is within the intended working range.

### 22.13 Manual / semi-automatic cleanup

The map is not expected to become final from one completely automatic pass.

The intended authoring workflow is:

```text
generate
→ inspect
→ flag bad provinces
→ reassign one or more atomic cells
→ rebuild local topology
→ validate again
```

Only exceptions and ugly cases should require manual intervention.

The entire world should not be hand-drawn.

### 22.14 Stable IDs and freeze

During generation, temporary province IDs may change.

After visual and structural approval:

- assign stable permanent gameplay province IDs;
- assign stable state/region IDs;
- save the atom → province mapping;
- save province → state mapping;
- save adjacency;
- save canonical final vector topology;
- freeze Map v2 geography.

After freeze, campaigns and scenarios use the same province geometry and IDs.

Political ownership, resources, population and history may change.

The underlying gameplay province layout does not.

---


## Short summary

The new map architecture should be:

```text
52k ATOMIC CELLS
high-resolution technical substrate
hidden from normal gameplay

        ↓

GAMEPLAY PROVINCES
clean, larger, HoI4-like playable territories

        ↓

STATES / REGIONS
larger administrative/economic units

        ↓

DYNAMIC POLITICAL OWNERSHIP
country color + ownership-derived borders

        ↓

VECTOR / WEBGL RENDERING
crisp geometry with no pixelated political map
```

The world map remains geographically the same Earth, but the player interacts with a clean, stable and readable gameplay subdivision rather than thousands of tiny modern-administrative fragments.
