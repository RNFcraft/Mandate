const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {Simulation,validateGameState}=require('../shared/simulation.cjs');
const {makeSave,validateSave}=require('../shared/save.cjs');
const {validateEconomyScenario,validateEconomyState,initializeEconomy,prepareEconomyMonth}=require('../shared/economy.cjs');
const fixture=require('./fixtures/economy.cjs');
const clone=structuredClone;
// Compile a test-only reference using the previous global clearing scan.
async function clearingImplementation(legacy){
  const filename=path.resolve('shared/economy.cjs'),Module=require('node:module');
  let source=await fs.readFile(filename,'utf8');
  const indexed='const bucket=offersByMarket.get(order.marketId)?.get(order.goodId);if(!bucket)continue;';
  const start=source.indexOf(indexed),end=source.indexOf('      const quantity=Math.min(remaining,o.remaining,o.stock.quantity);',start);
  expect(start).toBeGreaterThan(0);expect(end).toBeGreaterThan(start);
  if(legacy)source=source.slice(0,start)+'for(const o of offers){ visits++; if(o.marketId!==order.marketId||o.goodId!==order.goodId||o.seller===order.buyer||!remaining)continue;\n'+source.slice(end);
  else source=source.replace('const o=bucket.offers[offerIndex];','const o=bucket.offers[offerIndex]; visits++;');
  const compiled=new Module(filename,module);compiled.filename=filename;compiled.paths=module.paths;
  compiled._compile('let visits=0;\n'+source+'\nmodule.exports.visits=()=>visits;',filename);return compiled.exports;
}

test('indexed clearing matches the old scan across markets, goods, self trades and exhausted sellers',async()=>{
  const input=processing(),e=input.economy,hierarchy=clone(fixture.hierarchy);
  e.rules.foodPerPersonDenominator=20;
  e.recipes.push({id:'loop',inputs:[{goodId:'food',quantity:1}],output:{goodId:'food',quantity:1},workersPerBatch:1},{id:'grain-farm',inputs:[],output:{goodId:'grain',quantity:2},workersPerBatch:1});
  e.markets.push({...clone(e.markets[0]),id:'market-second',provinceIds:['province:00002']});
  e.households.push({...clone(e.households[0]),id:'household-second',provinceId:'province:00002'});
  for(let market=2;market<12;market++){
    const provinceId='province:'+String(market+1).padStart(5,'0');
    hierarchy.territories.push({...clone(hierarchy.territories[0]),id:provinceId});
    e.markets.push({...clone(e.markets[0]),id:'market-'+market,provinceIds:[provinceId]});
    e.households.push({...clone(e.households[0]),id:'household-'+market,provinceId});
  }
  input.population.cohorts=e.households.map((h,i)=>({...clone(input.population.cohorts[0]),id:'pop-'+i,territoryId:h.provinceId}));
  e.enterprises=[];
  for(let market=0;market<12;market++)for(let i=0;i<24;i++){
    const recipeId=i%3===0?'loop':i%3===1?'farm':'grain-farm';
    e.enterprises.push({id:`enterprise-${market}-${String(i).padStart(2,'0')}`,provinceId:e.households[market].provinceId,ownerRef:{kind:'household',id:e.households[market].id},recipeId,capacityBatches:10,wagePerWorkerMinor:0,cashMinor:1000,inventories:[{goodId:'food',quantity:i%4,bookValueMinor:(i%4)*7},{goodId:'grain',quantity:i%5,bookValueMinor:(i%5)*3}]});
  }
  const indexed=await clearingImplementation(false),legacy=await clearingImplementation(true);
  let state=initializeEconomy(e,hierarchy);
  for(let m=1;m<=12;m++){
    const period={year:1700,month:m},expected=legacy.prepareEconomyMonth(state,input.population,hierarchy,period);
    const actual=indexed.prepareEconomyMonth(state,input.population,hierarchy,period);expect(actual).toEqual(expected);
    const permuted=clone(state);for(const key of ['goods','recipes','markets','households','enterprises'])permuted[key].reverse();
    for(const row of permuted.enterprises)row.inventories.reverse();
    expect(indexed.prepareEconomyMonth(permuted,input.population,hierarchy,period)).toEqual(expected);state=actual.state;
  }
  expect(indexed.visits()).toBeLessThan(legacy.visits());
  expect(state.stats.monthsProcessed).toBe(12);
});

test('indexed multi-good clearing preserves global-scan results and visit savings',async()=>{
  const fixture=require('./fixtures/economy-demand.cjs'),input=fixture.createScenario();
  input.economy.rules.consumerNeeds.push({id:'extra-food',goodId:'food',priority:'luxury',perPersonNumerator:1,perPersonDenominator:200,usage:'consumable'});
  const indexed=await clearingImplementation(false),legacy=await clearingImplementation(true);
  let state=initializeEconomy(input.economy,fixture.hierarchy);
  for(let m=1;m<=12;m++){
    const period={year:1700,month:m},expected=legacy.prepareEconomyMonth(state,input.population,fixture.hierarchy,period);
    const actual=indexed.prepareEconomyMonth(state,input.population,fixture.hierarchy,period);expect(actual).toEqual(expected);state=actual.state;
  }
  expect(indexed.visits()).toBeLessThan(legacy.visits());
});

test('economy saves require population and synchronized monthly counters before installation',()=>{
  const s=engine();s.step(365);const valid=s.snapshot();
  expect(valid.systems.population.stats.monthsProcessed).toBe(12);expect(valid.systems.economy.stats.monthsProcessed).toBe(12);
  expect(()=>validateSave(makeSave(valid),fixture.hierarchy)).not.toThrow();
  const target=engine();target.load(valid);const before=target.serialize();
  const missing=clone(valid);delete missing.systems.population;
  const mismatch=clone(valid);mismatch.systems.population.stats.monthsProcessed=11;
  const clockMismatch=clone(valid);clockMismatch.systems.economy.stats.monthsProcessed=11;clockMismatch.systems.population.stats.monthsProcessed=11;
  const invalidPopulation=clone(valid);invalidPopulation.systems.population.stats.monthsProcessed=-1;
  for(const bad of [missing,mismatch,clockMismatch,invalidPopulation]){
    expect(()=>validateGameState(bad,fixture.hierarchy)).toThrow();expect(()=>validateSave(makeSave(bad),fixture.hierarchy)).toThrow();
    expect(()=>target.load(bad)).toThrow();expect(target.serialize()).toBe(before);
  }
  const old=clone(valid);delete old.systems.economy;delete old.systems.population;
  expect(()=>target.load(old)).not.toThrow();expect(target.economySummary()).toBeNull();
});
const engine=(scenario=fixture.scenario)=>new Simulation(clone(scenario),fixture.hierarchy,{seed:123});
const month=s=>{const next=s.clock.date.month===12?{year:s.clock.date.year+1,month:1,day:1}:{year:s.clock.date.year,month:s.clock.date.month+1,day:1};const {ordinal}=require('../shared/simulation.cjs');s.step(ordinal(next)-ordinal(s.clock.date));return s.economySummary();};
function processing(){
  const s=clone(fixture.scenario),e=s.economy;
  e.goods.push({id:'grain',name:'Grain',quantityUnit:'kg',minPriceMinor:1,maxPriceMinor:1000});
  e.markets[0].goods.push({goodId:'grain',priceMinor:2});
  e.recipes[0]={id:'farm',inputs:[{goodId:'grain',quantity:2}],output:{goodId:'food',quantity:5},workersPerBatch:1};
  e.enterprises[0].inventories.push({goodId:'grain',quantity:40,bookValueMinor:80});return s;
}
test('twelve real monthly cycles conserve cash and goods with wages, sales, COGS and owner payout',()=>{
  const input=clone(fixture.scenario),bytes=JSON.stringify(input),s=engine(input);
  for(let i=0;i<12;i++){
    const e=month(s);expect(e.enterprises[0].stats).toEqual({batches:20,workers:20,wages:800,inputsConsumedValue:0,productionCost:800,inputPurchases:0,revenue:1000,cogs:800,profit:200,payout:200});
    expect(e.households[0].cashMinor).toBe(1000);expect(e.enterprises[0].cashMinor).toBe(1000);expect(e.stats.cashBefore).toBe(2000);expect(e.stats.cashAfter).toBe(2000);
    expect(e.stats.goods).toEqual([{goodId:'food',opening:0,produced:100,inputsConsumed:0,householdConsumed:100,closing:0}]);expect(e.stats.monthsProcessed).toBe(i+1);
  }
  expect(JSON.stringify(input)).toBe(bytes);expect(s.populationSummary().total).toBe(100);
  const summary=s.economySummary();summary.enterprises[0].cashMinor=0;expect(s.economySummary().enterprises[0].cashMinor).toBe(1000);
});
test('identical runs, reordered inputs, batching and JSON save continuation are byte identical',()=>{
  const a=engine(),input=clone(fixture.scenario);input.economy.goods.reverse();input.economy.markets[0].provinceIds.reverse();
  const b=engine(input);a.step(365);for(let i=0;i<365;i++)b.step();expect(a.serialize()).toBe(b.serialize());
  const c=engine();c.step(59);const saved=JSON.parse(JSON.stringify(makeSave(c.snapshot())));validateSave(saved,fixture.hierarchy);const d=engine();d.load(saved.state);c.step(306);d.step(306);expect(c.serialize()).toBe(d.serialize());expect(c.serialize()).toBe(a.serialize());
});
test('owned grain is consumed at book cost and cannot be borrowed from another enterprise',()=>{
  const s=engine(processing()),first=month(s),farm=first.enterprises[0];expect(farm.stats.inputsConsumedValue).toBe(80);expect(farm.stats.productionCost).toBe(880);expect(farm.stats.cogs).toBe(880);expect(farm.stats.profit).toBe(120);
  expect(first.stats.goods.find(g=>g.goodId==='grain')).toEqual({goodId:'grain',opening:40,produced:0,inputsConsumed:40,householdConsumed:0,closing:0});
  const second=month(s);expect(second.enterprises[0].stats.batches).toBe(0);expect(second.households[0].stats.purchased).toBe(0);
  const input=processing(),other=clone(input.economy.enterprises[0]);other.id='other';other.capacityBatches=0;input.economy.enterprises.push(other);input.economy.enterprises[0].inventories[1]={goodId:'grain',quantity:0,bookValueMinor:0};expect(month(engine(input)).enterprises.find(e=>e.id==='farm-local').stats.batches).toBe(0);
});
test('production is constrained by capacity, shared local labor, owned inputs and wage cash',()=>{
  for(const [mutate,batches]of [[s=>s.economy.enterprises[0].capacityBatches=3,3],[s=>s.population.cohorts[0].count=6,3],[s=>s.economy.enterprises[0].cashMinor=120,3],[s=>s.economy.enterprises[0].inventories[1].quantity=6,3]]){
    const input=processing();mutate(input);expect(month(engine(input)).enterprises[0].stats.batches).toBe(batches);
  }
  const input=clone(fixture.scenario);input.population.cohorts[0].count=50;input.economy.enterprises.push({...clone(input.economy.enterprises[0]),id:'second'});
  const e=month(engine(input));expect(e.enterprises.map(e=>e.stats.workers)).toEqual([20,5]);
});
test('physical shortage caps purchases, leaves unmet needs and raises the next price',()=>{
  const input=clone(fixture.scenario);input.economy.enterprises[0].capacityBatches=10;
  const s=engine(input),e=month(s);expect(e.households[0].stats).toMatchObject({essentialNeed:100,affordableDemand:100,purchased:50,unmetNeed:50,unaffordableNeed:0,rationedDemand:50,spending:500});
  expect(e.markets[0].goods[0].stats.shortage).toBe(50);expect(e.markets[0].goods[0].priceMinor).toBe(10); // +0.5 accumulates, never forced to an unbounded +1.
  const next=month(s);expect(next.markets[0].goods[0].priceMinor).toBe(11);expect(next.households[0].stats.spending).toBe(500); // Opening price remains 10.
});
test('surplus lowers prices, retains unsold goods and proportional book value without double-counting',()=>{
  const input=clone(fixture.scenario);input.economy.enterprises[0].capacityBatches=40;input.economy.enterprises[0].cashMinor=2000;
  const s=engine(input),e=month(s),farm=e.enterprises[0];expect(farm.inventories[0]).toEqual({goodId:'food',quantity:100,bookValueMinor:800});expect(farm.stats).toMatchObject({productionCost:1600,revenue:1000,cogs:800,profit:200});
  expect(e.markets[0].goods[0].stats.surplus).toBe(100);month(s);expect(s.economySummary().markets[0].goods[0].priceMinor).toBeLessThan(10);
});
test('affordability shortage is distinct from physical scarcity; unfunded needs do not raise price',()=>{
  const input=clone(fixture.scenario);input.economy.households[0].cashMinor=0;input.economy.enterprises[0].wagePerWorkerMinor=0;
  const s=engine(input),e=month(s);expect(e.households[0].stats).toMatchObject({essentialNeed:100,affordableDemand:0,purchased:0,unmetNeed:100,unaffordableNeed:100,rationedDemand:0});expect(e.markets[0].goods[0].priceMinor).toBe(9);expect(e.enterprises[0].inventories[0].quantity).toBe(100);
});
test('future input orders transfer real cash and inventories, but never restart production in the same month',()=>{
  const input=processing(),e=input.economy;e.enterprises[0].inventories[1]={goodId:'grain',quantity:0,bookValueMinor:0};
  e.recipes.push({id:'grain-farm',inputs:[],output:{goodId:'grain',quantity:2},workersPerBatch:1});
  e.enterprises.push({...clone(e.enterprises[0]),id:'grain-seller',recipeId:'grain-farm',wagePerWorkerMinor:0,capacityBatches:20,inventories:e.goods.map(g=>({goodId:g.id,quantity:0,bookValueMinor:0}))});
  const s=engine(input),first=month(s),farm=first.enterprises.find(e=>e.id==='farm-local');expect(farm.stats.batches).toBe(0);expect(farm.stats.inputPurchases).toBe(80);expect(farm.inventories.find(i=>i.goodId==='grain')).toEqual({goodId:'grain',quantity:40,bookValueMinor:80});
  expect(first.stats.cashBefore).toBe(first.stats.cashAfter);expect(month(s).enterprises.find(e=>e.id==='farm-local').stats.batches).toBe(20);
});
test('payout never creates cash, distributes losses or spends the next payroll reserve',()=>{
  const input=clone(fixture.scenario);input.economy.enterprises[0].cashMinor=800;
  const e=month(engine(input));expect(e.enterprises[0].cashMinor).toBe(800);expect(e.enterprises[0].stats.payout).toBe(200);
  input.economy.enterprises[0].wagePerWorkerMinor=60;input.economy.enterprises[0].cashMinor=1200;const loss=month(engine(input));expect(loss.enterprises[0].stats.profit).toBe(-200);expect(loss.enterprises[0].stats.payout).toBe(0);
});
test('fractional household demand and price changes persist remainders; price bounds are enforced',()=>{
  const input=clone(fixture.scenario);input.population.cohorts[0].count=1;input.economy.rules.foodPerPersonNumerator=1;input.economy.rules.foodPerPersonDenominator=3;input.economy.enterprises[0].capacityBatches=0;input.economy.rules.maxPriceAdjustmentBps=0;
  const s=engine(input);expect(month(s).households[0].stats.essentialNeed).toBe(0);expect(month(s).households[0].consumptionRemainder).toBe(2);expect(month(s).households[0].stats.essentialNeed).toBe(1);expect(s.economySummary().households[0].consumptionRemainder).toBe(0);
  const bounded=clone(fixture.scenario);bounded.economy.enterprises[0].capacityBatches=0;bounded.economy.goods[0].maxPriceMinor=11;const t=engine(bounded);t.step(365);expect(t.economySummary().markets[0].goods[0].priceMinor).toBe(11);
});
test('local markets have independent prices; market identity, multi-province coverage and politics remain independent',()=>{
  const input=clone(fixture.scenario),e=input.economy;input.population.cohorts.push({...clone(input.population.cohorts[0]),id:'pop-second',territoryId:'province:00002',count:100});
  e.markets.push({...clone(e.markets[0]),id:'remote-market',provinceIds:['province:00002']});e.households.push({...clone(e.households[0]),id:'remote-household',provinceId:'province:00002'});
  const s=engine(input),first=month(s);expect(first.households.find(h=>h.id==='remote-household').stats.purchased).toBe(0);month(s);expect(s.economySummary().markets.map(m=>m.goods[0].priceMinor)).toEqual([10,12]);
  const coverage=s.economySummary().markets.map(m=>m.provinceIds);s.submit({type:'SetOwnership',ids:['province:00001'],owner:null});expect(s.economySummary().markets.map(m=>m.provinceIds)).toEqual(coverage);
  e.markets[0].provinceIds.push('province:00002');e.markets.pop();const merged=month(engine(input));expect(merged.markets).toHaveLength(1);expect(merged.households.reduce((n,h)=>n+h.stats.purchased,0)).toBe(100);
  const reversed=clone(input);for(const k of ['households','markets','enterprises','goods','recipes'])reversed.economy[k].reverse();reversed.economy.markets[0].provinceIds.reverse();const a=engine(input),b=engine(reversed);a.step(365);b.step(365);expect(a.serialize()).toBe(b.serialize());
});
test('calendar runs exactly on month boundaries, including leap February and year rollover',()=>{
  const s=engine(),events=[];s.subscribe(e=>events.push(e));s.step(30);expect(s.economySummary().stats.monthsProcessed).toBe(0);s.step();expect(s.economySummary().stats.lastCompletedPeriod).toEqual({year:1700,month:1});expect(events.filter(e=>e.type==='economyUpdated')).toHaveLength(1);
  const input=clone(fixture.scenario);input.scenario.year=2000;const leap=engine(input);leap.step(59);expect(leap.clock.date).toEqual({year:2000,month:2,day:29});expect(leap.economySummary().stats.monthsProcessed).toBe(1);leap.step();expect(leap.economySummary().stats.lastCompletedPeriod).toEqual({year:2000,month:2});leap.step(306);expect(leap.economySummary().stats.lastCompletedPeriod).toEqual({year:2000,month:12});
});
test('failure preparing economy or population leaves both systems, clock, RNG and events untouched',()=>{
  for(const cause of ['economy','population']){
    const s=engine();s.step(30);const state=s.snapshot();
    if(cause==='economy'){state.systems.economy.households[0].cashMinor=0;state.systems.economy.enterprises[0].cashMinor=Number.MAX_SAFE_INTEGER;state.systems.economy.enterprises[0].inventories[0]={goodId:'food',quantity:Number.MAX_SAFE_INTEGER,bookValueMinor:0};}
    else{state.systems.population.cohorts[0].count=Number.MAX_SAFE_INTEGER;state.systems.population.cohorts[0].birthRateBps=10000;state.systems.economy.enterprises[0].capacityBatches=0;state.systems.economy.rules.foodPerPersonNumerator=0;}
    s.load(state);const before=s.serialize(),events=[];s.subscribe(e=>events.push(e));expect(()=>s.step()).toThrow('overflow');expect(s.serialize()).toBe(before);expect(events).toEqual([]);
  }
});
const invalid={version:e=>e.version=2,unknownGood:e=>e.rules.foodGoodId='missing',negativeCash:e=>e.households[0].cashMinor=-1,floatCash:e=>e.enterprises[0].cashMinor=.5,duplicateCoverage:e=>e.markets[0].provinceIds.push('province:00001'),atomicProvince:e=>e.markets[0].provinceIds[0]='atom:1',owner:e=>e.enterprises[0].ownerRef.id='missing',recipe:e=>e.enterprises[0].recipeId='missing',negativeInventory:e=>e.enterprises[0].inventories[0].quantity=-1,emptyInventoryBook:e=>e.enterprises[0].inventories[0].bookValueMinor=1,zeroLabor:e=>e.recipes[0].workersPerBatch=0,zeroPrice:e=>e.markets[0].goods[0].priceMinor=0,denominator:e=>e.rules.foodPerPersonDenominator=0,unsafeID:e=>e.households[0].id='constructor',floatCapacity:e=>e.enterprises[0].capacityBatches=.1};
for(const [name,mutate]of Object.entries(invalid))test(`economy scenario rejects ${name}`,()=>{const e=clone(fixture.economy);mutate(e);expect(()=>validateEconomyScenario(e,fixture.hierarchy)).toThrow('Economy:');});
test('corrupted runtime accounting, remainders, calendar and references reject load without changing authority',()=>{
  const s=engine();month(s);const before=s.serialize();
  for(const mutate of [e=>e.households[0].consumptionRemainder=1,e=>e.markets[0].goods[0].priceRemainder=10000,e=>e.enterprises[0].stats.profit++,e=>e.stats.cashAfter++,e=>e.stats.goods[0].closing++,e=>e.stats.lastCompletedPeriod.month=3,e=>e.enterprises[0].ownerRef.id='missing']){
    const bad=s.snapshot();mutate(bad.systems.economy);expect(()=>validateGameState(bad,fixture.hierarchy)).toThrow('Economy:');expect(()=>s.load(bad)).toThrow();expect(s.serialize()).toBe(before);
  }
});
test('safe integer scale uses exact intermediate products and preserves input book value on partial depletion',()=>{
  const input=processing();input.economy.enterprises[0].capacityBatches=1;input.economy.enterprises[0].inventories[1]={goodId:'grain',quantity:7,bookValueMinor:10};const s=engine(input),e=month(s);expect(e.enterprises[0].stats.inputsConsumedValue).toBe(2);expect(e.enterprises[0].inventories.find(i=>i.goodId==='grain')).toEqual({goodId:'grain',quantity:5,bookValueMinor:8});
  const big=clone(fixture.scenario);big.population.cohorts[0].count=591714189;big.economy.rules.foodPerPersonNumerator=30;big.economy.households[0].cashMinor=0;big.economy.enterprises[0].capacityBatches=0;expect(month(engine(big)).households[0].stats.essentialNeed).toBe(17751425670);
  const wide=initializeEconomy(fixture.economy,fixture.hierarchy);wide.rules.foodPerPersonNumerator=9000000000000001;wide.rules.foodPerPersonDenominator=9000000000000000;wide.enterprises[0].capacityBatches=0;expect(prepareEconomyMonth(wide,{cohorts:[{territoryId:'province:00001',count:100}]},fixture.hierarchy,{year:1700,month:1}).state.households[0].stats.essentialNeed).toBe(100);
});
test('population-only saves remain optional and cannot restore economy from the current scenario',()=>{
  const input=clone(fixture.scenario);delete input.economy;const s=engine(input);s.step(365);expect(s.economySummary()).toBeNull();expect(s.snapshot().systems.population.stats.monthsProcessed).toBe(12);
  const withEconomy=engine();withEconomy.load(JSON.parse(JSON.stringify(makeSave(s.snapshot()))).state);expect(withEconomy.economySummary()).toBeNull();withEconomy.step(31);expect(withEconomy.snapshot().systems.economy).toBeUndefined();
});
test('optional economy API asset, normal browser runtime, editor preservation and save continuation',async({request,page})=>{
  const id='economy-api-fixture',root=path.resolve('scenarios'),folder=path.resolve(root,id),saveRoot=path.resolve('saves'),saveFolder=path.resolve(saveRoot,id),snapshotFiles=['client/data/map-v2/manifest.json','client/data/map-v2/provinces.topo.json','scenarios/1700/ownership.json','scenarios/1700/population.json'];
  const hashes=async()=>Promise.all(snapshotFiles.map(async f=>crypto.createHash('sha256').update(await fs.readFile(f)).digest('hex'))),before=await hashes();
  try{
    await expect(fs.access(folder)).rejects.toThrow();const base=await(await request.get('/api/scenarios/1700')).json();base.scenario={...base.scenario,id,name:'Synthetic economy API fixture'};expect((await request.put(`/api/scenarios/${id}`,{data:base})).status()).toBe(200);
    const population=clone(fixture.population),asset=clone(fixture.economy),bytes=JSON.stringify(asset,null,3)+'\n';await fs.writeFile(path.join(folder,'population.json'),JSON.stringify(population));await fs.writeFile(path.join(folder,'economy.json'),bytes);
    const data=await(await request.get(`/api/scenarios/${id}?population=1`)).json();expect(data.economy).toEqual(asset);
    expect((await request.put(`/api/scenarios/${id}`,{data:{...data,economy:{bad:true}}})).status()).toBe(200);expect(await fs.readFile(path.join(folder,'economy.json'),'utf8')).toBe(bytes);
    const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));await page.goto(`/?scenario=${id}`);await page.waitForFunction(()=>window.mandateSimulation&&mandateMap.frames>0);
    const results=await page.evaluate(async()=>{const revision=mandateMap.model.revision,generation=mandateMap.politicalGeneration;await mandateSimulation.step(365);return {economy:mandateSimulation.economySummary(),revisionChanged:revision!==mandateMap.model.revision,generationChanged:generation!==mandateMap.politicalGeneration};});expect(results.economy.stats.monthsProcessed).toBe(12);expect(results.revisionChanged).toBe(false);expect(results.generationChanged).toBe(false);expect(errors).toEqual([]);expect(requests.some(u=>/\/adm2\/|\/api\/political/.test(u))).toBe(false);
    const state=await page.evaluate(()=>mandateSimulation.snapshot()),h=JSON.parse(await fs.readFile('client/data/map-v2/hierarchy.json'));const save=makeSave(state);expect((await request.put(`/api/saves/${id}`,{data:save})).status()).toBe(200);const restored=await(await request.get(`/api/saves/${id}`)).json();validateSave(restored,h);const a=new Simulation(data,h),b=new Simulation(data,h);a.load(state);b.load(restored.state);a.step(31);b.step(31);expect(a.serialize()).toBe(b.serialize());
    await fs.writeFile(path.join(folder,'economy.json'),'null');expect((await request.get(`/api/scenarios/${id}?population=1`)).status()).toBe(400);expect(await hashes()).toEqual(before);
  }finally{for(const [target,parent]of [[folder,root],[saveFolder,saveRoot]]){if(path.dirname(target)!==parent)throw Error('Unsafe fixture cleanup');await fs.rm(target,{recursive:true,force:true});}}
});
