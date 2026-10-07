# Mandate — Resource Registry v1

> Status: planning draft  
> Scope: compact natural-resource registry for the first playable resource system  
> Campaign horizon: 1700–2200

## 1. Goal

The first resource registry should cover the **main economically and strategically meaningful natural resources** across the full Mandate campaign period.

The goal is **not** to model every mineral, chemical element, or raw material separately.

Target scale:

```text
roughly 30–40 primary natural resources
```

Resources should be grouped into clear gameplay categories.

A resource should usually exist as its own entry only when it creates meaningfully distinct:

- extraction geography;
- economic use;
- strategic importance;
- technology requirements;
- production chains;
- trade behavior.

---

## 2. Core rule: natural resource is not a processed good

Keep the physical resource layer separate from production outputs.

Examples:

```text
iron ore ≠ iron ≠ steel

bauxite ≠ aluminium

crude oil ≠ gasoline / diesel / kerosene

forest ≠ timber / charcoal

phosphate rock ≠ fertilizer
```

The **resource registry** contains what exists naturally in the world.

Processing belongs to the production system.

---

## 3. Fuel and energy resources

Finite fuel resources:

- hard coal;
- lignite / brown coal;
- peat;
- crude oil;
- natural gas;
- uranium;
- thorium.

Notes:

- Coal and lignite should remain distinct because they differ substantially in energy density and economic value.
- Oil and gas are physical geological resources from campaign start even when societies do not yet know or exploit them.
- Uranium and thorium also physically exist long before they become useful.

---

## 4. Ferrous and alloying metals

Primary resources used for iron, steel and alloy production:

- iron ore;
- manganese;
- chromium;
- nickel;
- cobalt;
- tungsten;
- molybdenum;
- vanadium.

These become increasingly important as metallurgy and advanced industry develop.

---

## 5. Non-ferrous industrial metals

Main non-ferrous metal resources:

- copper;
- tin;
- lead;
- zinc;
- bauxite;
- mercury.

Bauxite represents the natural aluminium-bearing resource.

Aluminium itself is a processed product and should not exist as a geological deposit.

---

## 6. Precious, strategic and rare resources

Important high-value or later strategic resources:

- gold;
- silver;
- platinum-group metals;
- lithium;
- rare-earth elements.

For v1:

```text
platinum-group metals
→ one aggregated resource

rare-earth elements
→ one aggregated resource
```

There is no need to split them into every individual element until gameplay actually needs that distinction.

---

## 7. Non-metallic mineral resources

Main industrial mineral resources:

- salt;
- sulfur;
- phosphate rock;
- potash;
- limestone;
- gypsum;
- clay / kaolin;
- silica / quartz sand;
- graphite.

These support later production chains such as:

- construction;
- glass;
- ceramics;
- chemicals;
- fertilizers;
- paper;
- metallurgy.

Where detailed distinctions do not create useful gameplay, they can remain aggregated.

---

## 8. Gem resources

Luxury and high-value geological resources:

- diamonds;
- gemstones.

`gemstones` can aggregate colored precious and semi-precious stones unless a later system needs more detail.

---

## 9. Natural gases and atmospheric materials

### Geological gas resources

- natural gas;
- helium.

Natural gas already belongs to the fuel category but is also the main geological gas resource.

Helium can exist as a distinct later-game strategic gas resource if useful.

### Atmospheric resources

Do **not** generate deposits for ordinary atmospheric gases such as:

- oxygen;
- nitrogen;
- hydrogen as an industrial feedstock.

These are obtained through industrial processes or from the atmosphere and therefore belong to production/processing systems rather than geological deposit generation.

---

## 10. Renewable material stocks

Renewable natural-resource stocks:

- forests;
- fish stocks;
- soil fertility;
- pasture;
- freshwater;
- wildlife.

These do not use the same depletion model as geological deposits.

They require regeneration, degradation and recovery mechanics.

---

## 11. Renewable energy flows

Natural energy potentials:

- hydropower;
- wind;
- solar;
- geothermal;
- tidal.

These are not finite tonnage deposits.

Their simulation should use local potential/flow and installed conversion capacity.

---

## 12. Proposed v1 registry summary

### Finite geological resources

```text
Fuel / energy
- hard coal
- lignite
- peat
- crude oil
- natural gas
- uranium
- thorium

Ferrous / alloying metals
- iron ore
- manganese
- chromium
- nickel
- cobalt
- tungsten
- molybdenum
- vanadium

Non-ferrous metals
- copper
- tin
- lead
- zinc
- bauxite
- mercury

Precious / rare / strategic
- gold
- silver
- platinum-group metals
- lithium
- rare-earth elements

Non-metallic minerals
- salt
- sulfur
- phosphate rock
- potash
- limestone
- gypsum
- clay / kaolin
- silica / quartz sand
- graphite

Luxury geological resources
- diamonds
- gemstones

Other strategic gas
- helium
```

This gives a compact but broad finite-resource set suitable for the full 1700–2200 campaign.

### Renewable stocks

```text
- forests
- fish stocks
- soil fertility
- pasture
- freshwater
- wildlife
```

### Renewable energy flows

```text
- hydropower
- wind
- solar
- geothermal
- tidal
```

---

## 13. Design principles considered settled

1. Aim for a compact registry rather than exhaustive mineralogy.
2. Roughly 30–40 major physical resources is an appropriate target for early versions.
3. Resource categories should remain understandable to the player.
4. Natural resources and processed goods must remain separate.
5. Later-game resources physically exist from campaign start even if unknown or useless in 1700.
6. Similar resources may be aggregated when separating them does not create meaningful gameplay.
7. The registry should remain data-driven so resources can be added later without changing the core simulation.
8. Finite geological resources, renewable stocks, and renewable flows are distinct physical classes.
9. Atmospheric industrial feedstocks should not be modeled as geological deposits.
10. Detailed splitting should happen only when the economy becomes deep enough to benefit from it.

---

## 14. Intentionally deferred

Not yet fixed:

- exact internal IDs;
- exact density values;
- exact geological generation profile for every resource;
- whether peat is modeled globally as a geological stock or as a renewable/slow-renewing special case;
- whether freshwater needs explicit stock simulation everywhere;
- whether helium is important enough for the first playable build;
- whether some industrial minerals should be merged further;
- exact resource-specific units shown in UI.

These can be decided during implementation without changing the overall registry structure.
