// Authored for user execution; no long-run calibration assertions.
const {test,expect}=require('@playwright/test');
const {Simulation,ordinal}=require('../shared/simulation.cjs');
const {generateSettlements}=require('../shared/settlements.cjs');
const {makeSave,validateSave}=require('../shared/save.cjs');
const economy=require('../shared/economy.cjs'),autonomy=require('../shared/autonomous-economy.cjs'),partitions=require('../shared/economy-partitions.cjs');
const chains=require('./fixtures/production-chains.cjs'),world=require('./fixtures/world-economy.cjs');
const stock=(f,id)=>f.inventories.find(s=>s.goodId===id);
function create(rules={}){
  const input=chains.createScenario();input.economy.rules.consumerNeeds=[{id:'food',goodId:'food',priority:'essential',perPersonNumerator:1,perPersonDenominator:100,usage:'consumable'}];
  input.settlements=generateSettlements(input.population,chains.hierarchy,input.countries,1700);
  for(const f of input.economy.enterprises)input.settlements.placements.push({enterpriseId:f.id,settlementId:input.settlements.rows[0].id,kind:'settlement'});
  const s=new Simulation(input,chains.hierarchy);s.enableAutonomy({birthRateBps:0,deathRateBps:0,foodFeedback:false,...rules});return s;
}
function month(s){const d=s.clock.date;s.step(ordinal({year:d.year+(d.month===12?1:0),month:d.month===12?1:d.month+1,day:1})-ordinal(d));return s.snapshot();}
function impoverished(s){const state=s.snapshot();for(const h of state.systems.economy.households)h.cashMinor=0;for(const f of state.systems.economy.enterprises)f.cashMinor=0;s.load(state);}
test('past payroll and payout never become another forecast income',()=>{
  const a=create(),b=create(),opening=a.snapshot(),e=opening.systems.economy;
  e.households[0].cashMinor=0;for(const f of e.enterprises)f.wagePerWorkerMinor=0;
  a.load(opening);const altered=structuredClone(opening);altered.systems.economy.households[0].stats.wages=100000;altered.systems.economy.households[0].stats.payout=100000;b.load(altered);
  month(a);month(b);expect(b.serialize()).toBe(a.serialize());
});
test('fully offered equilibrium stock does not create reserve-driven price inflation',()=>{
  const s=create(),state=s.snapshot(),e=state.systems.economy,f=e.enterprises.find(f=>f.recipeId==='prepare-food');stock(f,'food').quantity=10;s.load(state);
  const next=month(s),g=next.systems.economy.markets[0].goods.find(g=>g.goodId==='food');expect(g.stats.supply).toBe(10);expect(g.stats.affordableDemand).toBe(10);expect(g.priceMinor).toBe(10);expect(g.priceRemainder).toBe(0);
});
test('a physically needed chain restarts from zero plans with real wages and purchases',()=>{
  const s=create(),state=s.snapshot(),e=state.systems.economy;e.households[0].cashMinor=0;for(const f of e.autonomy.firms)f.plannedBatches=0;s.load(state);
  const cash=s.economicReport().cash;let produced=0,purchased=0;
  for(let i=0;i<8;i++){const next=month(s),report=s.economicReport();expect(report.cash).toBe(cash);produced+=report.goods.food.produced;purchased+=report.goods.food.householdPurchased;for(const f of next.systems.economy.enterprises)for(const v of f.inventories)expect(v.quantity).toBeGreaterThanOrEqual(0);}
  expect(produced).toBeGreaterThan(0);expect(purchased).toBeGreaterThan(0);
});
test('input procurement keeps the next planned payroll rather than spending all cash',()=>{
  const s=create(),state=s.snapshot(),e=state.systems.economy;e.households[0].cashMinor=0;for(const f of e.enterprises)f.wagePerWorkerMinor=0;
  const buyer=e.enterprises.find(f=>f.recipeId==='prepare-food'),seller=e.enterprises.find(f=>f.recipeId==='mill-flour');buyer.wagePerWorkerMinor=2;buyer.cashMinor=32;stock(seller,'flour').quantity=100;s.load(state);
  const next=month(s),f=next.systems.economy.enterprises.find(f=>f.id===buyer.id);expect(f.stats.batches).toBe(0);expect(f.stats.inputPurchases).toBe(30);expect(f.cashMinor).toBe(2);expect(stock(f,'flour').quantity).toBe(3);
});
test('idle capacity and already owned inputs do not inflate the cash reserve',()=>{
  const s=create(),e=s.snapshot().systems.economy,f=e.enterprises.find(f=>f.recipeId==='prepare-food'),r=e.recipes.find(r=>r.id===f.recipeId),c=e.autonomy.firms.find(c=>c.enterpriseId===f.id);f.capacityBatches=1000;c.plannedBatches=1;c.salesAverage=0;stock(f,'flour').quantity=30;
  expect(autonomy.workingReserve(e,f,r,e.markets[0],c)).toBe(8);
});
test('an idle seller distributes current realized profit without reserving unused capacity',()=>{
  const s=create(),state=s.snapshot(),e=state.systems.economy,f=e.enterprises.find(f=>f.recipeId==='prepare-food');stock(f,'food').quantity=1000;f.cashMinor=250;s.load(state);
  const before=s.economicReport().cash,next=month(s),after=next.systems.economy.enterprises.find(v=>v.id===f.id);expect(after.stats.batches).toBe(0);expect(after.stats.profit).toBe(100);expect(after.stats.payout).toBe(100);expect(s.economicReport().cash).toBe(before);
});
test('a material-blocked processor is not closed solely by a hypothetical cost margin',()=>{
  const s=create({closeMonths:1,windowMonths:1}),state=s.snapshot(),e=state.systems.economy;e.markets[0].goods.find(g=>g.goodId==='flour').priceMinor=40;s.load(state);
  const next=month(s),f=next.systems.economy.enterprises.find(f=>f.recipeId==='prepare-food'),c=next.systems.economy.autonomy.firms.find(c=>c.enterpriseId===f.id);expect(f.stats.batches).toBe(0);expect(c.idleReason).toBe('materials');expect(c.status).toBe('active');
});
test('one hungry month has no demographic effect; persistent hunger is bounded and optional',()=>{
  const a=create({birthRateBps:300,deathRateBps:250,foodFeedback:true}),b=create({birthRateBps:300,deathRateBps:250,foodFeedback:false});impoverished(a);impoverished(b);
  const first=month(a);month(b);expect(autonomy.foodEffects(first.systems.economy).size).toBe(0);expect(a.populationSummary().total).toBe(b.populationSummary().total);
  for(let i=1;i<24;i++){month(a);month(b);}const state=a.snapshot(),effects=autonomy.foodEffects(state.systems.economy);expect(effects.size).toBe(1);for(const v of effects.values()){expect(v.birthReductionBps).toBeGreaterThan(0);expect(v.birthReductionBps).toBeLessThanOrEqual(5000);expect(v.extraDeathRateBps).toBeLessThanOrEqual(250);}expect(a.populationSummary().total).toBeLessThan(b.populationSummary().total);expect(state.systems.population.cohorts[0].birthRateBps).toBe(300);
  a.configureFoodFeedback(false);expect(autonomy.foodEffects(a.snapshot().systems.economy).size).toBe(0);
});
test('legacy autonomy saves require explicit food feedback activation and reject invalid history atomically',()=>{
  const s=create(),state=s.snapshot();delete state.systems.economy.autonomy.foodSecurity;s.load(state);expect(s.economicReport().diagnostics.foodFeedbackEnabled).toBe(false);s.configureFoodFeedback(true);
  const before=s.serialize();for(const mutate of [a=>a.foodSecurity=null,a=>a.foodSecurity.enabled=1,a=>a.foodSecurity.households[0].remainder=12,a=>a.foodSecurity.households.push(a.foodSecurity.households[0])]){const invalid=s.snapshot();mutate(invalid.systems.economy.autonomy);expect(()=>s.load(invalid)).toThrow();expect(s.serialize()).toBe(before);}
});
test('food history, demographic carries and chain stocks survive save/load continuation',()=>{
  const a=create({birthRateBps:300,deathRateBps:250,foodFeedback:true}),b=create();impoverished(a);for(let i=0;i<10;i++)month(a);const save=makeSave(a.snapshot());validateSave(save,chains.hierarchy);b.load(save.state);for(let i=0;i<8;i++){month(a);month(b);}expect(b.serialize()).toBe(a.serialize());
});
test('market partitions project and merge food history without duplicating households',()=>{
  const s=new Simulation(world.createScenario(),world.hierarchy,{proceduralWorld:{adjacency:world.adjacency}});s.enableAutonomy();const state=s.snapshot(),e=state.systems.economy,p=state.systems.population,period={year:1700,month:1},expected=economy.prepareEconomyMonth(e,p,world.hierarchy,period).state;
  const parts=partitions.partitionMarkets(e,2).map(ids=>{const local=partitions.project(e,ids),provinces=new Set(local.markets.flatMap(m=>m.provinceIds)),hierarchy={...world.hierarchy,territories:world.hierarchy.territories.filter(t=>provinces.has(t.id))};return economy.prepareValidatedMonth(local,{cohorts:p.cohorts.filter(c=>provinces.has(c.territoryId))},hierarchy,period).state;});
  const merged=partitions.merge(e,parts,world.hierarchy,period).state;expect(merged).toEqual(expected);expect(merged.autonomy.foodSecurity.households).toHaveLength(e.households.length);
});
test('diagnostics separate physical need, unaffordable need, paid rationing and regional exposure',()=>{
  const s=create();impoverished(s);month(s);const r=s.economicReport('province:00001'),g=r.goods.food;expect(g.need).toBeGreaterThan(0);expect(g.affordableDemand).toBe(0);expect(g.unaffordable).toBe(g.need);expect(g.rationedDemand).toBe(0);expect(r.diagnostics.region.constraints).toContain('purchasing-power');expect(r.diagnostics.naturalFoodConsumed).toBe(0);expect(r.diagnostics.unmetFoodRegionPopulationBps).toBe(10000);
});
