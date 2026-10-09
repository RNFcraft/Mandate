const {test,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),crypto=require('node:crypto');
const {Simulation,ordinal,validateGameState}=require('../shared/simulation.cjs');
const {generateWorld}=require('../shared/world-economy.cjs');
const {validateSettlements}=require('../shared/settlements.cjs');
const {makeSave,validateSave}=require('../shared/save.cjs');
const {loadWorldData}=require('../scripts/world-economy-data.cjs');
const fixture=require('./fixtures/world-economy.cjs');
function engine(input=fixture.createScenario(),seed=1700){return new Simulation(input,fixture.hierarchy,{seed,proceduralWorld:{adjacency:fixture.adjacency}});}
function month(s){const d=s.clock.date;s.step(ordinal({year:d.year+(d.month===12?1:0),month:d.month===12?1:d.month+1,day:1})-ordinal(d));return s.snapshot();}
function checkBalances(state,hierarchy=fixture.hierarchy){
  const e=state.systems.economy,s=state.systems.settlements;
  assert.equal(e.stats.cashBefore,e.stats.cashAfter);assert.equal([...e.households,...e.enterprises].reduce((n,a)=>n+BigInt(a.cashMinor),0n),BigInt(e.stats.cashAfter));
  const available=new Map(),usage=new Map(),stocks=new Map(e.goods.map(g=>[g.id,0n]));
  for(const c of state.systems.population.cohorts)available.set(c.territoryId,(available.get(c.territoryId)||0)+c.count);
  for(const f of e.enterprises){assert(Number.isSafeInteger(f.cashMinor)&&f.cashMinor>=0);assert(f.stats.batches<=f.capacityBatches);usage.set(f.provinceId,(usage.get(f.provinceId)||0)+f.stats.workers);for(const inventory of f.inventories){assert(Number.isSafeInteger(inventory.quantity)&&inventory.quantity>=0);assert(Number.isSafeInteger(inventory.bookValueMinor)&&inventory.bookValueMinor>=0);stocks.set(inventory.goodId,stocks.get(inventory.goodId)+BigInt(inventory.quantity));}}
  for(const [id,n]of usage)assert(n<=Math.floor(available.get(id)*e.rules.laborParticipationBps/10000));
  for(const b of e.stats.goods){assert.equal(BigInt(b.opening)+BigInt(b.inUseOpening)+BigInt(b.produced)-BigInt(b.inputsConsumed)-BigInt(b.householdConsumed),BigInt(b.closing)+BigInt(b.inUseClosing));assert.equal(stocks.get(b.goodId),BigInt(b.closing));}
  assert.equal(e.enterprises.reduce((n,f)=>n+BigInt(f.stats.revenue),0n),e.enterprises.reduce((n,f)=>n+BigInt(f.stats.inputPurchases),0n)+e.households.reduce((n,h)=>n+BigInt(h.stats.spending),0n));
  validateSettlements(s,state.systems.population,hierarchy,e);
}
test('markets are connected, disjoint, respect borders and leave empty provinces and islands explicit',()=>{
  const input=fixture.createScenario(),before=JSON.stringify(input),generated=generateWorld(input,fixture.hierarchy,fixture.adjacency,1700),coverage=new Set();
  for(const m of generated.economy.markets){const reached=new Set([m.provinceIds[0]]),queue=[m.provinceIds[0]];for(let i=0;i<queue.length;i++)for(const n of fixture.adjacency.neighbors[queue[i]])if(m.provinceIds.includes(n)&&!reached.has(n)){reached.add(n);queue.push(n);}expect(reached.size).toBe(m.provinceIds.length);for(const id of m.provinceIds){expect(coverage.has(id)).toBe(false);coverage.add(id);expect(input.ownership[id]).toBe(input.ownership[m.provinceIds[0]]);}expect(m.id).not.toBe(m.provinceIds[0]);}
  expect(coverage.has('province:00003')).toBe(false);expect(generated.economy.markets.find(m=>m.provinceIds.includes('province:00005')).provinceIds).toEqual(['province:00005']);
  expect(generated.economy.markets.some(m=>m.provinceIds.length>1)).toBe(true);expect(JSON.stringify(input)).toBe(before);
});
test('browser opt-in creates the world once, displays bounded city markers and uses normal save/load API',async({page,request})=>{
  test.setTimeout(180000);const errors=[],urls=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>urls.push(r.url()));
  await page.goto('/?scenario=1700&worldEconomy=1&worldSeed=1700');await page.waitForFunction(()=>window.mandateSettlementLayer?.points.length>0&&mandateMap.frames>0);
  const initial=await page.evaluate(()=>({population:mandateSimulation.populationSummary(),cities:mandateSettlementLayer.points.length,markers:mandateSettlementLayer.visible.length,settlements:mandateSimulation.settlementSummary().length}));
  expect(initial.population.total).toBe(591714189);expect(initial.settlements).toBe(17258);expect(initial.cities).toBeGreaterThan(60);expect(initial.markers).toBeLessThanOrEqual(80);
  const point=await page.evaluate(()=>{const p=mandateSettlementLayer.visible[0];return {x:p.x,y:p.y};});await page.mouse.click(point.x,point.y);await expect(page.locator('#settlement-info')).toBeVisible();await expect(page.locator('#settlement-info')).toContainText('координаты города не подтверждены');
  const saveId='world-economy-test-save',saveFolder=require('node:path').resolve('saves',saveId),saveRoot=require('node:path').resolve('saves');
  try{
    const timing=await page.evaluate(async()=>{
      const revision=mandateMap.model.revision,start=performance.now();await mandateSimulation.step(31);const monthMs=performance.now()-start;
      return {monthMs,revision,after:mandateMap.model.revision,state:await mandateSimulation.snapshot()};
    });
    expect(timing.revision).toBe(timing.after);const save=makeSave(timing.state);expect((await request.put('/api/saves/'+saveId,{data:save})).status()).toBe(200);
    const loaded=await(await request.get('/api/saves/'+saveId)).json();
    const same=await page.evaluate(async state=>{await mandateSimulation.load(state);const a=await mandateSimulation.serialize();await mandateSimulation.load(state);return a===await mandateSimulation.serialize();},loaded.state);expect(same).toBe(true);
    console.log('Browser world month ms:',timing.monthMs);
  }finally{if(require('node:path').dirname(saveFolder)!==saveRoot)throw Error('Unsafe save cleanup');await fs.rm(saveFolder,{recursive:true,force:true});}
  expect(errors).toEqual([]);expect(urls.some(u=>/\/adm2\/|\/api\/political/.test(u))).toBe(false);
});
test('enterprise generation respects settlement links, data-defined recipes, scale and initial labor',()=>{
  const generated=generateWorld(fixture.createScenario(),fixture.hierarchy,fixture.adjacency,1700),rows=new Map(generated.settlements.rows.map(r=>[r.id,r])),firms=new Map(generated.economy.enterprises.map(f=>[f.id,f])),usage=new Map();
  expect(generated.settlements.placements).toHaveLength(firms.size);expect(generated.settlements.placements.some(p=>p.kind==='external')).toBe(true);
  for(const p of generated.settlements.placements){const f=firms.get(p.enterpriseId),r=rows.get(p.settlementId),recipe=generated.economy.recipes.find(r=>r.id===f.recipeId);expect(f.provinceId).toBe(r.provinceId);expect(recipe).toBeDefined();expect(f.inventories).toHaveLength(12);expect(f.cashMinor).toBeGreaterThan(0);usage.set(r.id,(usage.get(r.id)||0)+f.capacityBatches*recipe.workersPerBatch);}
  for(const [id,n] of usage)expect(n).toBeLessThanOrEqual(Math.floor(rows.get(id).population/2));
  expect(generated.economy.enterprises.filter(e=>e.provinceId==='province:00005')).toHaveLength(0);
  expect(new Set(generated.settlements.rows.map(r=>r.specializations.join(','))).size).toBeGreaterThan(1);
});
test('generated world is deterministic under seed, cohort/territory/adjacency order permutations',()=>{
  const input=fixture.createScenario(),h=structuredClone(fixture.hierarchy),adj=structuredClone(fixture.adjacency),expected=generateWorld(input,h,adj,1700);
  input.population.cohorts.reverse();input.countries.reverse();h.territories.reverse();for(const n of Object.values(adj.neighbors))n.reverse();adj.neighbors=Object.fromEntries(Object.entries(adj.neighbors).reverse());
  expect(generateWorld(input,h,adj,1700)).toEqual(expected);expect(generateWorld(input,h,adj,1701)).not.toEqual(expected);
});
test('chains trade physical goods for twelve months without delivering to another market',()=>{
  const s=engine();let revenue=0;
  for(let i=0;i<12;i++){const state=month(s);checkBalances(state);expect(state.systems.economy.stats.goods.find(g=>g.goodId==='food').produced).toBeGreaterThan(0);expect(state.systems.economy.stats.goods.find(g=>g.goodId==='clothing').produced).toBeGreaterThan(0);revenue+=state.systems.economy.enterprises.reduce((n,e)=>n+e.stats.inputPurchases,0);
    const island=state.systems.economy.markets.find(m=>m.provinceIds.includes('province:00005'));expect(island.goods.every(g=>g.stats.supply===0&&g.stats.purchased===0)).toBe(true);
  }
  expect(revenue).toBeGreaterThan(0);const summary=s.settlementSummary('province:00001');expect(summary.some(r=>r.activeEnterprises>0&&r.revenue>0)).toBe(true);
  summary[0].population=0;expect(s.settlementSummary('province:00001')[0].population).toBeGreaterThan(0);
});
test('generated states save/load without regeneration; old saves remove generated systems',()=>{
  const a=engine();a.step(151);const save=JSON.parse(JSON.stringify(makeSave(a.snapshot())));validateSave(save,fixture.hierarchy);
  const b=new Simulation(fixture.createScenario(),fixture.hierarchy);b.load(save.state);a.step(214);b.step(214);expect(a.serialize()).toBe(b.serialize());
  const reordered=a.snapshot();reordered.systems.settlements.rows.reverse();reordered.systems.settlements.placements.reverse();for(const r of reordered.systems.settlements.rows)r.specializations.reverse();b.load(reordered);expect(b.serialize()).toBe(a.serialize());
  const old=new Simulation(fixture.createScenario(),fixture.hierarchy);a.load(old.snapshot());expect(a.settlementSummary()).toBeNull();expect(a.economySummary()).toBeNull();a.step(31);expect(a.settlementSummary()).toBeNull();
});
test('invalid adjacency, overflowing inputs and malformed placement reject without mutating sources or installed state',()=>{
  const input=fixture.createScenario(),bytes=JSON.stringify(input);
  for(const mutate of [a=>a.landOnly=false,a=>a.neighbors['province:00001'].push('province:99999'),a=>a.neighbors['province:00001']=[],a=>delete a.neighbors['province:00006']]){const adj=structuredClone(fixture.adjacency);mutate(adj);expect(()=>generateWorld(input,fixture.hierarchy,adj,1700)).toThrow('World economy:');}
  expect(JSON.stringify(input)).toBe(bytes);
  const huge=fixture.createScenario();huge.population.cohorts[0].count=Number.MAX_SAFE_INTEGER;expect(()=>generateWorld(huge,fixture.hierarchy,fixture.adjacency,1700)).toThrow('overflow');
  const s=engine(),before=s.serialize();for(const mutate of [state=>state.systems.settlements.placements[0].settlementId='missing',state=>state.systems.settlements.placements.pop(),state=>state.systems.settlements.rows.find(r=>r.capitalOf.length).capitalOf=['missing']]){const bad=s.snapshot();mutate(bad);expect(()=>s.load(bad)).toThrow('Settlements:');expect(s.serialize()).toBe(before);}
  expect(()=>engine({...input,economy:{}})).toThrow('already has');
});
test('failed world month preserves settlements, clock, RNG, population, accounts and events',()=>{
  const s=engine();s.step(30);const state=s.snapshot();const f=state.systems.economy.enterprises.find(f=>f.recipeId==='grow-grain');f.inventories.find(s=>s.goodId==='grain').quantity=Number.MAX_SAFE_INTEGER;
  s.load(state);const before=s.serialize(),events=[];s.subscribe(e=>events.push(e));expect(()=>s.step()).toThrow('overflow');expect(s.serialize()).toBe(before);expect(events).toEqual([]);
});
test('existing capital/ownership commands update settlement labels without regenerating market geography',()=>{
  const s=engine(),markets=s.economySummary().markets;
  expect(s.submit({type:'SetCapital',countryId:'A',territoryId:'province:00002'}).ok).toBe(true);
  expect(s.settlementSummary().find(r=>r.capitalOf.includes('A')).provinceId).toBe('province:00002');validateGameState(s.snapshot(),fixture.hierarchy);
  expect(s.submit({type:'SetOwnership',ids:['province:00002'],owner:'B'}).ok).toBe(true);
  expect(s.settlementSummary().some(r=>r.capitalOf.includes('A'))).toBe(false);validateGameState(s.snapshot(),fixture.hierarchy);expect(s.economySummary().markets).toEqual(markets);
});
test('full 5001-province published world preserves baseline, runs twelve months, and resumes a real world save',async()=>{
  test.setTimeout(180000);
  const files=['client/data/map-v2/manifest.json','client/data/map-v2/hierarchy.json','client/data/map-v2/adjacency.json','client/data/map-v2/provinces.topo.json','scenarios/1700/population.json','scenarios/1700/ownership.json','scenarios/1700/countries.json','scenarios/1700/scenario.json'];
  const hashes=()=>Promise.all(files.map(async f=>crypto.createHash('sha256').update(await fs.readFile(f)).digest('hex'))),before=await hashes();
  const {scenario,hierarchy,adjacency}=await loadWorldData();expect(hierarchy.territories).toHaveLength(5001);
  const s=new Simulation(scenario,hierarchy,{seed:1700,proceduralWorld:{adjacency}}),initial=s.snapshot();
  const sum=key=>initial.systems.settlements.rows.filter(r=>!key||r.classification===key).reduce((n,r)=>n+r.population,0);
  expect(sum()).toBe(591714189);expect(sum('urban')).toBe(46409598);expect(sum('rural')).toBe(545304591);validateGameState(initial,hierarchy);
  const history=[];for(let m=0;m<12;m++){const state=month(s);checkBalances(state,hierarchy);const e=state.systems.economy,food=e.stats.goods.find(g=>g.goodId==='food');history.push({month:m+1,food:food.produced,purchased:food.householdConsumed,active:e.enterprises.filter(f=>f.stats.batches).length});expect(food.produced).toBeGreaterThan(5000000);expect(e.stats.goods.find(g=>g.goodId==='tools').produced).toBeGreaterThan(0);expect(e.enterprises.filter(f=>f.stats.batches).length/e.enterprises.length).toBeGreaterThan(.95);}
  const save=JSON.parse(JSON.stringify(makeSave(s.snapshot())));validateSave(save,hierarchy);const restored=new Simulation(scenario,hierarchy);restored.load(save.state);month(s);month(restored);expect(s.serialize()).toBe(restored.serialize());
  expect(await hashes()).toEqual(before);console.log('Full world regression:',JSON.stringify({settlements:initial.systems.settlements.rows.length,markets:initial.systems.economy.markets.length,enterprises:initial.systems.economy.enterprises.length,history}));
});
