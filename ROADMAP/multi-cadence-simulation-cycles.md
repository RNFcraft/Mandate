# Mandate — Multi-Cadence Simulation Cycles

> Status: settled architecture direction  
> Scope: simulation timing, dependency order and cross-system effects  
> Core rule: one daily world clock, multiple system cadences

## 1. Core idea

Mandate should **not** recalculate the whole world in one monolithic economic tick.

Instead, the simulation uses one canonical daily clock while individual systems update on their own cadence.

```text
WORLD CLOCK
1 tick = 1 day

        ↓

daily systems
weekly systems
monthly systems
quarterly systems
yearly systems
```

A system's cadence is part of its simulation design.

Different systems may therefore evolve at different speeds while still sharing one GameState.

---

## 2. Why this fits Mandate

Many processes operate on different real-world timescales.

Examples:

```text
army movement
→ days

transport disruption
→ days / weeks

market restocking
→ days / weeks

enterprise operations
→ weeks / months

wages and household consumption
→ months

tax collection and state budgets
→ months / quarters

investment and expansion
→ quarters

structural demographic / institutional trends
→ months / years
```

Updating every system every day would waste computation and create unnecessary noise.

Updating everything only once per month would make fast processes feel disconnected and sluggish.

Multi-cadence simulation avoids both problems.

---

## 3. Suggested cadence groups

These are architectural defaults, not an immutable final list.

### Daily

Good candidates:

- simulation clock;
- war and army movement;
- occupations / control changes;
- active construction progress where useful;
- transport incidents and route disruption;
- political events with exact dates;
- emergency effects;
- event scheduling;
- fast state changes that other systems need to observe quickly.

### Weekly

Good candidates:

- transport and logistics flows;
- market deliveries / replenishment;
- short-term trade routing;
- labor-market adjustments;
- enterprise operational adjustments;
- local shortage propagation;
- stock movement between connected markets.

### Monthly

Good candidates:

- production accounting;
- wages and household income;
- population consumption;
- market demand aggregation;
- price adjustment;
- enterprise revenue / costs / profit;
- taxes and regular state revenue;
- government expenditure;
- demographic births / deaths;
- resource extraction accounting;
- inventory and stock updates.

The existing population system already demonstrates this architecture by advancing on month boundaries while the canonical simulation clock remains daily.

### Quarterly

Good candidates:

- enterprise investment;
- expansion / contraction;
- enterprise creation or closure pressure;
- major hiring or layoffs;
- capital allocation;
- larger trade-network changes;
- government investment programs;
- credit / banking decisions when those systems exist.

### Yearly

Good candidates:

- long-run structural statistics;
- slow institutional changes;
- long-term demographic indicators;
- infrastructure condition baselines;
- slow renewable-resource regeneration where appropriate;
- long-term productivity / education / social trend aggregation.

Not every slow process must be yearly; some may use their own interval if gameplay requires it.

---

## 4. Systems remain dependent on each other

Different cadences do **not** make systems isolated.

Every system reads the shared simulation state and writes effects that later systems can observe.

Example chain:

```text
war damages a transport route
        ↓
daily state changes
        ↓
weekly logistics delivers less grain
        ↓
monthly market sees lower supply
        ↓
food price rises
        ↓
household real income falls
        ↓
consumption changes
        ↓
enterprise demand changes
        ↓
political dissatisfaction rises
        ↓
political systems react
```

This dependency chain is a central Mandate design goal.

The simulation should feel like interacting processes rather than independent minigames.

---

## 5. Cadence does not remove execution order

Whenever multiple systems are due on the same date, they must execute in a deterministic explicit order.

Avoid systems mutating one another chaotically or depending on JavaScript/module registration order.

Conceptually:

```text
date advances
↓
run due daily systems in fixed order
↓
if weekly boundary:
    run weekly systems in fixed order
↓
if monthly boundary:
    run monthly systems in fixed order
↓
if quarterly boundary:
    run quarterly systems in fixed order
↓
if yearly boundary:
    run yearly systems in fixed order
↓
commit resulting state
↓
emit events / update presentation
```

The exact subsystem order inside each cadence can be decided when those systems are implemented.

---

## 6. Read → calculate → commit principle

Complex systems should prefer staged updates.

```text
read authoritative state
↓
calculate proposed changes
↓
validate
↓
commit
```

A system should not leave half-applied changes if an error occurs during calculation.

This is especially important for:

- population;
- markets;
- enterprise accounting;
- trade;
- state budgets;
- resource depletion;
- ownership / control transitions.

---

## 7. Previous-cycle state is allowed and often desirable

Circular dependencies are normal in an economy.

Example:

```text
price affects production
production affects supply
supply affects price
```

Mandate should not attempt to solve every cycle as one simultaneous mathematical equilibrium.

Instead, many decisions can react to the latest completed state.

Example:

```text
month N prices
→ enterprise decisions during month N+1
→ production and supply
→ month N+1 market result
→ new prices
→ month N+2 decisions
```

This naturally creates:

- lag;
- overshoot;
- delayed reactions;
- shortages;
- booms;
- recessions;
- adaptation over time.

Those are useful simulation outcomes rather than errors.

---

## 8. Cross-cadence data contract

Systems should communicate through authoritative GameState fields and explicit events, not by directly reaching into each other's private implementation.

Conceptually:

```text
logistics
writes:
- delivered quantities
- route capacity
- disruption state

market
reads those values
writes:
- inventory
- shortages
- prices

enterprise
reads market state
writes:
- production
- employment
- profit/loss

state finance
reads:
- taxable flows
- enterprise/state revenue
writes:
- treasury
- budget result
```

This keeps systems composable and testable.

---

## 9. A cadence scheduler belongs in the simulation kernel

The simulation kernel should eventually expose an explicit registry/order for scheduled systems.

Conceptually:

```text
DAILY_SYSTEMS
WEEKLY_SYSTEMS
MONTHLY_SYSTEMS
QUARTERLY_SYSTEMS
YEARLY_SYSTEMS
```

Each list has a deterministic order.

The calendar determines which lists are due.

The scheduler should remain portable:

- no DOM;
- no renderer dependency;
- no wall-clock dependency;
- deterministic from GameState + commands + seed.

---

## 10. Game speed is separate from simulation cadence

Player-selected speed controls how quickly calendar days are processed in real time.

It does **not** change simulation rules.

Example:

```text
x1 speed
→ process days slowly

x100 speed
→ process the same deterministic days quickly
```

A monthly system still runs on the same simulated date regardless of real-time playback speed.

---

## 11. Performance principle

Expensive work should run only as often as the simulation needs it.

The architecture therefore supports:

- cheap daily systems;
- moderate weekly systems;
- heavier monthly systems;
- expensive strategic quarterly/yearly systems.

This becomes increasingly important with:

- 5,001 gameplay provinces;
- many enterprises;
- many markets;
- transport networks;
- resource deposits;
- population cohorts;
- AI actors.

A subsystem may also internally use dirty sets / affected regions so that even a scheduled cycle does not have to recompute the entire world.

---

## 12. Example integrated cadence

A possible future month can evolve like this:

```text
DAY 3
war closes a mountain route

DAY 7
weekly logistics:
coal and food deliveries fall

DAY 14
weekly labor / trade:
some enterprises cannot obtain enough inputs

DAY 21
weekly logistics:
inventories continue falling

MONTH END
monthly economy:
- enterprises record reduced production
- households consume available goods
- shortages are aggregated
- prices adjust
- wages / revenue / profit are booked
- taxes are collected
- population demographics update

NEXT QUARTER
- loss-making enterprises reduce investment
- profitable substitute producers expand
- government may authorize infrastructure spending

NEXT POLITICAL CYCLE
- higher food prices and unemployment affect public support
```

No single "economy tick" owns the whole chain.

The result emerges from dependent cycles.

---

## 13. Settled decisions

1. Mandate keeps a canonical **1 day = 1 simulation tick** world clock.
2. The world is not recalculated through one monolithic economic tick.
3. Systems have their own cadences.
4. Daily, weekly, monthly, quarterly and yearly cadence groups are valid core categories.
5. Exact cadence belongs to each subsystem and may differ where needed.
6. Systems share authoritative GameState and affect one another across cadence boundaries.
7. Effects may propagate with realistic delay rather than instantly.
8. Multiple systems due on the same date execute in a deterministic explicit order.
9. Complex updates should prefer staged read → calculate → validate → commit behavior.
10. Previous-cycle values may drive current decisions; the simulation does not require universal instantaneous equilibrium.
11. Game speed changes real-time processing rate, not simulation cadence or outcomes.
12. The cadence scheduler belongs in the portable deterministic simulation kernel.
13. Expensive systems should run only as frequently as needed.
14. Future systems should expose explicit state/results for dependent systems rather than tightly coupling private internals.
15. Multi-cadence dependencies are the intended foundation for economy, logistics, population, politics, war, resources and later science.

---

## 14. Intentionally deferred

Not fixed yet:

- exact weekday used for weekly boundaries;
- whether some logistics run every 3–7 days rather than exactly weekly;
- exact ordering of future economic subsystems inside monthly execution;
- exact quarterly investment rules;
- which political systems are event-driven versus scheduled;
- whether selected resource regeneration processes use monthly, seasonal or yearly cycles;
- dirty-region / incremental-update optimization;
- worker-thread or parallel execution strategy;
- dependency graph representation in code.

These can be decided when the relevant systems are implemented without changing the core architecture.
