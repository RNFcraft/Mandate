# Mandate — Resource Geography & Natural Resources Plan

> Status: planning draft for early playable versions  
> Scope: natural-resource layer and its relation to future economy systems  
> Campaign horizon: 1700–2200  
> Priority: gameplay, emergent simulation, and internal consistency over exact historical reconstruction

## 1. Design goal

Mandate should not model only the resources that were economically important in 1700.

The physical world generated at campaign start should already contain the full set of natural resources that may become economically or strategically important at any point during the 1700–2200 campaign.

A resource may physically exist for centuries before society:

- knows that it is there;
- understands what it is;
- has a use for it;
- has the technology to extract it;
- has enough demand to make extraction worthwhile.

The resource layer therefore represents physical reality first, not the current economy.

The core separation is:

```text
GEOLOGY
what physically exists

KNOWLEDGE
what people know about it

EXPLOITATION
what people are able and willing to extract/use
```

This separation is fundamental.

---

## 2. Procedural resource world for early versions

For the first playable versions, Mandate does **not** need historical real-world geology.

Instead, every new campaign generates its own deterministic resource world.

```text
new campaign
→ choose/generate resource seed
→ generate physical geology
→ generate starting knowledge/exploitation state
→ store everything in GameState/save
→ never regenerate physical geology during the campaign
```

The same seed must always reproduce the same geological world.

Once generated, resource geography is permanent for that campaign.

There is no adaptive spawning of resources later. If oil does not physically exist in a territory, the simulation must not create oil there because the economy needs it.

The world may discover resources later, but the physical resource itself existed from the first tick.

---

## 3. Geological plausibility, not uniform random noise

Generation should be random by seed but constrained by resource-specific geological rules.

Do **not** independently roll resource amounts for every atomic territory.

Instead, generate larger geological structures first:

- basins;
- belts;
- clusters;
- provinces;
- rich cores;
- poorer margins.

Examples:

```text
coal
→ large sedimentary basins

oil / gas
→ hydrocarbon basins

iron
→ belts and large ore regions

copper / gold / uranium
→ more localized belts, clusters and ore provinces
```

The exact geology does not need to reproduce Earth, but it should produce believable large-scale patterns.

This gives each campaign a different economic geography while preserving internal logic.

---

## 4. Resource classes

Natural resources should be divided into three broad physical classes.

### 4.1 Finite / non-renewable stocks

These are physically limited and permanently depleted by extraction.

Examples include:

- coal;
- lignite;
- peat where modeled as a geological stock;
- crude oil;
- natural gas;
- iron ore;
- copper ore;
- tin;
- lead;
- zinc;
- nickel;
- bauxite / aluminium ore;
- manganese;
- chromium;
- cobalt;
- lithium;
- uranium;
- thorium;
- tungsten;
- molybdenum;
- titanium ores;
- gold;
- silver;
- platinum-group metals;
- rare-earth resources;
- phosphate rock;
- potash;
- sulfur;
- salt;
- graphite;
- other economically meaningful industrial minerals.

The exact resource registry can be expanded over time.

The architectural goal is to support **all economically or strategically distinct natural resources relevant to 1700–2200**, not merely resources used at game start.

This does **not** mean modeling every mineral species from a geology textbook. Resources that are economically interchangeable and do not create distinct gameplay may be grouped.

### 4.2 Renewable stock resources

These regenerate but can be depleted or degraded by overuse.

Examples:

- forests;
- fish stocks;
- soil fertility;
- pasture;
- wildlife;
- freshwater stocks where useful to gameplay.

Conceptually:

```text
current stock
+ natural regeneration
- exploitation
= future stock
```

Possible outcomes include sustainable use, degradation, collapse, and recovery.

### 4.3 Renewable flow resources

These are not depleted in the normal sense by use.

Examples:

- solar potential;
- wind potential;
- river / hydropower potential;
- tides;
- geothermal potential.

Their limits come from:

- geography;
- available natural flow;
- technology;
- installed capacity;
- infrastructure;
- transmission or transport.

These should **not** be represented as tonnage stocks.

---

## 5. Units

For material resources, especially finite geological resources, the simulation can use **tonnes** as the common base physical unit.

Examples:

```text
coal       → tonnes
iron ore   → tonnes
copper ore → tonnes
uranium    → tonnes
crude oil  → tonnes internally
gas        → mass-equivalent tonnes internally
```

The UI can later display conventional real-world units where useful, such as barrels or cubic metres, without changing the simulation's underlying stock representation.

Renewable material stocks such as forests or fish can also use tonnes where appropriate.

Renewable flows such as wind, solar and river flow require potential/flux/capacity-style units instead.

---

## 6. Resource Basin / Belt as the core geological object

Finite resources should primarily be generated as coherent geological structures rather than isolated per-territory deposits.

The core object is a **Resource Basin / Belt**.

A basin or belt may cross many atomic territories.

### Core properties

```text
Resource Basin / Belt

identity:
- id
- resourceType

geometry:
- position / shape
- length
- width
- thickness

geology:
- concentration
- burialDepth
- extractability

stock:
- initialAmount
- remainingAmount
- extractedAmount
```

### 6.1 Length

Approximate longitudinal extent of the geological structure.

### 6.2 Width

Approximate transverse width.

### 6.3 Thickness

Thickness of the resource-bearing layer or ore body.

This is **not** the same as depth below the surface.

### 6.4 Concentration

How much useful resource exists relative to surrounding material or reservoir volume.

Its physical interpretation depends on the resource.

Examples:

- metallic ore: ore grade;
- coal: useful concentration/quality abstraction of the seam;
- oil/gas: reservoir saturation/productivity abstraction.

The simulation can use a normalized or resource-specific representation.

### 6.5 Burial depth

Depth from the surface to the resource-bearing structure.

This directly affects accessibility and future extraction economics.

### 6.6 Extractability

A separate geological difficulty parameter.

It can abstract:

- rock conditions;
- water;
- pressure;
- geological complexity;
- accessibility;
- other physical extraction difficulties.

**Concentration and extractability must remain separate.**

A resource body can be:

- rich but difficult to extract;
- poor but easy to extract;
- rich and easy;
- poor and difficult.

### 6.7 Initial amount

The total physical stock generated once at campaign creation.

Conceptually:

```text
geological volume
× concentration
× resource-specific physical coefficients
```

Exact formulas are deferred until implementation.

### 6.8 Remaining amount

Physical material still present.

```text
remainingAmount =
initialAmount - extractedAmount
```

### 6.9 Extracted amount

Cumulative physical extraction since campaign start.

---

## 7. Do not duplicate basin properties

Avoid redundant primary simulation variables such as:

- `quality`;
- `richness`;
- `difficulty`;
- `sizeClass`.

Those ideas can be derived from primitive properties.

```text
richness
→ concentration

difficulty
→ burialDepth + extractability

size
→ length + width + thickness

physical stock
→ initialAmount
```

Labels such as *small*, *giant*, *rich*, *poor*, *easy* or *difficult* may later be generated for UI readability, but they should not replace the underlying continuous values.

---

## 8. Internal variation inside a basin

A basin or belt must not be perfectly uniform.

Its properties should vary spatially.

Possible internal variation:

- richer core;
- poorer margins;
- changing thickness;
- changing burial depth;
- changing extractability;
- local high-grade zones.

Conceptually:

```text
basin skeleton
→ concentration field
→ thickness field
→ burial-depth field
→ extractability field
→ atomic-territory intersections
```

This allows two territories inside the same geological structure to have very different economic value.

It also means discovering one edge of a basin does not automatically reveal the size or richness of the entire structure.

---

## 9. Basin projection into atomic territories

The geological basin is the coherent physical structure.

Atomic territories receive the local part of that structure where they intersect it.

Example:

```text
Coal Basin A
├─ territory X: 120 million t, shallow, rich
├─ territory Y: 80 million t, deeper
├─ territory Z: 15 million t, poor edge
└─ ...
```

These are **not** unrelated independent deposits.

They are local slices of the same generated geological object.

This territorial projection is needed so later systems can reason about:

- ownership;
- infrastructure;
- extraction locations;
- taxation;
- occupation;
- transport;
- local employment;
- local environmental effects.

The exact projection algorithm is deferred until implementation.

---

## 10. Size and richness generation

The underlying simulation should use continuous numerical values rather than fixed classes such as `small / medium / giant`.

Each resource type should have its own generation profile and statistical distributions.

The broad desired pattern is:

```text
many small structures
fewer medium structures
few large structures
very rare giant structures
```

Likewise for concentration:

```text
ordinary grades      → common
rich grades          → less common
exceptional grades   → very rare
```

Size and concentration should **not** be hard-coupled.

Valid outcomes include:

- huge but poor basin;
- small but extremely rich deposit;
- huge and rich structure — very rare jackpot;
- small and poor structure — common low-value geology.

This should create varied but balanced campaign worlds.

---

## 11. Depletion

Finite resources physically deplete.

Extraction permanently reduces `remainingAmount`.

However, the system should not behave as a simple binary:

```text
resource > 0 → extraction works normally
resource = 0 → resource disappears
```

As the easiest and richest portions are exhausted:

- extraction may become harder;
- costs may increase;
- remaining grades may be lower;
- deeper sections may require better technology;
- some physical resource may remain uneconomic.

A deposit or developed field may therefore pass through states such as:

```text
unknown
→ discovered
→ surveyed
→ developed
→ active
→ mature
→ declining
→ marginal
→ abandoned
```

An abandoned resource can later return to production if:

- prices rise;
- technology improves;
- infrastructure improves;
- the state subsidizes extraction;
- strategic demand changes.

---

## 12. Physical resource vs economic reserve

The simulation should distinguish between physical geological resource and economic reserve.

### Resource

Everything physically present in the geological structure.

### Reserve

The portion currently known and realistically extractable under current:

- geological knowledge;
- exploration quality;
- technology;
- prices;
- infrastructure;
- institutions;
- political conditions.

Therefore:

```text
new exploration
or better technology
or higher prices
→ reserves may increase

physical resource
→ does not magically increase
```

This distinction allows resource estimates to change without changing the underlying geology.

---

## 13. True geology vs known geology

The complete physical geology exists in simulation state from campaign creation.

Societies only know a subset.

```text
TRUE GEOLOGY
hidden physical state

KNOWN GEOLOGY
what a society has discovered and investigated
```

Knowledge may progress through stages such as:

```text
unknown
→ surface signs / rumours
→ suspected resource
→ discovered
→ surveyed
→ estimated reserve
→ extensively mapped
```

The exact discovery model is deferred.

The important rule is that **knowledge changes; physical geology does not**.

---

## 14. Starting knowledge and exploitation in 1700

After physical geology is generated, the campaign can procedurally generate a plausible starting knowledge/exploitation state for 1700.

Conceptually:

```text
generate geology
↓
mark a plausible subset as already known
↓
mark a smaller plausible subset as already developed/exploited
↓
leave the rest hidden
```

This can also use the campaign seed.

The exact historical location of every operating mine is not required for early versions.

Instead, starting discovery/development probabilities should follow plausibility rules.

For example:

- shallow deposits are more likely to be known;
- surface-visible resources are more likely to be known;
- rich deposits are more likely to attract early exploitation;
- easily extractable deposits are more likely to be developed;
- resources with no meaningful 1700 use should usually remain unknown or irrelevant;
- technologically inaccessible deep resources should rarely be developed.

Thus early versions can use:

```text
physical geology
→ procedural

known deposits in 1700
→ procedural with plausibility rules

developed deposits in 1700
→ procedural subset of known deposits
```

Later versions may add more historically constrained modes if useful, but only after the game is already playable.

---

## 15. All campaign-era resources exist physically from the start

The resource registry should be designed for the full 1700–2200 horizon.

Examples of later-important materials such as:

- uranium;
- lithium;
- cobalt;
- rare-earth elements;
- petroleum;
- natural gas;

already exist in physical geology in 1700.

They may simply be:

- unknown;
- unrecognized;
- technologically inaccessible;
- economically irrelevant;
- lacking any useful production chain.

The game should not "unlock" their physical existence.

Technology and economic development unlock **knowledge and use**, not matter.

---

## 16. Data-driven resource registry

The generator should not be hard-coded separately for every individual resource.

Use a data-driven resource registry.

A resource definition may eventually contain fields such as:

```text
resource:
  id
  category
  geologyType
  baseDensity
  generationProfile
  baseUnit
  discoverabilityProfile
```

Additional fields can be added only when implementation requires them.

The important architectural goal is:

```text
generic geological generator
+ data-driven resource profiles
= extensible resource system
```

This makes it possible to expand from a smaller initial implementation to dozens of resources without rewriting the core architecture.

---

## 17. Natural resource vs produced good

The resource layer describes natural physical availability.

It must remain separate from production chains.

Examples:

```text
forest
→ firewood
→ timber
→ charcoal
→ resin / tar / other products

coal basin
→ mined coal
→ later processed fuels/materials

oil basin
→ crude oil
→ refined petroleum products
```

Charcoal, coke, steel, gasoline, fertilizer and similar outputs are **products**, not naturally occurring resource stocks.

This distinction will matter when the economy system is added.

---

## 18. Renewable resources follow different physics

Not every resource should use the basin/depletion model.

### Renewable stocks

Examples:

- forests;
- fish;
- soil fertility;
- pasture.

They require:

```text
stock
regeneration
exploitation
degradation
recovery
```

### Renewable flows

Examples:

- solar;
- wind;
- rivers;
- tides.

They require:

```text
local potential
technology
installed capacity
infrastructure
```

A common resource registry may describe them, but their simulation logic should remain physically appropriate to their class.

---

## 19. Interaction with future infrastructure

A rich resource body is not automatically economically useful.

Later connectivity/infrastructure systems will constrain exploitation through:

- roads;
- navigable rivers;
- canals;
- ports;
- sea routes;
- railways;
- later highways;
- power grids;
- communications.

Goods, workers and equipment must not teleport.

A remote giant deposit can remain marginal for decades because transport is inadequate.

---

## 20. Interaction with the player's political role

The player should not manually place every mine, well, road or factory as an omnipotent map painter.

The player is a political force operating through institutions.

Possible future actions include:

- funding geological surveys;
- financing exploration expeditions;
- establishing geological institutes;
- granting concessions;
- subsidizing extraction;
- creating state companies;
- changing mining/resource law;
- funding transport links;
- declaring strategic resources;
- restricting exports;
- creating stockpiles.

Actual exploration, investment and extraction should be performed by simulation actors such as:

- private enterprises;
- state enterprises;
- ministries/agencies;
- regional authorities;
- municipalities;
- other institutions.

The resource layer should provide the physical foundation for these later systems.

---

## 21. Starting fuel context around 1700

Historically recognizable starting conditions may include widespread use of:

- firewood / woody biomass;
- charcoal;
- agricultural biomass;
- animal dung.

Regionally important fuels can include:

- coal;
- lignite;
- peat;
- whale oil for lighting and specialized uses.

Known but not yet globally industrial resources include:

- petroleum / bitumen;
- natural gas;
- coke.

This affects **starting knowledge, production and demand**, not whether those resources physically exist in the generated world.

---

## 22. Economy-planning principle

Before building full price, trade and production systems, establish the material starting world.

The broad order is:

```text
WHAT EXISTS
WHERE IT EXISTS
WHAT IS KNOWN
WHAT IS ALREADY EXPLOITED
```

Relevant starting-state layers include:

- resources;
- production;
- settlements;
- infrastructure;
- trade geography;
- economic institutions.

The resource layer is being designed first.

---

## 23. Decisions considered settled for Resource System v1

The following concepts are treated as agreed unless implementation reveals a concrete problem:

1. Resource geography is procedural in early versions.
2. Every campaign has a deterministic resource seed.
3. Physical geology is generated once at campaign creation.
4. Physical geology is never regenerated during the campaign.
5. The simulation knows true geology; societies know only discovered geology.
6. Starting 1700 knowledge can be generated procedurally with plausibility rules.
7. Starting developed/exploited deposits can be a procedural subset of known deposits.
8. Generation follows resource-specific geological rules rather than uniform per-territory randomness.
9. Finite resources form coherent basins, belts, clusters and provinces.
10. Geological structures can span many atomic territories.
11. Core geometry is length, width and thickness.
12. Core geology is concentration, burial depth and extractability.
13. Concentration and extraction difficulty remain separate.
14. Geological structures have spatially varying internal properties.
15. Atomic territories receive local slices of larger structures.
16. Size and richness use continuous values and resource-specific distributions.
17. Most structures are small/ordinary; giant/extreme structures are rare.
18. Size and richness are not forced to correlate.
19. Finite physical stocks use tonnes as the common base material unit.
20. Extraction permanently reduces finite physical stock.
21. Physical resource and economic reserve are separate concepts.
22. Renewable stocks and renewable flows use different physical models.
23. All economically/strategically relevant resources for the 1700–2200 horizon may exist physically from campaign start.
24. Resources do not appear merely because a technology is unlocked.
25. Resource definitions should be data-driven.
26. Natural resources and produced goods are separate layers.
27. Historical real-world geology is not required for the initial playable version.
28. Gameplay and emergent history take priority over exact historical resource placement.
29. Historically constrained or alternative generation modes can be added later, after the game is playable.

---

## 24. Intentionally deferred implementation questions

These do not need to be solved during the current planning stage:

- exact mathematical distributions for each resource;
- exact geological volume formulas;
- final physical coefficients and densities;
- final resource registry contents;
- exact basin shape-generation algorithm;
- exact per-territory projection algorithm;
- exploration/survey mechanics;
- reserve-estimation uncertainty;
- extraction-cost formulas;
- mine/well enterprise mechanics;
- production-chain details;
- environmental damage;
- recycling;
- substitution;
- strategic stockpiles;
- ownership and concession law;
- international concessions;
- historical resource-generation modes;
- precise terrain/geology interactions.

These should be decided when their corresponding systems are actually implemented.

---

## 25. Short architecture summary

```text
CAMPAIGN SEED
      ↓
FIXED PROCEDURAL PHYSICAL GEOLOGY
      ↓
BASINS / BELTS / CLUSTERS
      ↓
LOCAL TERRITORY SLICES
      ↓
TRUE RESOURCE STOCK
      ↓
STARTING / LATER KNOWLEDGE
      ↓
SURVEYING AND EXPLORATION
      ↓
TECHNOLOGY + CAPITAL + INFRASTRUCTURE
      ↓
DEVELOPMENT AND EXTRACTION
      ↓
DEPLETION / REGENERATION / FLOW
      ↓
PRODUCTION
      ↓
TRADE
      ↓
POLITICS AND STRATEGY
```

The physical resource world is created once and remains internally consistent for the entire campaign.

Societies gradually discover, value, develop, exhaust, conserve and fight over a world that was already there.
