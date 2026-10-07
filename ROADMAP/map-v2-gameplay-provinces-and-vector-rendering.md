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

---

## 21. Intentionally deferred

Not yet fixed:

- exact number of gameplay provinces;
- exact province-generation algorithm;
- whether final province layout is fully procedural-authoring, semi-automatic, or manually cleaned;
- exact state/region count;
- exact natural-boundary weighting;
- exact LOD thresholds;
- exact renderer library/engine;
- exact line widths and map styling;
- exact terrain overlay behavior;
- exact settlement icon system;
- exact infrastructure rendering.

These should be decided during implementation and visual review.

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
