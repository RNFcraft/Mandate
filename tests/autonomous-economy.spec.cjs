const {test,expect}=require('@playwright/test');
const {Simulation,ordinal,validateGameState}=require('../shared/simulation.cjs');
const {makeSave,validateSave}=require('../shared/save.cjs');
const {validateEconomyState}=require('../shared/economy.cjs');
const {generateSettlements}=require('../shared/settlements.cjs');
const {options,atomicWrite,outputPath}=require('../scripts/autonomous-runner.cjs');
const fixture=require('./fixtures/world-economy.cjs'),chains=require('./fixtures/production-chains.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
function engine(rules={}){const s=new Simulation(fixture.createScenario(),fixture.hierarchy,{seed:1700,proceduralWorld:{adjacency:fixture.adjacency}});s.enableAutonomy(rules);return s;}
function month(s){const d=s.clock.date;s.step(ordinal({year:d.year+(d.month===12?1:0),month:d.month===12?1:d.month+1,day:1})-ordinal(d));return s.snapshot();}
const stock=(f,id)=>f.inventories.find(s=>s.goodId===id);
function controlled(rules={}){
  const input=chains.createScenario();input.economy.rules.consumerNeeds=[{id:'food',goodId:'food',priority:'essential',perPersonNumerator:1,perPersonDenominator:100,usage:'consumable'},{id:'clothing',goodId:'clothing',priority:'ordinary',perPersonNumerator:1,perPersonDenominator:100,usage:'durable'}];
  input.settlements=generateSettlements(input.population,chains.hierarchy,input.countries,1700);for(const f of input.economy.enterprises)input.settlements.placements.push({enterpriseId:f.id,settlementId:input.settlements.rows.find(s=>s.provinceId===f.provinceId).id,kind:'settlement'});
  const s=new Simulation(input,chains.hierarchy);s.enableAutonomy({birthRateBps:0,deathRateBps:0,foodFeedback:false,...rules});return s;
}
test('explicit enable preserves every asset, count, ID and date; legacy loading stays legacy',()=>{
  const s=new Simulation(fixture.createScenario(),fixture.hierarchy,{proceduralWorld:{adjacency:fixture.adjacency}});month(s);const before=s.snapshot();s.enableAutonomy();const after=s.snapshot();expect(after.clock).toEqual(before.clock);expect(after.systems.settlements).toEqual(before.systems.settlements);
  expect(after.systems.economy.enterprises).toEqual(before.systems.economy.enterprises);expect(after.systems.economy.households).toEqual(before.systems.economy.households);expect(after.systems.population.cohorts.map(c=>c.count)).toEqual(before.systems.population.cohorts.map(c=>c.count));
  s.load(before);expect(s.snapshot().systems.economy.autonomy).toBeUndefined();expect(()=>s.enableAutonomy({windowMonths:0})).toThrow();expect(s.snapshot()).toEqual(before);
});
test('six synthetic years conserve cash, stocks, capital, labor, cohort and settlement totals',()=>{
  const s=engine(),cash=s.economicReport().cash;let purchases=0;
  for(let i=0;i<72;i++){const state=month(s),e=state.systems.economy;validateGameState(state,fixture.hierarchy);expect(e.stats.cashAfter).toBe(cash);
    for(const b of e.stats.goods){const a=e.autonomy.goods.find(v=>v.goodId===b.goodId);expect(b.opening+b.produced-b.inputsConsumed-b.householdConsumed-b.inUseAdded-a.capitalAdded).toBe(b.closing);expect(b.inUseOpening+b.inUseAdded-a.inUseRetired).toBe(b.inUseClosing);expect(a.capitalOpening+a.capitalAdded-a.capitalRetired).toBe(a.capitalClosing);}
    for(const f of e.enterprises){const controller=e.autonomy.firms.find(c=>c.enterpriseId===f.id);expect(f.stats.batches).toBeLessThanOrEqual(controller.plannedBatches);expect(f.stats.productionCost).toBe(f.stats.wages+f.stats.inputsConsumedValue);}
    if(i>48)purchases+=s.economicReport().goods.clothing.householdPurchased;
  }expect(purchases).toBeGreaterThan(0);expect(s.economicReport().population).toBeGreaterThan(0);
});
test('production and input targets fall with unsold inventories and recover with demand',()=>{
  const s=controlled(),state=s.snapshot(),e=state.systems.economy;for(const f of e.enterprises){const r=e.recipes.find(r=>r.id===f.recipeId);stock(f,r.output.goodId).quantity=10000;stock(f,r.output.goodId).bookValueMinor=0;}
  s.load(state);let next=month(s);expect(next.systems.economy.enterprises.every(f=>f.stats.batches===0)).toBe(true);expect(next.systems.economy.enterprises.every(f=>f.stats.inputPurchases===0)).toBe(true);
  const empty=next;for(const f of empty.systems.economy.enterprises){const r=e.recipes.find(r=>r.id===f.recipeId);const v=stock(f,r.output.goodId);v.quantity=0;v.bookValueMinor=0;}
  // Set a valid month-zero opening ledger for this independent demand experiment.
  const fresh=controlled();const opening=fresh.snapshot();for(const f of opening.systems.economy.enterprises){const r=e.recipes.find(r=>r.id===f.recipeId);stock(f,r.output.goodId).quantity=0;}fresh.load(opening);next=month(fresh);expect(next.systems.economy.autonomy.firms.some(f=>f.plannedBatches>0)).toBe(true);
});
test('expansion requires owned tools, money, labor and actual household payment',()=>{
  for(const blocked of ['tools','money','labor',null]){
    const s=controlled(),state=s.snapshot(),e=state.systems.economy,f=e.enterprises.find(f=>f.recipeId==='prepare-food'),c=e.autonomy.firms.find(c=>c.enterpriseId===f.id);c.pendingCapacity=3;
    stock(f,'tools').quantity=blocked==='tools'?0:3;stock(f,'tools').bookValueMinor=blocked==='tools'?0:150;
    if(blocked==='money')f.cashMinor=0;if(blocked==='labor')for(const cohort of state.systems.population.cohorts)cohort.count=0;
    if(blocked==='labor'){for(const row of state.systems.settlements.rows)row.population=0;}
    s.load(state);const before=f.capacityBatches,next=month(s),after=next.systems.economy.enterprises.find(v=>v.id===f.id),controller=next.systems.economy.autonomy.firms.find(v=>v.enterpriseId===f.id);
    if(blocked)expect(after.capacityBatches).toBe(before);else{expect(after.capacityBatches).toBe(before+3);expect(controller.capitalInUse.quantity).toBe(3);expect(controller.investment).toBeGreaterThan(150);expect(next.systems.economy.autonomy.goods.find(v=>v.goodId==='tools').capitalAdded).toBe(3);}
  }
});
test('installed equipment retires explicitly, contracts capacity and replacement is purchased',()=>{
  const s=controlled({capitalLifetimeMonths:1}),state=s.snapshot(),e=state.systems.economy,f=e.enterprises.find(f=>f.recipeId==='prepare-food'),c=e.autonomy.firms.find(v=>v.enterpriseId===f.id);f.capacityBatches+=3;c.capitalInUse={quantity:3,bookValueMinor:150,remainder:0};e.autonomy.goods.find(g=>g.goodId==='tools').capitalClosing=3;e.autonomy.goods.find(g=>g.goodId==='tools').capitalOpening=3;
  s.load(state);const next=month(s),balance=next.systems.economy.autonomy.goods.find(g=>g.goodId==='tools');expect(balance.capitalRetired).toBe(3);expect(next.systems.economy.autonomy.events.contracted).toBeGreaterThan(0);
});
test('durable wear happens once per good even for duplicate needs; book value falls proportionally',()=>{
  const s=controlled({durableLifetimeMonths:2}),state=s.snapshot(),e=state.systems.economy,h=e.households[0];e.rules.consumerNeeds.push({...e.rules.consumerNeeds[1],id:'duplicate'});h.consumerState.push({...structuredClone(h.consumerState.find(n=>n.needId==='clothing')),needId:'duplicate'});h.inUse[0].quantity=8;h.inUse[0].bookValueMinor=80;h.cashMinor=0;s.load(state);
  const next=month(s),b=next.systems.economy.autonomy.goods.find(g=>g.goodId==='clothing');expect(b.inUseRetired).toBe(4);
});
test('sustained absence of demand closes after grace period while preserving assets',()=>{
  const s=controlled({closeMonths:6}),state=s.snapshot(),e=state.systems.economy;for(const c of state.systems.population.cohorts)c.count=0;for(const row of state.systems.settlements.rows)row.population=0;s.load(state);
  for(let i=0;i<5;i++)month(s);expect(s.economicReport().dormant).toBe(0);month(s);expect(s.economicReport().dormant).toBeGreaterThan(0);expect(s.economicReport().cash).toBe(1300000);expect(s.snapshot().systems.settlements.placements.length).toBe(e.enterprises.length);
});
test('save continuation and permuted registries are deterministic across four years',()=>{
  const a=engine(),b=engine();for(let i=0;i<12;i++)month(a);const saved=makeSave(a.snapshot());validateSave(saved,fixture.hierarchy);saved.state.systems.economy.enterprises.reverse();saved.state.systems.economy.autonomy.firms.reverse();saved.state.systems.settlements.rows.reverse();b.load(saved.state);
  for(let i=0;i<36;i++){month(a);month(b);}expect(b.serialize()).toBe(a.serialize());
});
test('overflow fails without monthly clock, RNG, assets or events committing',()=>{
  const s=controlled(),state=s.snapshot(),f=state.systems.economy.enterprises[0],c=state.systems.economy.autonomy.firms[0];c.pendingCapacity=Number.MAX_SAFE_INTEGER;state.systems.economy.autonomy.rules.organizationCostPerBatch=Number.MAX_SAFE_INTEGER;s.load(state);s.step(30);const before=s.serialize();let count=0;s.subscribe(event=>{if(event.type==='economyUpdated')count++;});expect(()=>s.step()).toThrow(/overflow/);expect(s.serialize()).toBe(before);expect(count).toBe(0);
});
test('CLI accepts continuous 600 months and rejects unsafe or incomplete options',async()=>{
  expect(options(['--autonomous','--months','600','--checkpoint-every','120','--checkpoint-dir','checkpoints']).months).toBe(600);for(const args of [['--summary-every','0'],['--enable-autonomy'],['--checkpoint-every','12'],['--months','-1']])expect(()=>options(args)).toThrow();expect(()=>outputPath('scenarios/1700/x.json')).toThrow();
  expect(options(['--autonomous','--food-feedback','off']).foodFeedback).toBe('off');expect(options(['--load','campaign.json','--food-feedback','on']).foodFeedback).toBe('on');expect(()=>options(['--food-feedback','maybe'])).toThrow();
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mandate-autonomy-')),file=path.join(dir,'save.json');try{await atomicWrite(file,'first');await expect(atomicWrite(file,'second')).rejects.toThrow();expect(await fs.readFile(file,'utf8')).toBe('first');expect(await fs.readdir(dir)).toEqual(['save.json']);}finally{const target=path.resolve(dir),root=path.resolve(os.tmpdir());if(!target.startsWith(root+path.sep)||!path.basename(target).startsWith('mandate-autonomy-'))throw Error('Unsafe temporary directory');await fs.rm(target,{recursive:true});}
});
test('persistent shortage creates a financed pending workshop with no free inventories',()=>{
  const s=controlled({entryMonths:6,cooldownMonths:6}),opening=s.snapshot(),e=opening.systems.economy;
  e.rules.consumerNeeds[0].perPersonDenominator=10;
  for(const row of opening.systems.settlements.rows)row.specializations.push('food-processing');
  const seller=e.enterprises.find(f=>f.recipeId==='forge-tools');stock(seller,'tools').quantity=100;stock(seller,'tools').bookValueMinor=1000;s.load(opening);
  let state;for(let i=0;i<6;i++)state=month(s);const added=state.systems.economy.enterprises.filter(f=>f.id.startsWith('auto-'));expect(added.length).toBeGreaterThan(0);
  for(const f of added){expect(f.capacityBatches).toBe(0);expect(f.cashMinor).toBeGreaterThan(0);expect(f.inventories.every(v=>v.quantity===0)).toBe(true);expect(state.systems.settlements.placements.some(p=>p.enterpriseId===f.id)).toBe(true);}
  expect(state.systems.economy.stats.cashAfter).toBe(1300000);month(s);expect(s.economicReport().capitalQuantity).toBeGreaterThan(0);
});
test('urbanization uses paid provincial processor jobs and creates a real demographic center',()=>{
  const s=controlled({urbanizationBps:1000,urbanJobsPerMigrant:10}),state=s.snapshot(),e=state.systems.economy;
  const f=e.enterprises.find(f=>f.recipeId==='prepare-food');stock(f,'flour').quantity=100;stock(f,'flour').bookValueMinor=100;
  s.load(state);const before=s.populationSummary(),next=month(s),after=s.populationSummary();expect(after.total).toBe(before.total);expect(after.urban).toBeGreaterThan(before.urban);expect(next.systems.settlements.rows.some(r=>r.classification==='urban')).toBe(true);
  const old=state.systems.population.cohorts[0],urban=next.systems.population.cohorts.find(c=>c.settlement==='urban');for(const k of ['cultureId','religionId','stratumId','literacyBps'])expect(urban[k]).toBe(old[k]);
});
test('monthly seller rotation avoids permanent first-ID monopoly and preserves legacy ordering',()=>{
  const s=controlled(),state=s.snapshot(),e=state.systems.economy,first=e.enterprises.find(f=>f.recipeId==='prepare-food'),second=structuredClone(first);second.id='zz-food';e.enterprises.push(second);e.autonomy.firms.push({...structuredClone(e.autonomy.firms.find(c=>c.enterpriseId===first.id)),enterpriseId:second.id});state.systems.settlements.placements.push({...state.systems.settlements.placements.find(p=>p.enterpriseId===first.id),enterpriseId:second.id});
  for(const f of [first,second]){stock(f,'food').quantity=100;stock(f,'food').bookValueMinor=0;}s.load(state);const sold=new Map();for(let i=0;i<6;i++){const next=month(s);for(const f of next.systems.economy.enterprises.filter(f=>f.recipeId==='prepare-food'))sold.set(f.id,(sold.get(f.id)||0)+f.stats.revenue);}expect(sold.get(first.id)).toBeGreaterThan(0);expect(sold.get(second.id)).toBeGreaterThan(0);
});
test('malformed autonomy remainders and ledgers reject load atomically',()=>{
  const s=engine();month(s);for(const mutate of [a=>a.firms[0].capitalInUse.quantity++,a=>a.wear[0].remainders[0].remainder=a.rules.durableLifetimeMonths,a=>a.shortages.push(a.shortages[0]),a=>a.rules.windowMonths=0]){const state=s.snapshot(),before=s.serialize();mutate(state.systems.economy.autonomy);expect(()=>s.load(state)).toThrow();expect(s.serialize()).toBe(before);}
  const invalid=s.snapshot(),before=s.serialize();delete invalid.systems.settlements;expect(()=>s.load(invalid)).toThrow(/settlements are required/);expect(s.serialize()).toBe(before);
  const nullMode=s.snapshot();nullMode.systems.economy.autonomy=null;expect(()=>s.load(nullMode)).toThrow(/invalid fields/);expect(s.serialize()).toBe(before);
});
test('full published world runs autonomous twelve months and resumes without regeneration',async()=>{
  test.setTimeout(180000);const {loadWorldData}=require('../scripts/world-economy-data.cjs'),{scenario,hierarchy,adjacency}=await loadWorldData(),counts=scenario.population.cohorts.map(c=>c.count);
  const s=new Simulation(scenario,hierarchy,{seed:1700,proceduralWorld:{adjacency}});s.enableAutonomy();const cash=s.economicReport().cash;
  for(let i=0;i<12;i++)month(s);const report=s.economicReport();expect(report.population).toBeGreaterThan(0);expect(report.cash).toBe(cash);expect(report.capitalQuantity).toBeGreaterThanOrEqual(0);expect(report.enterprises).toBeGreaterThanOrEqual(10363);expect(report.active).toBeLessThanOrEqual(report.enterprises);expect(report.goods.clothing.inUseRetired).toBeGreaterThan(0);
  const state=s.snapshot();validateGameState(state,hierarchy);const restored=new Simulation(scenario,hierarchy);restored.load(state);month(s);month(restored);const digest=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');expect(digest(restored.serialize())).toBe(digest(s.serialize()));expect(scenario.population.cohorts.map(c=>c.count)).toEqual(counts);
});
test('merging demographic carry into a zero-count urban cohort settles deaths after the transfer',()=>{
  const s=controlled({urbanizationBps:1000,urbanJobsPerMigrant:10}),state=s.snapshot(),rural=state.systems.population.cohorts[0];rural.deathRemainder=119999;state.systems.population.cohorts.push({...structuredClone(rural),id:'zero-urban',settlement:'urban',count:0});const f=state.systems.economy.enterprises.find(f=>f.recipeId==='prepare-food');stock(f,'flour').quantity=100;stock(f,'flour').bookValueMinor=100;
  s.load(state);let event;s.subscribe(e=>{if(e.type==='populationUpdated')event=e;});const next=month(s);expect(next.systems.population.stats.deaths).toBe(1);expect(s.populationSummary().total).toBe(999);expect(event.deaths).toBe(1);expect(event.netChange).toBe(-1);expect(next.systems.population.cohorts.every(c=>c.count>=0&&c.deathRemainder<120000)).toBe(true);
});
