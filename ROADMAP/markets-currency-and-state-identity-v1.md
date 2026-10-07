# Mandate — Markets, Currency & State Identity v1

> Status: planning draft  
> Scope: local markets and prices, currencies, and politically meaningful state identity changes  
> Goal: preserve player freedom while keeping all changes inside the political-economic simulation

## 1. Core philosophy

Mandate should not use one abstract global economy and one abstract universal money unit.

Prices, currencies, ownership and state identity should exist as simulation state.

Player freedom should work through institutions and political procedures rather than through out-of-world settings.

The general pattern is:

```text
PLAYER INTENT
→ political / legal procedure
→ official decision
→ GameState change
→ economic / social / diplomatic consequences
```

---

# Part I — Market & Prices v1

## 2. Local markets

There should not be a single world price for every good.

A good can have different prices in different places.

Example:

```text
Region A:
grain = cheap

Region B:
grain = expensive
```

because:

- local production differs;
- local demand differs;
- stockpiles differ;
- transport costs differ;
- wars or blockades interfere with supply;
- infrastructure differs.

The market layer should therefore be geographically local.

---

## 3. Basic market loop

For early versions:

```text
goods produced / imported
↓
local supply

population + enterprises + construction + government
↓
local demand

supply vs demand
↓
price movement

price
↓
affects consumption, trade and enterprise decisions
```

The system should remain simple enough to be stable and understandable.

---

## 4. Minimal market state per good

A local market can initially track values such as:

```text
inventory
recentSupply
recentDemand
price
currency
```

Exact formulas are deferred.

The important point is that the market remembers enough recent state to avoid unrealistic instant price oscillation.

---

## 5. Shortage and surplus

Basic behavior:

```text
demand > supply
→ shortage pressure
→ price rises
```

```text
supply > demand
→ surplus pressure
→ price falls
```

Price changes should have inertia.

The game should not allow prices to double or halve every tick simply because of one noisy day.

---

## 6. Price and availability are different

A good may technically still exist in the market but become unaffordable for some groups.

Example:

```text
food becomes scarce
→ price rises
→ wealthy consumers still buy
→ poorer consumers fail to meet needs
```

This allows shortages to create social effects through real purchasing power rather than only through abstract penalties.

---

## 7. Enterprise response to prices

Enterprises should observe market conditions.

Conceptually:

```text
high output price
+ affordable inputs
→ higher profitability
→ incentive to expand
```

```text
expensive inputs
+ weak output price
→ losses
→ contraction / closure pressure
```

The exact investment and closure logic is deferred.

---

## 8. Trade and price convergence

When markets become connected:

```text
Market A:
grain = 5

Market B:
grain = 12

transport cost = 3
```

trade becomes profitable.

Goods move from cheaper to more expensive markets, gradually reducing the difference.

Thus:

```text
price difference
- transport cost
→ trade opportunity
```

Transport and connectivity systems will later determine whether such arbitrage is possible.

---

# Part II — Currency System v1

## 9. Prices are denominated in actual currencies

Goods should not be priced in an abstract universal game currency.

Example:

```text
grain = 4.2 rubles
iron goods = 37 rubles
```

A market price always exists in a specific currency.

---

## 10. Early currency model

A currency can initially have:

```text
Currency

id
issuer
name
symbol

denominations

type:
- metallic
- paper
- mixed
- fiat

metalBacking / metalContent:
- gold
- silver
- both
- none

moneySupply
trust
exchangeRate
```

Exact implementation details can evolve.

---

## 11. Historical logic around 1700

Exchange rates should exist in the 18th century, but not as a modern Forex abstraction.

Early exchange value may depend strongly on:

- silver content;
- gold content;
- coin weight;
- fineness;
- trust in minting;
- debasement;
- acceptance by merchants;
- bills of exchange;
- trade flows.

So Mandate can begin with currency exchange rooted in metallic value and commercial practice, then become more modern over time.

---

## 12. Coin debasement

States should eventually be able to alter coin content.

Example:

```text
old coin:
10 g silver

new coin:
7 g silver
```

This may help the treasury in the short term but can affect:

- trust;
- prices;
- exchange rates;
- creditor relations;
- foreign trade.

The exact consequences are deferred.

---

## 13. Multiple monetary regimes

The architecture should support:

- silver-based money;
- gold-based money;
- bimetallism;
- paper money;
- mixed systems;
- fiat money.

Not every regime needs to be fully implemented in the earliest build.

The data model should simply avoid locking the game into one monetary standard.

---

## 14. Multiple currencies may circulate

A state can have an official currency while foreign currencies also circulate in practice.

Possible later situations:

- colonial currencies;
- regional currencies;
- private banknotes;
- foreign currency use;
- currency unions;
- parallel circulation.

For v1, it is enough to support one main official currency per state plus exchange rates to others.

---

## 15. Player-created currency

The player should be able to create a new currency through political action.

Possible configurable parameters:

```text
name
symbol
denominations
issuer
currency type
metal content / backing
legal tender rules
conversion rules from old currency
```

This must not behave like a cosmetic settings screen.

Instead:

```text
proposal
→ political / legal approval
→ currency reform
→ minting / printing / conversion
→ market adoption
→ trust and exchange-rate consequences
```

---

## 16. Currency reform consequences

Creating or changing a currency can affect:

- old contracts;
- debt denomination;
- wages;
- taxes;
- prices;
- state accounting;
- exchange rates;
- public trust;
- minting / printing costs;
- foreign merchants;
- reserves.

The scale of consequences depends on the reform.

---

# Part III — State Identity System

## 17. State identity is simulation state

The state should not have an immutable scenario-only identity.

Important identity fields may include:

```text
officialName
shortName
flag
currency
emblem / coat of arms
motto
official titles
```

Some fields can be added later.

The key principle is that these values can change during play.

---

## 18. Renaming the state

The player may propose changing the official name of the state.

This should not be:

```text
Settings
→ rename country
```

Instead:

```text
political proposal
→ legal / constitutional process
→ official adoption
→ administrative transition
→ internal and external reaction
```

A small title adjustment may have little effect.

A revolutionary rename can carry major political meaning.

---

## 19. Changing the flag

The player may change the official national flag.

The game should allow a custom image to be uploaded as the visual asset.

However, uploading an image is only the visual step.

The state change itself should still require an in-world political process.

```text
upload / choose new flag asset
↓
political adoption
↓
official flag changes
↓
army / navy / administration adopt symbol
↓
public / faction / foreign reaction
```

---

## 20. Consequences depend on meaning

Symbolic changes should not always create huge effects.

Example:

```text
minor heraldic adjustment
→ limited consequences
```

```text
monarchy abolished
new republican name
new revolutionary flag
new currency
→ potentially major consequences
```

The simulation should respond to the political meaning, context and affected groups rather than treating every cosmetic change equally.

---

## 21. Identity change across centuries

A single country may transform many times during a 1700–2200 campaign.

Example:

```text
Kingdom of X
↓
Empire of X
↓
Republic of X
↓
Federation of X
↓
Union of X and Y
```

These changes should emerge from gameplay rather than scripted historical chains.

---

## 22. Player freedom principle

Mandate should allow the player to attempt unusual or highly customized reforms.

Examples:

- invent a new currency;
- rename the state;
- introduce unusual denominations;
- adopt a custom flag;
- redesign official symbolism;
- create new ministries;
- write custom laws.

The simulation should not respond with:

> "there is no button for that."

Instead it should try to translate the player's intent into valid institutional and political actions.

The core design principle is:

```text
freedom of intent
+
institutional constraints
+
simulation consequences
=
emergent political gameplay
```

---

## 23. Decisions considered settled for v1

### Markets

1. Markets are local, not globally unified.
2. Prices vary geographically.
3. Supply and demand move prices.
4. Prices should change with inertia.
5. Availability and affordability are distinct.
6. Enterprises react to prices.
7. Trade tends to reduce profitable regional price differences.
8. Transport costs matter for trade.

### Currency

9. Prices are denominated in real in-game currencies.
10. Currencies have issuers and configurable properties.
11. Metallic value matters strongly in early eras.
12. Exchange rates exist from the early game.
13. Currency systems can evolve over time.
14. The player can create a new currency through political action.
15. Currency reform has real economic consequences.

### State identity

16. Country name, flag and currency are mutable GameState.
17. Renaming a country is a political act.
18. Changing a flag is a political act.
19. Custom flag images should be supported.
20. The consequences of symbolic changes depend on political context.
21. State identity may change repeatedly across the campaign.
22. Political customization should preserve broad player freedom without bypassing institutions.

---

## 24. Intentionally deferred

Not yet fixed:

- exact price formula;
- exact market geographic boundaries;
- market-clearing algorithm;
- price elasticity;
- merchant AI;
- exchange-rate formula;
- bullion arbitrage;
- central banking;
- interest rates;
- credit creation;
- banknotes;
- reserve requirements;
- inflation formula;
- debt restructuring;
- detailed redenomination mechanics;
- detailed constitutional procedures for renaming;
- faction reactions to symbols;
- emblem and heraldry editor;
- flag image technical limits and storage format.

These should be designed when implementation reaches them.
