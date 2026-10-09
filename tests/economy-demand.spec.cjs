const {test,expect}=require('@playwright/test');
const {Simulation,ordinal}=require('../shared/simulation.cjs');
const {validateEconomyScenario,validateEconomyState}=require('../shared/economy.cjs');
const {makeSave,validateSave}=require('../shared/save.cjs');
const fixture=require('./fixtures/economy-demand.cjs');
const chains=require('./fixtures/production-chains.cjs');
const old=require('./fixtures/economy.cjs');
const clone=structuredClone;
const firm=(e,id)=>e.enterprises.find(f=>f.recipeId===id);
const stock=(f,id)=>f.inventories.find(s=>s.goodId===id);
const demand=(h,id)=>h.consumerState.find(s=>s.needId===id).stats;
const engine=(input=fixture.createScenario())=>new Simulation(input,fixture.hierarchy,{seed:123});
function month(s){const {year,month}=s.clock.date;s.step(ordinal({year:year+(month===12?1:0),month:month===12?1:month+1,day:1})-ordinal(s.clock.date));return s.economySummary();}
function supplied(){
  const input=chains.createScenario(),e=input.economy;
  e.rules.maxPriceAdjustmentBps=0;e.rules.profitPayoutBps=0;
  e.rules.consumerNeeds=[
    {id:'food',goodId:'food',priority:'essential',perPersonNumerator:1,perPersonDenominator:100,usage:'consumable'},
    {id:'clothing',goodId:'clothing',priority:'ordinary',perPersonNumerator:1,perPersonDenominator:100,usage:'durable'}
  ];
  for(const f of e.enterprises){f.capacityBatches=0;f.wagePerWorkerMinor=0;}
  stock(firm(e,'prepare-food'),'food').quantity=10;stock(firm(e,'prepare-food'),'food').bookValueMinor=50;
  stock(firm(e,'sew-clothing'),'clothing').quantity=10;stock(firm(e,'sew-clothing'),'clothing').bookValueMinor=70;
  e.households[0].cashMinor=200;return input;
}
function balances(e){
  validateEconomyState(e,fixture.hierarchy);expect(e.stats.cashAfter).toBe(e.stats.cashBefore);
  expect([...e.households,...e.enterprises].reduce((n,a)=>n+a.cashMinor,0)).toBe(e.stats.cashAfter);
  expect(e.enterprises.reduce((n,f)=>n+f.stats.revenue,0)).toBe(e.enterprises.reduce((n,f)=>n+f.stats.inputPurchases,0)+e.households.reduce((n,h)=>n+h.stats.spending,0));
  for(const a of [...e.households,...e.enterprises])expect(a.cashMinor).toBeGreaterThanOrEqual(0);
  for(const b of e.stats.goods){
    expect(b.opening+b.inUseOpening+b.produced-b.inputsConsumed-b.householdConsumed).toBe(b.closing+b.inUseClosing);
    expect(b.closing).toBe(e.enterprises.reduce((n,f)=>n+stock(f,b.goodId).quantity,0));
    expect(b.inUseClosing).toBe(e.households.reduce((n,h)=>n+(h.inUse.find(s=>s.goodId===b.goodId)?.quantity||0),0));
  }
}

test('one common budget buys food and clothing; durable goods retain physical stock and purchase value',()=>{
  const input=supplied(),before=JSON.stringify(input),s=engine(input),e=month(s),h=e.households[0];
  expect(h.cashMinor).toBe(0);expect(h.stats.spending).toBe(200);
  expect(demand(h,'food')).toMatchObject({need:10,purchased:10,spending:100});expect(demand(h,'clothing')).toMatchObject({need:10,purchased:10,spending:100});
  expect(h.inUse).toEqual([{goodId:'clothing',quantity:10,bookValueMinor:100}]);
  expect(firm(e,'prepare-food').stats).toMatchObject({revenue:100,cogs:50,profit:50});expect(firm(e,'sew-clothing').stats).toMatchObject({revenue:100,cogs:70,profit:30});
  expect(e.stats.goods.find(b=>b.goodId==='food').householdConsumed).toBe(10);
  expect(e.stats.goods.find(b=>b.goodId==='clothing')).toMatchObject({householdConsumed:0,inUseAdded:10,inUseClosing:10});balances(e);
  const next=month(s);expect(demand(next.households[0],'clothing').need).toBe(0);expect(next.households[0].inUse).toEqual(h.inUse);balances(next);
  expect(JSON.stringify(input)).toBe(before);
});

test('budget is reserved by category then ID, even when clearing sorts clothing ahead of food',()=>{
  const input=supplied(),e=input.economy;e.households[0].cashMinor=150;e.rules.consumerNeeds.reverse();
  const result=month(engine(input)),h=result.households[0];
  expect(demand(h,'food').purchased).toBe(10);expect(demand(h,'clothing')).toMatchObject({need:10,affordableDemand:5,purchased:5,unaffordableNeed:5,rationedDemand:0});
  expect(h.stats.spending).toBe(150);balances(result);
  // Luxury food supplements never displace essential food or ordinary clothing.
  e.rules.consumerNeeds.push({id:'extra-food',goodId:'food',priority:'luxury',perPersonNumerator:1,perPersonDenominator:100,usage:'consumable'});
  stock(firm(e,'prepare-food'),'food').quantity=20;
  const luxury=month(engine(input));expect(demand(luxury.households[0],'extra-food').affordableDemand).toBe(0);balances(luxury);
});

test('physical shortage and partial fills leave reserved money idle until the next month',()=>{
  const input=supplied();input.economy.households[0].cashMinor=150;stock(firm(input.economy,'prepare-food'),'food').quantity=3;
  const result=month(engine(input)),h=result.households[0];
  expect(demand(h,'food')).toMatchObject({need:10,affordableDemand:10,purchased:3,unaffordableNeed:0,rationedDemand:7,unmetNeed:7});
  expect(demand(h,'clothing').purchased).toBe(5);expect(h.cashMinor).toBe(70);expect(h.stats.spending).toBe(80);balances(result);
  stock(firm(input.economy,'prepare-food'),'food').quantity=0;stock(firm(input.economy,'prepare-food'),'food').bookValueMinor=0;
  const none=month(engine(input));expect(demand(none.households[0],'clothing').purchased).toBe(5);expect(none.households[0].cashMinor).toBe(100);balances(none);
});

test('multiple needs for the same good share money, supply and a single durable target',()=>{
  const input=supplied(),e=input.economy;e.households[0].cashMinor=1000;
  e.rules.consumerNeeds.push(
    {id:'food-extra',goodId:'food',priority:'essential',perPersonNumerator:1,perPersonDenominator:200,usage:'consumable'},
    {id:'food-luxury',goodId:'food',priority:'luxury',perPersonNumerator:1,perPersonDenominator:1000,usage:'consumable'},
    {id:'clothing-extra',goodId:'clothing',priority:'ordinary',perPersonNumerator:1,perPersonDenominator:100,usage:'durable'},
    {id:'clothing-luxury',goodId:'clothing',priority:'luxury',perPersonNumerator:1,perPersonDenominator:50,usage:'durable'}
  );
  const result=month(engine(input)),h=result.households[0];
  expect(demand(h,'food').purchased).toBe(10);expect(demand(h,'food-extra').purchased).toBe(0);expect(demand(h,'food-luxury').purchased).toBe(0);
  expect(demand(h,'clothing-extra').need).toBe(0);expect(demand(h,'clothing-luxury').need).toBe(10);
  expect(h.inUse[0].quantity).toBe(10);expect(h.stats.spending).toBe(200);balances(result);
});

test('initial durable stock offsets the target; population changes increase target without monthly destruction',()=>{
  const input=supplied();input.economy.households[0].inUse=[{goodId:'clothing',quantity:7,bookValueMinor:21}];
  const s=engine(input),first=month(s);expect(demand(first.households[0],'clothing').purchased).toBe(3);expect(first.households[0].inUse[0]).toEqual({goodId:'clothing',quantity:10,bookValueMinor:51});balances(first);
  const state=s.snapshot();state.systems.population.cohorts[0].count=1200;s.load(state);
  const second=month(s);expect(demand(second.households[0],'clothing').need).toBe(2);expect(second.households[0].inUse[0].quantity).toBe(10);balances(second);
});

test('overlapping durable targets do not duplicate even unaffordable or physically unfilled needs',()=>{
  const input=supplied(),e=input.economy;e.households[0].cashMinor=120;
  e.rules.consumerNeeds.push({...clone(e.rules.consumerNeeds[1]),id:'extra-clothing'});
  stock(firm(e,'sew-clothing'),'clothing').quantity=1;
  const result=month(engine(input)),h=result.households[0];
  expect(demand(h,'clothing')).toMatchObject({need:10,affordableDemand:2,purchased:1,unaffordableNeed:8,rationedDemand:1});
  expect(demand(h,'extra-clothing').need).toBe(0);expect(h.inUse[0].quantity).toBe(1);expect(h.cashMinor).toBe(10);balances(result);
});

test('rounding carries consumable fractions but floors durable targets without accumulating replacements',()=>{
  const input=supplied();input.population.cohorts[0].count=1;
  for(const n of input.economy.rules.consumerNeeds){n.perPersonNumerator=1;n.perPersonDenominator=3;}
  const s=engine(input);month(s);const second=month(s);
  expect(second.households[0].consumerState.find(s=>s.needId==='food').remainder).toBe(2);
  expect(second.households[0].consumerState.find(s=>s.needId==='clothing').remainder).toBe(0);
  const third=month(s);expect(demand(third.households[0],'food').purchased).toBe(1);expect(demand(third.households[0],'clothing').purchased).toBe(0);
});

test('large validated norms use exact BigInt products for affordable demand and safe remainders',()=>{
  const input=supplied();input.economy.rules.consumerNeeds[0].perPersonNumerator=9000000000000001;input.economy.rules.consumerNeeds[0].perPersonDenominator=9000000000000000;
  const result=month(engine(input));expect(demand(result.households[0],'food').need).toBe(1000);
  expect(result.households[0].consumerState.find(s=>s.needId==='food').remainder).toBe(1000);balances(result);
});

test('two local markets run twelve chain months with independent purchases, scarcity, prices and durable saturation',()=>{
  const s=engine(),saturated=[];let peakPrice=0;
  for(let m=1;m<=12;m++){
    const opening=s.economySummary(),result=month(s),rich=result.households.find(h=>h.id==='household-local'),poor=result.households.find(h=>h.id==='household-poor');balances(result);
    expect(poor.inUse[0].quantity).toBe(0);expect(demand(poor,'basic-clothing').purchased).toBe(0);
    for(const f of result.enterprises){const r=result.recipes.find(r=>r.id===f.recipeId),previous=opening.enterprises.find(row=>row.id===f.id);for(const i of r.inputs)expect(f.stats.batches*i.quantity).toBeLessThanOrEqual(stock(previous,i.goodId).quantity);}
    if(m===4){expect(demand(rich,'basic-clothing').purchased).toBe(10);expect(firm(result,'forge-tools').stats.batches).toBe(10);}
    if(m>=8)saturated.push(demand(rich,'basic-clothing').need);
    peakPrice=Math.max(peakPrice,result.markets.find(m=>m.id==='market-workshops').goods.find(g=>g.goodId==='clothing').priceMinor);
  }
  expect(saturated).toEqual([10,0,0,0,0]);
  const result=s.economySummary(),richMarket=result.markets.find(m=>m.id==='market-workshops'),poorMarket=result.markets.find(m=>m.id==='market-poor');
  expect(richMarket.goods.find(g=>g.goodId==='clothing').priceMinor).toBeLessThan(peakPrice);expect(poorMarket.goods.find(g=>g.goodId==='clothing').priceMinor).toBe(30);
  expect(firm(result,'sew-clothing').inventories.find(g=>g.goodId==='clothing').quantity).toBe(40);
  expect(firm(result,'forge-tools').inventories.find(g=>g.goodId==='tools').quantity).toBe(90);
  // Give only the poor household buying power. Unavailable local clothing gets dearer;
  // the richer market sees exactly the same prices as the unchanged control run.
  const funded=fixture.createScenario();funded.economy.households[1].cashMinor=100000;
  const a=engine(),b=engine(funded);month(a);month(b);
  expect(b.economySummary().markets.find(m=>m.id==='market-workshops')).toEqual(a.economySummary().markets.find(m=>m.id==='market-workshops'));
  expect(b.economySummary().markets.find(m=>m.id==='market-poor').goods.find(g=>g.goodId==='clothing').priceMinor).toBe(33);
  expect(b.economySummary().households.find(h=>h.id==='household-poor').inUse[0].quantity).toBe(0);
});

test('consumer demand changes final sales, inventories and price while intermediates depend on enterprise orders',()=>{
  const input=fixture.createScenario(),noClothes=clone(input);noClothes.economy.rules.consumerNeeds[1].perPersonNumerator=0;
  const a=engine(input),b=engine(noClothes);for(let m=1;m<=4;m++){month(a);month(b);}
  const bought=a.economySummary(),idle=b.economySummary();
  expect(firm(bought,'sew-clothing').stats.revenue).toBeGreaterThan(0);expect(firm(idle,'sew-clothing').stats.revenue).toBe(0);
  expect(stock(firm(bought,'sew-clothing'),'clothing').quantity).toBe(0);expect(stock(firm(idle,'sew-clothing'),'clothing').quantity).toBe(10);
  const price=e=>e.markets.find(m=>m.id==='market-workshops').goods.find(g=>g.goodId==='clothing').priceMinor;
  expect(price(bought)).toBeGreaterThan(price(idle));
  expect(firm(bought,'weave-cloth').stats.revenue).toBeGreaterThan(0);
  const paused=fixture.createScenario();firm(paused.economy,'sew-clothing').capacityBatches=0;
  const c=engine(paused);for(let m=1;m<=4;m++)month(c);
  expect(firm(c.economySummary(),'weave-cloth').stats.revenue).toBe(0);expect(stock(firm(c.economySummary(),'weave-cloth'),'cloth').quantity).toBe(40);
});

test('save/load retains in-use holdings and fractions; input permutations and tick grouping are byte identical',()=>{
  const input=fixture.createScenario();input.economy.rules.consumerNeeds[0].perPersonDenominator=300;
  const a=engine(input),reordered=clone(input);
  for(const k of ['goods','recipes','markets','households','enterprises'])reordered.economy[k].reverse();reordered.economy.rules.consumerNeeds.reverse();
  for(const m of reordered.economy.markets){m.goods.reverse();m.provinceIds.reverse();}for(const e of reordered.economy.enterprises)e.inventories.reverse();for(const r of reordered.economy.recipes)r.inputs.reverse();
  const b=engine(reordered);a.step(151);
  const save=JSON.parse(JSON.stringify(makeSave(a.snapshot())));validateSave(save,fixture.hierarchy);
  expect(save.state.systems.economy.households.find(h=>h.id==='household-local').inUse[0].quantity).toBe(20);
  const resumed=engine();resumed.load(save.state);a.step(214);resumed.step(214);for(let d=0;d<365;d++)b.step();
  expect(a.serialize()).toBe(resumed.serialize());expect(a.serialize()).toBe(b.serialize());
  const reversed=a.snapshot();reversed.systems.economy.households.forEach(h=>{h.consumerState.reverse();h.inUse.reverse();});reversed.systems.economy.rules.consumerNeeds.reverse();resumed.load(reversed);
  expect(resumed.serialize()).toBe(a.serialize());
});

const invalid={unknownGood:e=>e.rules.consumerNeeds[0].goodId='absent',duplicate:e=>e.rules.consumerNeeds.push(clone(e.rules.consumerNeeds[0])),priority:e=>e.rules.consumerNeeds[0].priority='urgent',zeroDenominator:e=>e.rules.consumerNeeds[0].perPersonDenominator=0,float:e=>e.rules.consumerNeeds[0].perPersonNumerator=.5,negative:e=>e.rules.consumerNeeds[0].perPersonNumerator=-1,unsafe:e=>e.rules.consumerNeeds[0].id='constructor',usage:e=>e.rules.consumerNeeds[0].usage='capital',conflictingUsage:e=>e.rules.consumerNeeds.push({...clone(e.rules.consumerNeeds[1]),id:'conflict',usage:'consumable'}),negativeStock:e=>e.households[0].inUse=[{goodId:'clothing',quantity:-1,bookValueMinor:0}],badStock:e=>e.households[0].inUse=[{goodId:'clothing',quantity:0,bookValueMinor:1}],nonDurableStock:e=>e.households[0].inUse=[{goodId:'food',quantity:1,bookValueMinor:1}],null:e=>e.rules.consumerNeeds=null};
for(const [name,mutate] of Object.entries(invalid))test('consumer schema rejects '+name,()=>{const e=supplied().economy;mutate(e);expect(()=>validateEconomyScenario(e,fixture.hierarchy)).toThrow('Economy:');});

test('corrupted consumer saves are rejected atomically',()=>{
  const s=engine(supplied());month(s);const before=s.serialize();
  for(const mutate of [e=>e.households[0].inUse[0].quantity++,e=>e.households[0].inUse[0].bookValueMinor=-1,e=>e.households[0].consumerState[0].remainder=100,e=>e.households[0].consumerState[0].stats.purchased++,e=>e.households[0].consumerState.pop(),e=>e.stats.goods.find(b=>b.goodId==='clothing').inUseAdded++]){
    const bad=s.snapshot();mutate(bad.systems.economy);expect(()=>validateSave(makeSave(bad),fixture.hierarchy)).toThrow('Economy:');expect(()=>s.load(bad)).toThrow('Economy:');expect(s.serialize()).toBe(before);
  }
});

test('consumer arithmetic overflow leaves GameState, RNG and events unchanged',()=>{
  for(const cause of ['need','book']){
    const s=engine(supplied());s.step(30);const state=s.snapshot(),e=state.systems.economy;
    if(cause==='need')e.rules.consumerNeeds[0].perPersonNumerator=Number.MAX_SAFE_INTEGER;
    else e.households[0].inUse[0]={goodId:'clothing',quantity:1,bookValueMinor:Number.MAX_SAFE_INTEGER};
    s.load(state);const before=s.serialize(),events=[];s.subscribe(event=>events.push(event));
    expect(()=>s.step()).toThrow('overflow');expect(s.serialize()).toBe(before);expect(events).toEqual([]);
  }
});

test('old food-only saves retain their exact schema and implicit demand matches equivalent opt-in food',()=>{
  const legacy=clone(old.scenario),explicit=clone(legacy);
  explicit.economy.rules.consumerNeeds=[{id:'food',goodId:'food',priority:'essential',perPersonNumerator:1,perPersonDenominator:1,usage:'consumable'}];
  const a=new Simulation(legacy,old.hierarchy),b=new Simulation(explicit,old.hierarchy);
  for(let m=1;m<=12;m++){
    const ea=month(a),eb=month(b);expect(ea.enterprises).toEqual(eb.enterprises);expect(ea.markets).toEqual(eb.markets);expect(ea.households[0].stats).toEqual(eb.households[0].stats);
    expect(ea.households[0]).not.toHaveProperty('inUse');expect(ea.households[0]).not.toHaveProperty('consumerState');expect(ea.stats.goods[0]).not.toHaveProperty('inUseAdded');
  }
  const save=JSON.parse(JSON.stringify(makeSave(a.snapshot())));validateSave(save,old.hierarchy);b.load(save.state);a.step(31);b.step(31);expect(a.serialize()).toBe(b.serialize());
});
