# Mandate — Political Game Over & Historical Legacy

> Status: **core concept agreed**; implementation planned, not shipped  
> Scope: political player life cycle, end conditions, historical record, post-game narrative, future language-model integration  
> Key rule: **there is no victory condition**. The player's goal is to leave a mark on the history produced by the simulation.

## 1. Vision: a political sandbox, not a conquest game

Mandate is an autonomous political, social and economic simulation, not a scripted history or a world-conquest challenge.

The player acts as a political force (for the parliamentary-party scenario, specifically **their party**), not an omnipotent state controller. Other parties, governments, institutions, populations, enterprises and countries continue to act according to their own interests and constraints. Players may propose and attempt political decisions, but cannot guarantee passage or execution.

**There is no win screen, victory score or mandatory world-conquest objective.** A party's legacy, including both intended and unintended effects, is the natural result of playing. Neither holding power for a long time nor passing many laws constitutes an automatic victory.

The simulation's authoritative rules and history must not be driven by a narrative script or language-model invention.

## 2. Political Game Over: removal from parliament

**Agreed core rule for the party/parliamentary gameplay scenario:**

1. The player's party loses **all parliamentary representation**.
2. This **does not end the game immediately**. The party has until the **next parliamentary election** to recover and return to parliament.
3. During this period the player continues to act through whatever lawful political avenues the actual political simulation permits (party organization, public support, alliances, campaigns, etc.). No automatic recovery is guaranteed.
4. At the next election, if the player's party **regains parliamentary representation**, normal play continues.
5. If the party **still has no parliamentary representation** following that election, the player's political history ends: **Game Over**.

**Game Over is not defeat.** It is the end of the player's playable political trajectory, not a judgment that the party was bad, unsuccessful or irrelevant.

An election, seat allocation, and the end of the recovery period must come from authoritative political state and events, not a detached UI countdown. The world, state, economy and other political parties do **not** end when the player's party does.

### Cases intentionally not decided yet

- How the equivalent condition works when the playable actor is a dynasty, movement or individual rather than a parliamentary party.
- Regimes without a parliament, abolition/suspension of parliament, banned parties, non-electoral transitions, delayed/cancelled or snap elections.
- Whether the end-of-game screen permits a non-interactive observer mode, and under which rules.

These questions must be resolved when the political and constitutional systems are designed. **Do not invent a universal timer or force parliamentary rules onto all historical regimes.**

## 3. Global end: extinction of humanity

A second, fundamentally distinct ending exists if **humanity is completely extinct** in the simulated world.

This is a world-level end, not a partisan or governmental defeat. It must be detected from authoritative demographic state rather than a scripted "apocalypse" event. With no humanity left, the human political/social simulation has reached its end.

Resources are physically constrained: finite, non-renewable resources can run out. However, **resource exhaustion does not imply that extinction must occur on a predetermined date**. Technological change, reuse/recycling, substitution, renewable flows, institutional adaptation and changing consumption may alter the outcome. Neither extinction nor survival should be guaranteed by a script.

The game must distinguish global human extinction from temporary demographic collapse, loss of the player's country, loss of parliamentary representation, and reaching a calendar milestone. Mandate's broad 1700–2200 design horizon is **not a victory condition**; exact calendar-end policy remains open.

## 4. The historical textbook ending

When the first ending occurs (the player's party fails to return at the next election), instead of a victory/defeat screen the game should present **a chapter of a history textbook** about that party and its role in the simulated world.

The presentation is a historical account, not a raw statistics dump, although it must include **verifiable statistics**.

It should be able to cover, insofar as the simulation has sufficient data:

- Founding, ideology, leadership, periods of opposition and government, coalitions and splits.
- Elections, vote shares, seats, entry and exit from parliament; the final recovery opportunity and election result.
- Proposed, rejected and enacted laws; reforms, institutional changes, economic and political decisions.
- Observed societal, economic, demographic and diplomatic developments during and after the party's actions.
- Crises, trade-offs, resistance, conflicts, unintended consequences and political decline.
- What institutions, policies and effects outlived the party, and which were later reversed.
- Selected quantitative indicators with units, dates, baseline comparisons and explicit source events.

**Desired feel:** a coherent, nuanced textbook chapter that describes *what happened* and *what trace the party left*, not a celebratory awards screen. It must be able to describe limited influence, reversals, failed policies or a brief political existence without manufacturing achievements.

The chapter should not assert causal certainty from mere correlation. Example: a reform and a later rise in living standards can both be facts, but the claim that the reform *caused* the improvement requires evidence from modeled mechanisms or carefully qualified narration.

The historical narrative is an interpretation of recorded simulation facts, not an additional authority that changes what happened.

## 5. Historical memory: required simulation-facing architecture

The end screen cannot be implemented faithfully if game history is reconstructed solely from the latest GameState snapshot. Design a **persistent, queryable historical record** early enough that important events are not discarded.

Proposed data categories (schema is not yet approved):

- Stable political actor IDs and continuity across party/name/leadership changes.
- Time-stamped election results: eligible context, vote shares, seats, governing participation.
- Proposals and political decisions: proposers, supporters, opposition, institutional outcome, entry into force and subsequent repeal.
- Significant contextual events: political transitions, wars, crises, demographic and economic changes.
- Periodic, bounded statistical snapshots: prices, incomes, welfare, employment, population, public finance, etc. where relevant.
- Evidence links from claims to event IDs and comparable snapshots.
- Recorded status transitions for the player's party: represented → unrepresented/recovery pending → represented again OR political Game Over.

Historical storage must avoid copying entire world states at every tick. Use append-only meaningful events and appropriately spaced summaries/checkpoints, with a bounded, scalable storage policy. Replay and save/load behavior must remain deterministic at the **fact/event** level.

Use the existing authoritative GameState + event/cadence design; do not make a second competing "historian simulation."

## 6. Qwen3 4B and LoRA (later development stage)

**Planned language-model direction:** Qwen3 **4B**, with dedicated **LoRA adapters to be developed after the game is completed / sufficiently mature** so that political dialogue, characters, language and historical prose can feel more alive.

This is **planned**, not a claim that a model, adapters, dataset or inference runtime are integrated today.

Possible future uses include:

- Writing the final textbook chapter in natural, context-sensitive prose.
- Dialogue and politically distinctive language for actors and institutions.
- Presentation of competing historical interpretations, if this feature is later approved.
- Natural-language parsing of political proposals, subject to validation by game rules.

**Hard boundary:** Qwen3 4B and any LoRA adapters may interpret, narrate and format **only facts and permitted intentions**. They must not independently invent enacted laws, fabricate historical election results, mint money, change resources or impose political outcomes. Structured, validated commands go through the simulation engine; factual generation is grounded in a supplied history dossier and may not override the authoritative state.

Implement a reliable non-LLM fallback for historical summaries so this Game Over feature remains possible without AI runtime, model files or a capable GPU. LoRA training is a separate later workstream and should use appropriately recorded, curated game history instead of treating free-form model output as ground truth.

## 7. Suggested implementation order (not yet done)

1. **Political identity and institutional facts:** formalize parties and representation in the real political engine; track election outcomes and the active playable political actor.
2. **Loss/recovery state machine:** detect zero seats; preserve gameplay until the next valid election; reconcile restoration or Game Over; define edge cases as separate design decisions.
3. **Long-term history storage:** persistent event IDs, institutional provenance, party trajectories and small periodic statistics. Introduce save schema/version migration and bounded retention.
4. **Historical report compiler:** produce a deterministic structured dossier of facts, dates, comparisons and source-event links. Reject unsupported causal claims.
5. **First textbook ending without LLM:** show a readable chapter and sourced numerical appendix built from the dossier.
6. **World extinction condition:** trigger only when actual human population becomes zero according to the demographic authority; handle world-end presentation separately from political ending.
7. **After the game is mature:** integrate optional Qwen3 4B narration, controlled political dialogue and later LoRA adapters; verify factual faithfulness and behavior under missing model/timeout.
8. **Optional later decisions:** observer mode, historiographic schools, exportable chronicle, other forms of political actor and non-parliamentary Game Over rules.

## 8. Acceptance criteria

- Losing all seats **does not** instantly end a party campaign.
- Recovering representation at the next parliamentary election **prevents** Game Over.
- Remaining without seats after that election **does** end the player's campaign, but not the underlying world.
- Political Game Over is never labeled "defeat"; there is no victory state.
- Final textbook chapter contains only auditable, dated facts and appropriately qualified interpretations; statistics match the recorded simulation.
- Save/load before and after representation loss reproduces the same election outcome and end condition from identical state and commands.
- The final chronicle is available without any LLM model installed.
- Resource depletion alone cannot invoke an arbitrary extinction flag; genuine extinction is based on authoritative total human population.
- The Game Over subsystem does not introduce scripted historical outcomes or bypass political, demographic or economic rules.

## 9. Design boundary / status

**Agreed vision:** no victory; political party Game Over after failure to return at the next election; no "defeat" framing; possible global ending only upon human extinction; history-textbook chapter with statistics as the political ending; Qwen3 4B planned and LoRA adapters postponed until after the game is ready.

**Still open:** political edge cases across regimes and actor types; exact chronicle UI; observer mode; detailed history schema; LLM hosting, training data, prompt constraints, adapter design and deployment.

This document is a design roadmap, **not evidence that these systems already exist in Mandate's runtime**.
