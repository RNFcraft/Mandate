const {test,expect}=require('@playwright/test');
const {Simulation,ordinal}=require('../shared/simulation.cjs');
const {makeSave,validateSave}=require('../shared/save.cjs');
const {validateEconomyState}=require('../shared/economy.cjs');
const registry=require('../shared/production-registry.cjs');
const {hierarchy,createScenario}=require('./fixtures/production-chains.cjs');
const engine=(input=createScenario())=>new Simulation(input,hierarchy,{seed:123});
const enterprise=(e,id)=>e.enterprises.find(row=>row.recipeId===id);
const stock=(e,id)=>e.inventories.find(row=>row.goodId===id);
function month(s){const {year,month}=s.clock.date;s.step(ordinal({year:year+(month===12?1:0),month:month===12?1:month+1,day:1})-ordinal(s.clock.date));return s.economySummary();}

test('three chains advance through purchased opening inventories and conserve twelve monthly balances',()=>{
  const input=createScenario(),before=JSON.stringify(input),s=engine(input);
  const start={'grow-grain':1,'mill-flour':2,'prepare-food':3,'grow-fiber':1,'spin-yarn':2,'weave-cloth':3,'sew-clothing':4,'harvest-timber':1,'make-charcoal':2,'mine-iron-ore':1,'smelt-iron':3,'forge-tools':4};
  for(let m=1;m<=12;m++){
    const opening=s.economySummary(),e=month(s);validateEconomyState(e,hierarchy);
    expect(e.stats.cashBefore).toBe(1300000);expect(e.stats.cashAfter).toBe(1300000);
    for(const r of e.recipes){
      const firm=enterprise(e,r.id);expect(firm.stats.batches).toBe(m>=start[r.id]?10:0);
      for(const i of r.inputs)expect(firm.stats.batches*i.quantity).toBeLessThanOrEqual(stock(enterprise(opening,r.id),i.goodId).quantity);
      expect(firm.stats.productionCost).toBe(firm.stats.wages+firm.stats.inputsConsumedValue);
      expect(firm.stats.profit).toBe(firm.stats.revenue-firm.stats.cogs);
      for(const inventory of firm.inventories){expect(inventory.quantity).toBeGreaterThanOrEqual(0);expect(inventory.bookValueMinor).toBeGreaterThanOrEqual(0);}
    }
    expect(e.enterprises.reduce((n,f)=>n+f.stats.revenue,0)).toBe(e.enterprises.reduce((n,f)=>n+f.stats.inputPurchases,0)+e.households[0].stats.spending);
    for(const b of e.stats.goods){
      expect(b.opening+b.produced-b.inputsConsumed-b.householdConsumed).toBe(b.closing);
      expect(b.closing).toBe(e.enterprises.reduce((n,f)=>n+stock(f,b.goodId).quantity,0));
    }
    if(m===1){const spinner=enterprise(e,'spin-yarn');expect(spinner.stats.batches).toBe(0);expect(spinner.stats.inputPurchases).toBe(400);expect(stock(spinner,'fiber')).toEqual({goodId:'fiber',quantity:40,bookValueMinor:400});}
    if(m===2)expect(enterprise(e,'spin-yarn').stats.inputsConsumedValue).toBe(400);
  }
  expect(stock(enterprise(s.economySummary(),'sew-clothing'),'clothing').quantity).toBe(90);
  expect(stock(enterprise(s.economySummary(),'forge-tools'),'tools').quantity).toBe(90);
  expect(JSON.stringify(input)).toBe(before);expect(Object.isFrozen(registry.recipes[0].output)).toBe(true);
});

test('materials, both smelting inputs, labor, capacity, payroll and purchasing cash constrain chains',()=>{
  for(const [mutate,expected] of [
    [s=>stock(enterprise(s.economy,'smelt-iron'),'charcoal').quantity=4,2],
    [s=>stock(enterprise(s.economy,'smelt-iron'),'iron-ore').quantity=9,3],
    [s=>s.population.cohorts[0].count=12,3],
    [s=>enterprise(s.economy,'smelt-iron').cashMinor=8,2],
    [s=>enterprise(s.economy,'smelt-iron').capacityBatches=1,1]
  ]){
    const input=createScenario();for(const f of input.economy.enterprises)f.capacityBatches=0;
    const smelter=enterprise(input.economy,'smelt-iron');smelter.capacityBatches=10;
    stock(smelter,'charcoal').quantity=20;stock(smelter,'iron-ore').quantity=30;
    mutate(input);expect(enterprise(month(engine(input)),'smelt-iron').stats.batches).toBe(expected);
  }
  const input=createScenario(),spinner=enterprise(input.economy,'spin-yarn');spinner.cashMinor=20;
  const s=engine(input),first=month(s);expect(stock(enterprise(first,'spin-yarn'),'fiber').quantity).toBe(2);
  expect(enterprise(month(s),'spin-yarn').stats.batches).toBe(0);
});

test('chain saves resume identically, independent of row order and tick batching',()=>{
  const a=engine(),input=createScenario();
  for(const key of ['goods','recipes','enterprises','markets','households'])input.economy[key].reverse();
  input.economy.markets[0].goods.reverse();for(const f of input.economy.enterprises)f.inventories.reverse();for(const r of input.economy.recipes)r.inputs.reverse();
  const b=engine(input);a.step(59);
  const save=JSON.parse(JSON.stringify(makeSave(a.snapshot())));validateSave(save,hierarchy);
  expect(stock(enterprise(save.state.systems.economy,'weave-cloth'),'yarn').quantity).toBe(30);
  const resumed=engine();resumed.load(save.state);a.step(306);resumed.step(306);for(let d=0;d<365;d++)b.step();
  expect(a.serialize()).toBe(resumed.serialize());expect(a.serialize()).toBe(b.serialize());
});

test('additional stages and alternative methods require only scenario data',()=>{
  const input=createScenario(),e=input.economy;
  // Extend the four-stage textile chain to six stages without core changes.
  for(const [id,previous] of [['uniform','clothing'],['packed-uniform','uniform']]){
    e.goods.push({id,name:id,quantityUnit:'unit',minPriceMinor:1,maxPriceMinor:10000});
    e.markets[0].goods.push({goodId:id,priceMinor:10});for(const f of e.enterprises)f.inventories.push({goodId:id,quantity:0,bookValueMinor:0});
    e.recipes.push({id:'make-'+id,inputs:[{goodId:previous,quantity:1}],output:{goodId:id,quantity:1},workersPerBatch:1});
    e.enterprises.push({...structuredClone(e.enterprises[0]),id:'enterprise-'+id,recipeId:'make-'+id});
  }
  e.recipes.push({id:'spin-yarn-alternative',inputs:[{goodId:'fiber',quantity:2}],output:{goodId:'yarn',quantity:3},workersPerBatch:2});
  enterprise(e,'spin-yarn').recipeId='spin-yarn-alternative';
  const s=engine();const extended=engine(input);for(let m=1;m<=6;m++)month(extended);
  expect(stock(enterprise(extended.economySummary(),'make-packed-uniform'),'packed-uniform').quantity).toBe(10);
  expect(enterprise(extended.economySummary(),'spin-yarn-alternative').stats.workers).toBe(20);
  expect(s.economySummary().goods).toHaveLength(12);expect(registry.goods).toHaveLength(12);
});

test('overflow during a chain month leaves the entire simulation and events untouched',()=>{
  const s=engine();s.step(30);const state=s.snapshot();
  stock(enterprise(state.systems.economy,'grow-fiber'),'fiber').quantity=Number.MAX_SAFE_INTEGER;
  s.load(state);const before=s.serialize(),events=[];s.subscribe(e=>events.push(e));
  expect(()=>s.step()).toThrow('overflow');expect(s.serialize()).toBe(before);expect(events).toEqual([]);
});
