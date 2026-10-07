# Mandate — Goods Registry v1 & Material Lifecycle Notes

> Status: planning draft  
> Scope: first playable goods registry plus future material conservation / recycling rules  
> Campaign horizon: 1700–2200

## 1. Goal

Goods in the first playable economy should stay deliberately compact.

The initial target is roughly:

```text
10–15 broad goods categories
```

The purpose is to get a functioning economy first, then split categories later when deeper gameplay requires it.

The goods layer must remain separate from the natural-resource layer.

---

## 2. Core distinction

```text
NATURAL RESOURCE
what physically exists in nature

PRIMARY COMMODITY
what has been extracted or harvested and entered the economy

PROCESSED GOOD
what production turns inputs into
```

Examples:

```text
iron ore deposit
→ mined iron ore
→ iron / steel
→ tools / weapons / machinery
```

```text
oil basin
→ crude oil
→ refined fuel / chemicals
```

```text
forest
→ harvested wood
→ timber / charcoal / construction goods
```

The resource itself should not automatically appear on a market without extraction.

---

## 3. Proposed Goods Registry v1

### 3.1 Food

Broad basic consumption category.

May initially aggregate:

- grain;
- meat;
- fish;
- vegetables;
- basic processed foods.

Can be split later if gameplay needs it.

### 3.2 Textile fibers

Primary agricultural/raw material for textile production.

May aggregate:

- wool;
- cotton;
- flax;
- hemp;
- similar fibers.

### 3.3 Textiles

Processed textile goods.

May include:

- cloth;
- clothing;
- sailcloth;
- common textile products.

Later can split into wool, linen, cotton, silk and others.

### 3.4 Timber

Harvested and prepared wood used by the economy.

Used for:

- construction;
- ships;
- tools;
- furniture;
- fuel-related production;
- infrastructure.

### 3.5 Construction materials

Broad construction input category.

May aggregate:

- brick;
- stone;
- lime;
- glass;
- common structural materials.

### 3.6 Fuel

Marketable fuel available to households and production.

Early forms can include:

- wood fuel;
- charcoal;
- coal.

Later this category may be split where necessary into:

- solid fuels;
- refined petroleum fuels;
- other specialized fuels.

Natural crude oil, coal deposits and gas deposits remain resource-layer objects, not finished consumer goods.

### 3.7 Basic metals

Processed metal material used as an industrial intermediate.

Examples:

- iron;
- copper;
- later steel and other alloys depending on detail level.

This category can later split into distinct metals if needed.

### 3.8 Metal goods

General finished or semi-finished metal products.

Examples:

- tools;
- nails;
- fittings;
- simple hardware;
- cookware;
- agricultural implements.

### 3.9 Weapons

Aggregated military manufactured goods.

May include:

- firearms;
- artillery;
- edged weapons;
- ammunition-related manufactured equipment;
- military hardware.

The exact split can come later.

### 3.10 Basic chemicals

Broad chemical and chemical-adjacent production category.

May include:

- soap;
- salt-derived chemicals;
- acids;
- alkalis;
- fertilizer inputs;
- industrial chemical intermediates.

### 3.11 Paper & printed goods

May aggregate:

- paper;
- books;
- newspapers;
- printed material;
- administrative paper goods.

### 3.12 Luxury goods

High-value non-essential consumption.

May aggregate:

- porcelain;
- fine furniture;
- jewelry;
- fine textiles;
- clocks;
- decorative goods;
- luxury crafts.

### 3.13 Machinery

Industrial equipment and complex mechanical capital goods.

Very limited or nearly absent as a mass category in 1700, but increasingly important through industrialization.

### 3.14 Transport equipment

May include:

- carts;
- wagons;
- ships;
- later locomotives;
- automobiles;
- other transport vehicles.

Large ships or specialized military vessels may later require separate treatment, but the first architecture should support them through production recipes rather than entirely separate systems.

### 3.15 Electrical / electronic goods

A later-era category.

Effectively absent in 1700, but kept conceptually available for the 1700–2200 campaign horizon.

It can later represent:

- electrical equipment;
- motors;
- generators;
- communication equipment;
- electronics;
- advanced electrical products.

---

## 4. Primary commodities can remain distinct

Extracted natural materials do not all need to be collapsed into one generic `raw_materials` good.

Examples that may remain distinct when economically useful:

- coal;
- crude oil;
- natural gas;
- iron ore;
- copper ore;
- salt;
- phosphates;
- harvested timber feedstock;
- other mined or harvested inputs.

This preserves the connection between resource geography and industry.

---

## 5. Example compact production chains

### Food

```text
farm / fishery
→ food
```

### Textiles

```text
farm / plantation / pastoral production
→ textile fibers
→ workshop / manufactory
→ textiles
```

### Timber

```text
forest
→ logging
→ timber
→ construction / ships / other goods
```

### Metals

```text
ore + fuel
→ metallurgy
→ basic metals
→ metal goods / weapons / machinery
```

### Oil later in the campaign

```text
crude oil
→ refinery
→ refined fuel + chemical feedstocks
```

The exact recipes and ratios are intentionally deferred.

---

## 6. Material must not disappear after consumption

A future material-lifecycle system must respect the fact that physical matter does not simply vanish when a product is consumed or retired.

The basic long-term lifecycle is:

```text
resource
→ extraction
→ material
→ product
→ stock in use
→ end of life
→ waste / scrap
→ collection
→ recycling
→ secondary material
→ new production
```

This is essential because geological resources are finite.

An economy cannot realistically rely forever on endlessly extracting the same finite primary deposits.

---

## 7. Stock in use

A product can remain physically present in society for years or decades before becoming waste.

Examples:

- copper in an electrical grid;
- steel in railways;
- metal in buildings;
- machinery;
- ships;
- vehicles;
- durable household goods.

Such material is neither available as a fresh market input nor destroyed.

It exists as:

```text
stock in use
```

When equipment or infrastructure is dismantled, some of that material can return as scrap.

---

## 8. Recycling must not be perfect

Recycling should be physically and economically realistic.

It should never behave like a free 100% closed loop.

Losses can occur because:

- waste is not collected;
- material is dispersed;
- products are contaminated;
- separation is difficult;
- processing loses material;
- quality degrades;
- recycling requires energy;
- recycling requires labor;
- recycling requires capital and infrastructure.

Therefore:

```text
recycled material < material originally used
```

in most real cycles.

Technology and institutions can improve recovery rates over time.

---

## 9. Different materials behave differently

### Highly recyclable materials

Examples:

- many metals;
- glass.

They may circulate through the economy many times, although with collection and processing losses.

### Partially recyclable materials

Examples:

- paper;
- textiles;
- some plastics;
- wood products.

Material quality may degrade or the number of useful cycles may be limited.

### Dissipative consumption

Some uses permanently destroy or disperse most of the useful material.

Examples:

```text
coal burned as fuel
→ not recoverable as coal

natural gas burned
→ not recoverable as natural gas

oil refined and burned as fuel
→ not recoverable as crude oil
```

This must remain distinct from durable material use.

---

## 10. Secondary resources

Over time, society itself becomes a large stock of recoverable material.

The simulation should eventually distinguish:

```text
geological stock
+
stock in use
+
waste / scrap stock
```

This allows later economies to rely increasingly on secondary materials.

Example:

```text
iron ore
→ steel
→ railway
→ scrap steel
→ recycled steel
→ machinery
```

Primary extraction can fall substantially without reaching zero.

---

## 11. Urban mining

By the modern and future eras, old cities, infrastructure and waste streams can become economically meaningful sources of material.

Examples:

- copper from obsolete grids and cables;
- steel from demolished structures;
- aluminium from vehicles and buildings;
- valuable metals from electronics;
- reusable construction materials.

This can later support an `urban mining` concept without creating new geological deposits.

---

## 12. Relationship to finite geology

The resource system and recycling system should reinforce each other.

```text
finite primary deposits
+
material accumulation in society
+
improving recycling
=
long-term material economy
```

This avoids two bad extremes:

1. matter disappearing after use;
2. infinite perfect recycling eliminating the need for primary resources.

The intended result is a realistic middle ground.

---

## 13. Decisions considered settled

1. Goods v1 should remain compact, around 10–15 broad categories.
2. Natural resources, extracted commodities and processed goods are separate concepts.
3. Extracted materials may remain distinct when their geography and strategic value matter.
4. Broad goods categories can later be split without replacing the production core.
5. Matter should not automatically disappear after a product is consumed or retired.
6. Durable products create a `stock in use`.
7. End-of-life goods can become waste or scrap.
8. Waste collection is incomplete.
9. Recycling requires labor, energy, capital and infrastructure.
10. Recycling always has realistic losses or limitations.
11. Different materials have different recycling behavior.
12. Fuels consumed by combustion are largely dissipative and cannot simply be recycled back into fuel.
13. Secondary materials can become increasingly important as economies mature.
14. Geological extraction remains relevant because recycling is never perfectly closed.
15. Future urban mining should draw from existing material stocks, not spawn new resources.

---

## 14. Intentionally deferred

Not yet fixed:

- exact final v1 goods list;
- exact split between fuel types;
- exact product lifetimes;
- exact waste categories;
- exact collection rates;
- exact recycling efficiencies;
- quality loss / downcycling formulas;
- scrap prices;
- recycling technology progression;
- environmental pollution;
- landfill mechanics;
- incineration;
- repair and reuse;
- remanufacturing;
- detailed urban-mining mechanics.

These belong to later economy implementation.
