# Mandate — Production System v1 Planning

> Status: early planning draft  
> Scope: first playable production/economy layer  
> Priority: compact universal mechanics first, detail later through data

## 1. Core goal

Production v1 should **not** attempt to model every historically distinct good, craft, workshop, and industrial process of the 18th century.

The first playable economy should use a small number of broad goods and a small number of generic producer types.

The important objective is to build a **universal production model** that can later be expanded with additional goods and recipes without rewriting the simulation core.

The basic production pattern is:

```text
inputs
→ production process
→ labor / capital / energy
→ outputs
```

Different industries should mostly be different data definitions using the same generic mechanics.

---

## 2. Scale of Production v1

Initial target:

```text
10–15 broad goods categories
5–7 generic production types
several simple production chains
population consumption
market prices and shortages/surpluses
```

The exact count is flexible. The main rule is to keep the first implementation compact enough to become playable quickly.

---

## 3. Broad goods categories

A possible first-pass set:

- food;
- textiles;
- timber;
- construction materials;
- iron goods;
- weapons;
- ships;
- luxury goods;
- fuel;
- paper;
- basic chemicals.

Additional categories can be added if implementation or balance clearly requires them.

These are deliberately broad abstractions.

For example:

```text
food
→ grain, meat, fish, processed food later

textiles
→ wool, linen, cotton cloth, silk later

iron goods
→ tools, hardware, machinery parts later
```

The first version should not split categories unless the split creates meaningful gameplay.

---

## 4. Generic producer types

A compact initial set can include:

- farm;
- workshop;
- manufactory;
- mine;
- plantation;
- shipyard;
- arsenal.

These are broad production archetypes, not rigid historical building lists.

The goal is for the same producer framework to support many industries through data-driven recipes and requirements.

---

## 5. Historical framing around 1700

The world around 1700 was pre-industrial, but it already contained substantial and sophisticated production.

Relevant broad sectors included:

- agriculture and food processing;
- textile production;
- woodworking;
- construction materials;
- metalworking and metallurgy;
- tools and hardware;
- weapons and arsenals;
- shipbuilding;
- leather goods;
- paper and printing;
- basic chemicals;
- luxury crafts;
- mining.

The important design point is that 1700 should **not** feel like a world before meaningful production.

Instead, the later industrial revolution should primarily transform:

- scale;
- productivity;
- energy use;
- mechanization;
- capital intensity;
- transport dependence;
- cost.

Humanity already knows how to make many things; later development makes production dramatically faster, cheaper and larger.

---

## 6. Production methods coexist

The same economy may contain very different production organizations at the same time.

Examples:

- household production;
- peasant production;
- artisan workshop;
- guild workshop;
- putting-out system;
- manufactory;
- state arsenal;
- mine;
- plantation;
- shipyard.

Production v1 does not need to model every institutional distinction immediately, but the architecture should not assume that all production is a modern factory.

---

## 7. Universal recipe idea

Industries should be definable mostly through data.

Conceptually:

```text
recipe:
  inputs
  labor
  capital
  energy
  outputs
  productivity
  requirements
```

Example:

```text
textile production

inputs:
- fibers

requires:
- labor
- simple tools
- some energy

outputs:
- textiles
```

Later, a more advanced process can use a different recipe without replacing the whole system.

Example:

```text
industrial textile mill

inputs:
- fibers
- fuel

requires:
- more capital
- machinery
- infrastructure
- skilled labor

outputs:
- much more textiles
```

This allows technology to change production methods rather than merely add arbitrary production bonuses.

---

## 8. Expansion principle

The production system should be designed so that adding a new good is normally a **data change**, not a new simulation subsystem.

For example:

```text
Production Core
      ↓
generic producer
      ↓
generic recipe
      ↓
resource/goods inputs
      ↓
labor + capital + energy
      ↓
goods outputs
```

Then later:

```text
textiles
→ wool cloth
→ linen
→ cotton cloth
→ silk

food
→ grain
→ meat
→ fish
→ processed food

iron goods
→ tools
→ hardware
→ machinery parts
```

can be introduced incrementally.

The game should not require all of this detail to become playable.

---

## 9. Relation to natural resources

Natural resources and produced goods remain separate layers.

Examples:

```text
forest resource
→ timber
→ charcoal / construction / ships

coal basin
→ mined coal
→ fuel / industrial processes

iron ore
→ processed metal
→ iron goods / weapons / machinery
```

The resource system defines what physically exists.

The production system defines how labor, capital, technology and energy transform resources and intermediate goods into outputs.

---

## 10. First playable economy target

Production v1 is successful when the game can produce recognizable economic behavior with a small content set:

```text
resources exist
↓
producers use inputs
↓
workers produce goods
↓
population consumes goods
↓
local supply/demand changes
↓
prices react
↓
shortages and surpluses appear
↓
production responds
```

The goal is not detailed historical accounting.

The goal is a living economy that can later be expanded safely.

---

## 11. Decisions considered settled for Production v1

1. Keep the first implementation deliberately compact.
2. Target roughly 10–15 broad goods categories.
3. Target roughly 5–7 generic production archetypes.
4. Use a universal `inputs → labor/capital/energy → outputs` model.
5. Define most industries through data-driven recipes.
6. Do not model every historical good or craft in v1.
7. Do not assume all production is a modern factory.
8. 1700 already has substantial workshops, manufactories, mines, shipyards, arsenals and agricultural production.
9. Industrialization should mainly transform productivity, scale, mechanization and energy use.
10. Add detail later by splitting broad categories into more specific goods.
11. Adding new goods should normally not require rewriting the simulation core.
12. Natural resources and produced goods remain separate systems.
13. The first goal is a functioning, responsive economy rather than maximum detail.

---

## 12. Intentionally deferred questions

These do not need to be solved yet:

- exact final list of v1 goods;
- exact recipes;
- productivity formulas;
- wage mechanics;
- capital ownership;
- enterprise accounting;
- factory construction mechanics;
- detailed skill requirements;
- guild mechanics;
- putting-out system mechanics;
- technology-specific production methods;
- exact energy accounting;
- inventory and storage rules;
- bankruptcy;
- investment behavior;
- detailed market-clearing logic;
- taxation and subsidies;
- state ownership;
- trade integration.

These should be decided when implementation reaches them.

---

## Short summary

Production v1 should be small, generic and extensible.

```text
small goods set
+ generic producer types
+ data-driven recipes
+ labor / capital / energy
+ supply / demand
= first playable economy
```

Detailed 1700–2200 production can then be layered on top without replacing the core.
