const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {Simulation,validateGameState}=require('../shared/simulation.cjs');
const {initializePopulation,validatePopulationScenario,validatePopulationState,advancePopulationMonth,summarizePopulation}=require('../shared/population.cjs');
const {makeSave,validateSave}=require('../shared/save.cjs');
const {hierarchy,population,scenario}=require('./fixtures/population.cjs');
const clone=structuredClone;
test('absent population initializes empty; old saves stay authoritative and unchanged',()=>{
  const input=clone(scenario);delete input.population;const engine=new Simulation(input,hierarchy);
  expect(engine.snapshot().systems.population).toEqual({version:1,cultures:[],religions:[],strata:[],cohorts:[],stats:{monthsProcessed:0,births:0,deaths:0}});
  expect(engine.populationSummary().total).toBe(0);engine.step(365);expect(engine.snapshot().systems.population.stats.monthsProcessed).toBe(12);
  const old=engine.snapshot();delete old.systems.population;const bytes=JSON.stringify(old);validateSave(makeSave(old),hierarchy);engine.load(old);engine.step(365);
  expect(engine.snapshot().systems.population).toBeUndefined();expect(engine.populationSummary()).toEqual({total:0,urban:0,rural:0,literacyBps:0,byCulture:{},byReligion:{},byStratum:{}});expect(JSON.stringify(old)).toBe(bytes);
});
test('fixture initializes exactly without mutating or retaining authored input; missing rates default to zero',()=>{
  const input=clone(scenario),before=JSON.stringify(input),engine=new Simulation(input,hierarchy);
  expect(engine.snapshot().systems.population.cohorts).toEqual(population.cohorts.map(c=>({...c,birthRemainder:0,deathRemainder:0})));
  engine.step(31);expect(JSON.stringify(input)).toBe(before);input.population.cohorts[0].count=0;expect(engine.populationSummary().total).toBeGreaterThan(0);
  const zero=clone(population);for(const c of zero.cohorts){delete c.birthRateBps;delete c.deathRateBps;}const p=initializePopulation(zero,hierarchy);advancePopulationMonth(p);expect(p.cohorts.map(c=>c.count)).toEqual(zero.cohorts.map(c=>c.count));expect(p.cohorts.every(c=>c.birthRateBps===0&&c.deathRateBps===0)).toBe(true);
});
const invalidScenarios={
  version:p=>p.version=2,
  cultureDuplicate:p=>p.cultures.push(clone(p.cultures[0])),religionDuplicate:p=>p.religions.push(clone(p.religions[0])),stratumDuplicate:p=>p.strata.push(clone(p.strata[0])),
  unsafeRegistry:p=>p.cultures[0].id='constructor',emptyName:p=>p.cultures[0].name=' ',longName:p=>p.strata[0].name='x'.repeat(161),
  territory:p=>p.cohorts[0].territoryId='missing',culture:p=>p.cohorts[0].cultureId='missing',religion:p=>p.cohorts[0].religionId='missing',stratum:p=>p.cohorts[0].stratumId='missing',
  duplicateID:p=>p.cohorts[1].id=p.cohorts[0].id,duplicateTuple:p=>p.cohorts.push({...p.cohorts[0],id:'other'}),settlement:p=>p.cohorts[0].settlement='city',
  negative:p=>p.cohorts[0].count=-1,float:p=>p.cohorts[0].count=1.5,unsafeCount:p=>p.cohorts[0].count=Number.MAX_SAFE_INTEGER+1,
  literacy:p=>p.cohorts[0].literacyBps=10001,negativeLiteracy:p=>p.cohorts[0].literacyBps=-1,
  birth:p=>p.cohorts[0].birthRateBps=10001,death:p=>p.cohorts[0].deathRateBps=-1,floatRate:p=>p.cohorts[0].deathRateBps=0.5,
  prototype:p=>Object.setPrototypeOf(p.cohorts[0],{bad:true}),unsafeKey:p=>Object.defineProperty(p,'__proto__',{value:{},enumerable:true}),
  totalOverflow:p=>{p.cohorts[0].count=Number.MAX_SAFE_INTEGER;}
};
for(const [name,mutate]of Object.entries(invalidScenarios))test(`population scenario rejects ${name}`,()=>{const p=clone(population);mutate(p);expect(()=>validatePopulationScenario(p,hierarchy)).toThrow('Population:');expect(()=>new Simulation({...scenario,population:p},hierarchy)).toThrow('Population:');});
for(const [name,mutate]of Object.entries({remainder:p=>p.cohorts[0].birthRemainder=120000,negativeRemainder:p=>p.cohorts[0].deathRemainder=-1,floatRemainder:p=>p.cohorts[0].birthRemainder=0.5,stats:p=>p.stats.births=-1,floatStats:p=>p.stats.deaths=1.5,unsafeStats:p=>p.stats.monthsProcessed=Number.MAX_SAFE_INTEGER+1,missingRate:p=>delete p.cohorts[0].birthRateBps}))test(`runtime validation rejects ${name} without installing bad save`,()=>{
  const engine=new Simulation(scenario,hierarchy),before=engine.serialize(),state=engine.snapshot();mutate(state.systems.population);expect(()=>validatePopulationState(state.systems.population,hierarchy)).toThrow();expect(()=>validateGameState(state,hierarchy)).toThrow();expect(()=>engine.load(state)).toThrow();expect(engine.serialize()).toBe(before);
});
test('month boundary, exact accrual, stable literacy and lightweight event',()=>{
  const engine=new Simulation(scenario,hierarchy),events=[];engine.subscribe(e=>{if(e.type==='populationUpdated')events.push(e);});
  engine.step(29);expect(engine.clock.date).toEqual({year:1700,month:1,day:30});engine.step();expect(engine.clock.date.day).toBe(31);expect(engine.snapshot().systems.population.stats.monthsProcessed).toBe(0);expect(events).toEqual([]);
  engine.step();const p=engine.snapshot().systems.population;
  expect(p.cohorts[0]).toMatchObject({count:100059,birthRemainder:60351,deathRemainder:20281,literacyBps:800});
  expect(p.stats).toEqual({monthsProcessed:1,births:334,deaths:256});
  expect(events).toEqual([{type:'populationUpdated',date:{year:1700,month:2,day:1},births:334,deaths:256,netChange:78}]);expect(Object.values(events[0]).some(Array.isArray)).toBe(false);
});
test('multi-month remainders match independent integer reference; persons remain safe integers',()=>{
  const engine=new Simulation(scenario,hierarchy),expected=clone(population.cohorts).map(c=>({...c,birthRemainder:0,deathRemainder:0}));let births=0n,deaths=0n;
  for(let month=0;month<12;month++)for(const c of expected){const b=BigInt(c.count)*BigInt(c.birthRateBps)+BigInt(c.birthRemainder),d=BigInt(c.count)*BigInt(c.deathRateBps)+BigInt(c.deathRemainder);births+=b/120000n;deaths+=d/120000n;c.count=Number(BigInt(c.count)+b/120000n-d/120000n);c.birthRemainder=Number(b%120000n);c.deathRemainder=Number(d%120000n);}
  engine.step(365);const p=engine.snapshot().systems.population;expect(p.cohorts).toEqual(expected);expect(p.stats).toEqual({monthsProcessed:12,births:Number(births),deaths:Number(deaths)});expect(p.cohorts.every(c=>Number.isSafeInteger(c.count)&&c.count>=0)).toBe(true);
});
test('large safe counts retain exact fixed-point precision beyond Number multiplication; leap and year boundaries',()=>{
  const p=clone(population);p.cohorts=[p.cohorts[0]];p.cohorts[0].count=9000000000000001;p.cohorts[0].birthRateBps=1;p.cohorts[0].deathRateBps=2;
  const runtime=initializePopulation(p,hierarchy),old=BigInt(p.cohorts[0].count);advancePopulationMonth(runtime);
  expect(runtime.cohorts[0].count).toBe(Number(old+old/120000n-(old*2n)/120000n));expect(runtime.cohorts[0].birthRemainder).toBe(Number(old%120000n));expect(runtime.cohorts[0].deathRemainder).toBe(Number(old*2n%120000n));
  const input=clone(scenario);input.scenario.year=2000;const engine=new Simulation(input,hierarchy);engine.step(59);expect(engine.clock.date).toEqual({year:2000,month:2,day:29});expect(engine.snapshot().systems.population.stats.monthsProcessed).toBe(1);engine.step();expect(engine.snapshot().systems.population.stats.monthsProcessed).toBe(2);engine.step(306);expect(engine.clock.date).toEqual({year:2001,month:1,day:1});expect(engine.snapshot().systems.population.stats.monthsProcessed).toBe(12);
});
test('31/365 step grouping and save/load continuation are byte identical',()=>{
  const a=new Simulation(scenario,hierarchy),b=new Simulation(scenario,hierarchy);a.step(31);for(let i=0;i<31;i++)b.step();expect(a.serialize()).toBe(b.serialize());
  const save=makeSave(a.snapshot());validateSave(save,hierarchy);const loaded=new Simulation(scenario,hierarchy);loaded.load(JSON.parse(JSON.stringify(save)).state);expect(loaded.serialize()).toBe(a.serialize());
  a.step(334);loaded.step(334);for(let i=0;i<334;i++)b.step();expect(a.serialize()).toBe(b.serialize());expect(loaded.serialize()).toBe(a.serialize());expect(a.snapshot().systems.population.stats.monthsProcessed).toBe(12);
});
test('wall-clock grouping leaves deterministic population and RNG unchanged',async()=>{
  const {ClockDriver}=await import('data:text/javascript;base64,'+Buffer.from(await fs.readFile('client/game/clock.js','utf8')).toString('base64'));
  const a=new Simulation(scenario,hierarchy),b=new Simulation(scenario,hierarchy);let ta=0,tb=0;const da=new ClockDriver(a,{now:()=>ta}),db=new ClockDriver(b,{now:()=>tb});
  try{a.start();b.start();a.setSpeed(100);b.setSpeed(100);for(let i=0;i<100;i++){ta+=100;da.pump();}for(let i=0;i<10;i++){tb+=1000;db.pump();}expect(a.serialize()).toBe(b.serialize());}finally{da.dispose();db.dispose();}
});
test('derived summaries preserve correlated dimensions and integer weighted literacy; return values are detached',()=>{
  const engine=new Simulation(scenario,hierarchy),before=engine.serialize();expect(engine.populationSummary()).toEqual({total:112353,urban:12345,rural:100008,literacyBps:1262,byCulture:{'c-a':100008,'c-b':12345},byReligion:{'r-a':100001,'r-b':12352},byStratum:{'s-a':100001,'s-b':12345,'s-c':7}});
  expect(engine.populationSummary('residual:A:p')).toEqual({total:7,urban:0,rural:7,literacyBps:10000,byCulture:{'c-a':7},byReligion:{'r-b':7},byStratum:{'s-c':7}});
  const result=engine.populationSummary();result.byCulture['c-a']=0;result.total=0;expect(engine.serialize()).toBe(before);expect(engine.populationSummary('unknown').literacyBps).toBe(0);
  const p=initializePopulation(population,hierarchy);p.cohorts[0].count=0;p.cohorts[1].count=0;p.cohorts[2].count=0;expect(summarizePopulation(p).literacyBps).toBe(0);
});
test('safe tag IDs matching inherited object properties aggregate as numbers',()=>{
  const p=clone(population);p.cultures[0].id='toString';p.religions[1].id='hasOwnProperty';p.strata[0].id='valueOf';
  for(const c of p.cohorts){if(c.cultureId==='c-a')c.cultureId='toString';if(c.religionId==='r-b')c.religionId='hasOwnProperty';if(c.stratumId==='s-a')c.stratumId='valueOf';}
  const summary=summarizePopulation(initializePopulation(p,hierarchy));expect(summary.byCulture.toString).toBe(100008);expect(summary.byReligion.hasOwnProperty).toBe(12352);expect(summary.byStratum.valueOf).toBe(100001);
});
test('overflow is rejected before monthly state, calendar and RNG mutate; zero/high mortality stays nonnegative',()=>{
  const engine=new Simulation(scenario,hierarchy);engine.step(30);const state=engine.snapshot();state.systems.population.cohorts[0].count=Number.MAX_SAFE_INTEGER-12352;state.systems.population.cohorts[0].birthRateBps=10000;state.systems.population.cohorts[0].deathRateBps=0;engine.load(state);const before=engine.serialize();expect(()=>engine.step()).toThrow('overflow');expect(engine.serialize()).toBe(before);
  const p=initializePopulation(population,hierarchy);p.stats.births=Number.MAX_SAFE_INTEGER;const bytes=JSON.stringify(p);expect(()=>advancePopulationMonth(p)).toThrow('overflow');expect(JSON.stringify(p)).toBe(bytes);
  for(const c of p.cohorts){c.count=1;c.birthRateBps=0;c.deathRateBps=10000;}p.stats.births=0;for(let i=0;i<100;i++)advancePopulationMonth(p);expect(p.cohorts.every(c=>c.count===0)).toBe(true);
});
test('daily ticks do not clone/serialize population or evaluate summaries; pure module has no wall/random dependency',async()=>{
  for(const file of ['shared/population.cjs','shared/simulation.cjs'])expect(await fs.readFile(file,'utf8')).not.toMatch(/Math\s*\.\s*random|Date\.now|performance\.now|requestAnimationFrame/);
  const engine=new Simulation(scenario,hierarchy),stringify=JSON.stringify;
  try{global.structuredClone=()=>{throw Error('daily clone');};JSON.stringify=()=>{throw Error('daily serialize');};engine.step(365);}finally{global.structuredClone=clone;JSON.stringify=stringify;}
  expect(engine.snapshot().systems.population.stats.monthsProcessed).toBe(12);
});
test('optional scenario asset is validated; editor save preserves exact bytes; population persists through local save API',async({request})=>{
  const id=`popfixture-${Date.now()}`,root=path.resolve('scenarios'),folder=path.resolve(root,id),saveRoot=path.resolve('saves'),saveFolder=path.resolve(saveRoot,id);
  const base=await(await request.get('/api/scenarios/1700')).json(),h=JSON.parse(await fs.readFile('client/data/adm2/hierarchy.json','utf8'));base.scenario.id=id;
  try{
    expect((await request.put(`/api/scenarios/${id}`,{data:base})).status()).toBe(200);
    await expect(fs.access(path.join(folder,'population.json'))).rejects.toMatchObject({code:'ENOENT'});
    const absent=await(await request.get(`/api/scenarios/${id}?population=1`)).json();expect(absent.population).toEqual({version:1,cultures:[],religions:[],strata:[],cohorts:[]});
    const p=clone(population);for(const c of p.cohorts)c.territoryId=h.territories[c.id==='pop-3'?1:0].id;
    const bytes=JSON.stringify(p,null,3)+'\n';await fs.writeFile(path.join(folder,'population.json'),bytes);
    const response=await request.get(`/api/scenarios/${id}?population=1`);expect(response.status()).toBe(200);const data=await response.json();expect(data.population).toEqual(p);
    expect((await request.put(`/api/scenarios/${id}`,{data:{...base,population:{bad:'runtime must not replace authored asset'}}})).status()).toBe(200);expect(await fs.readFile(path.join(folder,'population.json'),'utf8')).toBe(bytes);
    const engine=new Simulation(data,h);engine.step(31);const save=makeSave(engine.snapshot());expect((await request.put(`/api/saves/${id}`,{data:save})).status()).toBe(200);const saved=await(await request.get(`/api/saves/${id}`)).json();const loaded=new Simulation(data,h);loaded.load(saved.state);expect(loaded.serialize()).toBe(engine.serialize());loaded.step(334);engine.step(334);expect(loaded.serialize()).toBe(engine.serialize());
    await fs.writeFile(path.join(folder,'population.json'),'{broken');let bad=await request.get(`/api/scenarios/${id}?population=1`);expect(bad.status()).toBe(400);expect((await bad.json()).error).toContain('malformed');
    await fs.writeFile(path.join(folder,'population.json'),JSON.stringify({...p,version:9}));bad=await request.get(`/api/scenarios/${id}?population=1`);expect(bad.status()).toBe(400);expect((await bad.json()).error).toContain('unsupported version');
    expect((await request.get(`/api/scenarios/${id}`)).status()).toBe(200);
  }finally{for(const [target,baseRoot]of [[folder,root],[saveFolder,saveRoot]]){if(path.dirname(target)!==baseRoot||!/^popfixture-\d+$/.test(path.basename(target)))throw Error('Unsafe cleanup');await fs.rm(target,{recursive:true,force:true});}}
});
test('synthetic populated browser monthly update changes counts without political requests or map revision',async({page})=>{
  const h=JSON.parse(await fs.readFile('client/data/adm2/hierarchy.json','utf8')),p=clone(population),errors=[];let requests=0;
  for(const c of p.cohorts)c.territoryId=h.territories[c.id==='pop-3'?1:0].id;
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(r.url().includes('/api/political'))requests++;});
  // In-memory test input only; no synthetic data is ever written to real scenarios.
  await page.route('**/api/scenarios/1700?population=1',async route=>{const response=await route.fetch(),data=await response.json();await route.fulfill({response,json:{...data,population:p}});});
  await page.goto('/?scenario=1700');await page.waitForFunction(()=>window.mandateSimulation&&!mandateMap.politicalPending);const revision=await page.evaluate(()=>mandateMap.model.revision),before=requests;
  expect(await page.evaluate(()=>mandateSimulation.populationSummary().total)).toBe(112353);await page.evaluate(()=>mandateSimulation.step(31));await page.waitForTimeout(400);
  expect(await page.evaluate(()=>mandateSimulation.populationSummary().total)).toBe(112431);expect(await page.evaluate(()=>mandateMap.model.revision)).toBe(revision);expect(requests).toBe(before);expect(errors).toEqual([]);
});
test('populated 1700 baseline monthly ticks do not rebuild political map; DEV and scenario assets remain intact',async({page})=>{
  const errors=[],files=['scenario','countries','ownership','population','population.meta'].map(n=>`scenarios/1700/${n}.json`),hashes=()=>Promise.all(files.map(async f=>crypto.createHash('sha256').update(await fs.readFile(f)).digest('hex'))),before=await hashes();let political=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(r.url().includes('/api/political'))political++;});
  const authored=JSON.parse(await fs.readFile('scenarios/1700/population.json','utf8'));
  const expected=authored.cohorts.reduce((totals,c)=>{totals.total+=c.count;totals[c.settlement]+=c.count;return totals;},{total:0,urban:0,rural:0});
  expect(Number.isSafeInteger(expected.total)).toBe(true);expect(expected.total).toBeGreaterThan(0);expect(expected.urban+expected.rural).toBe(expected.total);
  await page.goto('/?scenario=1700');await page.waitForFunction(()=>window.mandateSimulation&&!mandateMap.politicalPending);
  expect(await page.evaluate(()=>{const {total,urban,rural}=mandateSimulation.populationSummary();return {total,urban,rural};})).toEqual(expected);
  const initial=await page.evaluate(()=>({revision:mandateMap.model.revision,generation:mandateMap.politicalGeneration,total:mandateSimulation.populationSummary().total}));const requests=political;
  await page.evaluate(()=>mandateSimulation.step(365));await page.waitForTimeout(400);expect(await page.evaluate(()=>({revision:mandateMap.model.revision,generation:mandateMap.politicalGeneration,total:mandateSimulation.populationSummary().total}))).toEqual(initial);expect(political).toBe(requests);
  await page.goto('/?editor=1&scenario=1700');await page.waitForFunction(()=>window.mandateEditor);expect(await page.evaluate(()=>window.mandateSimulation)).toBeUndefined();expect(await hashes()).toEqual(before);expect(errors).toEqual([]);
});
