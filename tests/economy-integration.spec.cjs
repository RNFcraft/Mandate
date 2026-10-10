const {test,expect}=require('@playwright/test'),{Simulation,ordinal,validateGameState}=require('../shared/simulation.cjs'),{makeSave,validateSave}=require('../shared/save.cjs'),{EconomyPool}=require('../shared/economy-pool.cjs'),{Worker}=require('node:worker_threads'),path=require('node:path');
const fixture=require('./fixtures/economy-integration.cjs');
const create=()=>{const s=new Simulation(fixture.createScenario(),fixture.hierarchy,{landAdjacency:fixture.adjacency});s.enableAutonomy({birthRateBps:0,deathRateBps:0,foodFeedback:false});return s;};
const days=s=>{const d=s.clock.date;return ordinal({year:d.year+(d.month===12?1:0),month:d.month===12?1:d.month+1,day:1})-ordinal(d);};
const month=s=>{s.step(days(s));return s.snapshot();};
test('land market links come only from explicit published-style adjacency',()=>{
  const s=create(),edges=s.snapshot().systems.economy.trade.edges;expect(edges).toHaveLength(1);for(const edge of edges)expect(fixture.adjacency.neighbors[edge.provinceA]).toContain(edge.provinceB);
});
test('food import is paid, owned, consumed next month and then replenished',()=>{
  const s=create(),cash=s.economicReport().cash,first=month(s),e=first.systems.economy,house=e.households.find(h=>h.id==='household-neighbor'),owned=e.trade.householdStocks.find(h=>h.householdId===house.id);
  expect(e.trade.month.quantity).toBe(10);expect(e.trade.month.freight).toBe(8);expect(e.trade.month.workers).toBe(1);expect(owned.quantity).toBe(10);expect(house.stats.purchased).toBe(0);expect(house.cashMinor).toBeLessThan(10000);expect(e.stats.cashAfter).toBe(cash);validateGameState(first,fixture.hierarchy);
  const second=month(s),h=second.systems.economy.households.find(h=>h.id===house.id);expect(h.stats.purchased).toBe(10);expect(second.systems.economy.trade.householdStocks.find(row=>row.householdId===h.id).quantity).toBe(10);expect(s.economicReport().cash).toBe(cash);
});
test('current export profits are distributed once rather than trapped after local clearing',()=>{
  const s=create(),e=month(s).systems.economy,f=e.enterprises.find(f=>f.recipeId==='prepare-food');expect(f.stats.profit).toBeGreaterThan(0);expect(f.stats.payout).toBeGreaterThan(0);expect(f.stats.payout).toBeLessThanOrEqual(f.stats.profit);expect(e.households.find(h=>h.id===f.ownerRef.id).stats.payout).toBeGreaterThan(0);
});
test('persistent observed losses adapt the wage by one unit without imposing a price floor',()=>{
  const s=create(),state=s.snapshot(),e=state.systems.economy,f=e.enterprises.find(f=>f.recipeId==='grow-grain'),c=e.autonomy.firms.find(c=>c.enterpriseId===f.id);f.wagePerWorkerMinor=8;c.observations=6;Object.assign(f.stats,{batches:1,workers:1,wages:8,productionCost:8,revenue:4,cogs:8,profit:-4});e.markets[0].goods.find(g=>g.goodId==='grain').priceMinor=1;s.load(state);const next=month(s);expect(next.systems.economy.enterprises.find(v=>v.id===f.id).wagePerWorkerMinor).toBe(7);expect(next.systems.economy.markets[0].goods.find(g=>g.goodId==='grain').priceMinor).toBe(1);
});
test('trade cannot exceed a route capacity or the buyer cash',()=>{
  for(const money of [0,10000]){const s=create(),state=s.snapshot();state.systems.economy.trade.rules.capacityPerEdge=1;state.systems.economy.households.find(h=>h.id==='household-neighbor').cashMinor=money;s.load(state);const e=month(s).systems.economy;expect(e.trade.month.quantity).toBe(money?1:0);expect(e.households.every(h=>h.cashMinor>=0)).toBe(true);}
});
test('no carrier labor means no freight, inventory transfer or shipment payment',()=>{
  const s=create(),state=s.snapshot();state.systems.economy.rules.laborParticipationBps=0;s.load(state);const e=month(s).systems.economy;expect(e.trade.month.quantity).toBe(0);expect(e.trade.month.freight).toBe(0);
});
test('different accounting units do not silently perform foreign exchange',()=>{
  const s=create(),state=s.snapshot();state.systems.economy.markets[1].accountingUnitId='other-unit';s.load(state);expect(month(s).systems.economy.trade.month.quantity).toBe(0);
});
test('save/load preserves paid food stocks and resumes the complete history deterministically',()=>{
  const a=create(),b=create();month(a);const save=makeSave(a.snapshot());validateSave(save,fixture.hierarchy);b.load(save.state);for(let i=0;i<6;i++){month(a);month(b);}expect(b.serialize()).toBe(a.serialize());
});
test('monthly history is independent of UI requests, playback chunks and clock speed',()=>{
  const a=create(),b=create();a.step(365);for(let i=0;i<365;i++){b.step();if(i%20===0)b.economyAnalytics();}expect(b.serialize()).toBe(a.serialize());expect(a.snapshot().systems.economyHistory.monthly).toHaveLength(12);expect(a.snapshot().systems.economyHistory.annual[0].months).toBe(12);
});
test('monthly history is bounded and annual flows are sums rather than money balances',()=>{
  const s=create();for(let i=0;i<121;i++)month(s);const h=s.snapshot().systems.economyHistory;expect(h.monthly).toHaveLength(120);expect(h.annual).toHaveLength(11);expect(h.annual.at(-1).months).toBe(1);for(const row of h.annual){expect(row.totalFoodConsumed).toBeLessThanOrEqual(row.totalFoodNeed);expect(row.totalBatches).toBeGreaterThanOrEqual(row.batches);}
});
test('country scope follows actual ownership without assigning the entire market',()=>{
  const s=create();month(s);const owner=s.ownership.get('province:00001'),before=s.economyAnalytics({scope:'country',id:owner}).point.population;s.submit({type:'SetOwnership',ids:['province:00002'],owner:null});expect(s.economyAnalytics({scope:'country',id:owner}).point.population).toBe(before-1000);expect(s.economyAnalytics({scope:'country',id:owner}).monthly).toEqual([]);
});
test('old saves without trade or history remain loadable and do not invent a past series',()=>{
  const s=create(),state=s.snapshot();delete state.systems.economy.trade;delete state.systems.economyHistory;s.load(state);expect(s.economyAnalytics().monthly).toEqual([]);month(s);expect(s.snapshot().systems.economy.trade).toBeUndefined();expect(s.economyAnalytics().monthly).toHaveLength(1);
});
test('invalid trade/history and overflow reject atomically before clock/RNG commits',()=>{
  const s=create();month(s);const before=s.serialize();for(const mutate of [v=>v.systems.economy.trade.month.freight++,v=>v.systems.economyHistory.monthly[0].foodBps=10001,v=>v.systems.economy.trade.householdStocks[0].quantity=-1]){const state=s.snapshot();mutate(state);expect(()=>s.load(state)).toThrow();expect(s.serialize()).toBe(before);}
  const overflowing=create(),opening=overflowing.snapshot();opening.systems.economy.trade.householdStocks[0].quantity=Number.MAX_SAFE_INTEGER;opening.systems.economy.trade.householdOpening=Number.MAX_SAFE_INTEGER;overflowing.load(opening);overflowing.step(30);const original=overflowing.serialize();expect(()=>overflowing.step()).toThrow(/overflow/);expect(overflowing.serialize()).toBe(original);
});
for(const size of [1,2])test(`coordinator trade and history match the complete ${size}-worker state after save/load`,async()=>{
  const a=create(),b=create(),pool=new EconomyPool({size,createWorker:()=>new Worker(path.resolve('scripts/economy-worker.cjs'))});try{for(let i=0;i<12;i++){a.step(days(a));await b.stepAsync(days(b),pool);expect(b.serialize()).toBe(a.serialize());if(i===5)b.load(JSON.parse(b.serialize()));}}finally{pool.dispose();}
});
