# Mandate — Enterprise Ownership & Operations v1

> Status: planning draft  
> Scope: ownership and operation of productive enterprises  
> Goal: make enterprises persistent economic actors whose owners can change without destroying the enterprise itself

## 1. Core principle

An enterprise is a persistent economic asset.

It should not exist only as a building placed by the player.

An enterprise has its own:

- workers;
- equipment;
- inventories;
- production process;
- revenues;
- costs;
- owner;
- operator / management.

Ownership can change while the enterprise itself continues to exist.

---

## 2. Ownership types

For the first playable version, enterprises may be owned by:

- private individuals;
- aristocrats / boyars / landlords;
- merchants;
- private companies or groups of owners;
- local / regional government;
- central government.

Later versions may add:

- banks;
- investment funds;
- cooperatives;
- worker ownership;
- mixed public-private ownership;
- other institutional forms.

The v1 architecture should not prevent these later additions.

---

## 3. Ownership and management are separate

A key distinction:

```text
owner
→ who legally/economically owns the enterprise
→ receives profits or bears losses

manager / operator
→ who runs day-to-day operations
→ makes operational decisions
```

Examples:

```text
state-owned mine
→ owned by central government
→ operated by appointed director
```

```text
boyar-owned manufactory
→ owned by private aristocrat
→ managed by hired administrator
```

This allows ownership changes without requiring the enterprise itself to disappear.

---

## 4. Enterprise persistence

If an enterprise changes owner, it should keep its existing economic state where appropriate.

For example:

```text
enterprise
- workers
- machinery
- buildings
- inventories
- production history
- local supply links

owner changes
↓
enterprise continues operating
```

A sale, nationalization or privatization is therefore primarily an ownership transfer.

---

## 5. State-owned enterprises

The state may directly own productive assets.

Possible examples:

- mines;
- arsenals;
- shipyards;
- manufactories;
- transport infrastructure operators;
- later strategic industry;
- energy companies.

State-owned enterprises should still have real operating costs.

Government ownership should not make production free.

They may still require:

- labor;
- inputs;
- equipment;
- maintenance;
- management;
- capital investment.

---

## 6. Government purchase of enterprises

The government may buy an existing private enterprise.

Conceptually:

```text
private enterprise
→ state purchase
→ ownership changes to state
→ purchase price paid from treasury
→ enterprise continues operating
```

Reasons may later include:

- strategic importance;
- war;
- supply security;
- political policy;
- rescue from failure;
- infrastructure integration;
- state expansion into an industry.

The exact political and pricing rules are deferred.

---

## 7. Government sale of enterprises

The state may sell an enterprise to private ownership.

Conceptually:

```text
state-owned enterprise
→ sale
→ ownership changes to private owner
→ sale proceeds enter treasury
```

This can be used to:

- raise immediate treasury revenue;
- reduce state operating obligations;
- shift sectors into private ownership;
- restructure the economy.

The enterprise remains the same physical/economic asset unless the new owner later changes it.

---

## 8. Nationalization and privatization

Two general ownership-transfer directions should exist conceptually:

### Nationalization

```text
private ownership
→ state ownership
```

### Privatization

```text
state ownership
→ private ownership
```

In early versions, these can be treated as ownership transfers.

Later political systems may add:

- compensation rules;
- forced seizure;
- legal disputes;
- parliamentary approval;
- corruption;
- political backlash;
- ideology;
- international consequences.

These are intentionally deferred.

---

## 9. Enterprise economic loop

The enterprise itself should follow a real economic cycle.

```text
buy inputs
↓
hire labor
↓
use equipment / capital
↓
produce outputs
↓
sell outputs
↓
receive revenue
↓
pay wages / inputs / taxes / maintenance
↓
profit or loss
```

This loop should work regardless of whether the enterprise is privately or publicly owned.

---

## 10. Profit and loss

Ownership matters because profits and losses flow somewhere.

Examples:

```text
private enterprise profit
→ private owner / company

state-owned enterprise profit
→ state accounts / retained enterprise capital

local-government enterprise profit
→ local authority
```

Likewise, persistent losses may require:

- owner capital;
- loans;
- subsidies;
- restructuring;
- closure.

Exact accounting is deferred.

---

## 11. State ownership is not direct player micromanagement

Even when the state owns an enterprise, the player should not automatically control every operational detail.

The political layer may influence:

- budgets;
- appointments;
- strategic priorities;
- subsidies;
- investment;
- ownership decisions.

Managers/operators should handle normal enterprise operations according to the simulation.

This preserves the broader Mandate principle:

> The player acts through institutions rather than directly controlling every economic unit.

---

## 12. Decisions considered settled for v1

1. Enterprises are persistent economic actors/assets.
2. Ownership can change without destroying the enterprise.
3. Private individuals, aristocrats/boyars, companies, local government and central government can own enterprises.
4. Ownership and management/operator are separate concepts.
5. The state can own productive enterprises.
6. The state can buy existing private enterprises.
7. The state can sell state-owned enterprises.
8. Sale proceeds can enter the treasury.
9. Nationalization and privatization are conceptually ownership transfers.
10. State-owned enterprises still require real labor, inputs, equipment and maintenance.
11. Enterprises should follow the same core production/accounting loop regardless of owner.
12. The player should influence state enterprises through institutions and policy rather than direct constant micromanagement.

---

## 13. Intentionally deferred

Not yet fixed:

- exact enterprise valuation;
- auction mechanics;
- compensation during nationalization;
- forced seizure rules;
- shareholder structures;
- stock exchanges;
- banks and credit;
- enterprise taxation;
- subsidies;
- bankruptcy;
- private investment behavior;
- manager AI;
- corruption;
- mixed ownership;
- political approval requirements;
- foreign ownership;
- concessions;
- monopolies;
- antitrust;
- worker ownership;
- cooperatives.

These should be decided when the enterprise and political systems are implemented.
