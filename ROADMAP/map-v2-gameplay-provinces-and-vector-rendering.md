# Mandate — Map v2: frozen gameplay geography

Status: freeze and runtime integration implemented on 2026-10-08. Accepted geometry has **5,001 provinces**, geography `mandate-provinces-v1`, geometry version 1. [Implementation and verification](../docs/map-v2-runtime.md).

Province geometry is an independent partition inside dissolved Natural Earth land. Smoothed population influences target mass. Atomic polygon borders do not determine province borders. Islands may share a province without fabricated connecting land. Adjacent provinces share topology arcs; coastline uses the canonical land mask.

`mandate-atomic-v1` remains internal offline geography for population and historical authoring. Spatial overlap maps atomic data into provinces. Owner/controller select greatest positive overlap area with ASCII ties; population uses largest remainder per cohort, preserving identity and exact totals. Stable `province:XXXXX` IDs replace preview IDs without moving vertices or changing arcs.

Tracked topology, hierarchy, adjacency, metadata, mapping, QA and manifest form the frozen artifact. Manifest records source hashes, tuning, seed, geometry version and artifact hashes. Generation writes a separate preview directory and refuses frozen destinations. Geometry changes require a future explicit versioned migration.

Ordinary gameplay, scenario v4, GameState v2, saves v2 and cohorts use provinces as territorial authority. Atomic saves/states are rejected. Active 1700 and modern scenarios are migrated; historical backups remain offline sources. Normal startup builds the client only and requires no ignored GIS intermediates or ADM2 chunks.

The browser fills provinces and compares legal owner across shared edges for political borders. Same-owner edges are suppressed at world zoom. Controller does not change the legal border. Canvas has a DPR-aware backing store capped at 2 and antialiased display. Preview and explicit atomic debug are separate entry points; atomic debug creates no gameplay state.

**States/regions are not implemented.** A future optional aggregation must reference province IDs and derive display borders from shared topology. It must preserve province territorial authority.

Remaining work: historical 1700 ownership/composition authoring, possible versioned geography improvements after explicit review, and future gameplay systems. Economy, resources, production and logistics are outside this integration. Current 1700 RU/US DEV ownership and neutral remainder are preserved rather than invented.

CI installs locked dependencies on Node 24 and checks tracked runtime, simulation, population, preview, freeze integrity and startup without ignored GIS assets. Full local tests additionally validate the retained offline atomic GIS pipeline against prepared source data.
