const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {Simulation,initializeGameState,nextRandom}=require('../shared/simulation.cjs');
const {makeSave,validateSave,validSaveId}=require('../shared/save.cjs');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const hierarchy={id:'mandate-provinces-v1',adm0:[{id:'A'}],adm1:[{id:'p',adm0Id:'A'}],territories:[{id:'province:00001',adm0Id:'A',adm1Id:'p',kind:'adm2'},{id:'province:00002',adm0Id:'A',adm1Id:'p',kind:'residual'}]};
const scenario={scenario:{id:'fixture',name:'Fixture',year:1700,version:4,geography:hierarchy.id},countries:[{id:'A',name:'A',shortName:'A',color:'#778899',capitalRegionId:'province:00001',governmentType:'unspecified'}],ownership:{'province:00001':'A','province:00002':null},controllers:{'province:00002':'A'}};
test('scenario initializes isolated GameState, serializable PRNG and Gregorian daily clock',()=>{
  const initial=structuredClone(scenario),engine=new Simulation(initial,hierarchy,{seed:0});
  expect(engine.clock).toEqual({tick:0,date:{year:1700,month:1,day:1},paused:true,speed:1});
  expect(engine.snapshot().ownership).toEqual(scenario.ownership);expect(engine.snapshot().controllers).toEqual(scenario.controllers);
  initial.ownership['province:00001']=null;expect(engine.ownership.get('province:00001')).toBe('A');
  expect(engine.ownership.set).toBeUndefined();expect(Object.isFrozen(engine.countries.get('A'))).toBe(true);
  const copy=engine.snapshot();copy.ownership['province:00001']=null;expect(engine.ownership.get('province:00001')).toBe('A');
  engine.step(59);expect(engine.clock.date).toEqual({year:1700,month:3,day:1});expect(engine.snapshot().systems.tickProbe.ticks).toBe(59);
  const leap=structuredClone(scenario);leap.scenario.year=2000;const leapEngine=new Simulation(leap,hierarchy);leapEngine.step(59);expect(leapEngine.clock.date).toEqual({year:2000,month:2,day:29});leapEngine.step();expect(leapEngine.clock.date.day).toBe(1);
  const end=structuredClone(scenario);end.scenario.year=9999;const limit=new Simulation(end,hierarchy);limit.step(364);const before=limit.serialize();expect(()=>limit.step()).toThrow();expect(limit.serialize()).toBe(before);
  expect(nextRandom(1)).toBe(270369);
});
test('identical seed and commands are deterministic; rejected commands/load never partially mutate',()=>{
  const a=new Simulation(scenario,hierarchy,{seed:123}),b=new Simulation(scenario,hierarchy,{seed:123}),c=new Simulation(scenario,hierarchy,{seed:321});
  for(const engine of [a,b,c]){engine.start();engine.setSpeed(20);engine.step(50);engine.submit({type:'SetOwnership',ids:['province:00001'],owner:null});engine.pause();engine.step(2);}
  expect(a.serialize()).toBe(b.serialize());expect(c.snapshot().systems.tickProbe.lastRandom).not.toBe(a.snapshot().systems.tickProbe.lastRandom);
  const before=a.serialize();const notifications=[];a.subscribe(e=>notifications.push(e.type));
  for(const command of [null,{type:'Unknown'},{type:'SetSimulationSpeed',speed:3},{type:'PauseSimulation',extra:true},{type:'SetOwnership',ids:['province:00001','missing'],owner:'A'},{type:'SetOwnership',ids:['province:00001'],owner:'missing'},{type:'SetOwnership',ids:['province:00001','province:00001'],owner:'A'}]){expect(a.submit(command).ok).toBe(false);expect(a.serialize()).toBe(before);}
  expect(notifications).toEqual([]);
  const bad=a.snapshot();bad.geography='other';expect(()=>a.load(bad)).toThrow('Incompatible geography');expect(a.serialize()).toBe(before);
  const invalid=a.snapshot();invalid.clock.date.day++;expect(()=>a.load(invalid)).toThrow('Invalid simulation clock');expect(a.serialize()).toBe(before);
});
test('save/load preserves exact state and continuation; simulation has no random wall-clock dependency',async()=>{
  const a=new Simulation(scenario,hierarchy,{seed:42});a.step(31);a.setSpeed(100);
  const save=makeSave(a.snapshot());validateSave(save,hierarchy);
  const b=new Simulation(scenario,hierarchy);b.load(JSON.parse(JSON.stringify(save)).state);expect(b.serialize()).toBe(a.serialize());a.step(10);b.step(10);expect(b.serialize()).toBe(a.serialize());
  const bad=structuredClone(save);bad.version=1;expect(()=>validateSave(bad,hierarchy)).toThrow();
  const source=await fs.readFile('shared/simulation.cjs','utf8');expect(source).not.toMatch(/Math\s*\.\s*random\s*\(/);expect(source).not.toMatch(/Date\s*\(|Date\.now|performance\./);
  const clone=global.structuredClone,stringify=JSON.stringify;
  try{global.structuredClone=()=>{throw new Error('Cloning during tick');};JSON.stringify=()=>{throw new Error('Serializing during tick');};a.step(1000);}finally{global.structuredClone=clone;JSON.stringify=stringify;}
});
test('real-time driver pauses, batches fixed steps and resets speed/load timing',async()=>{
  const source=await fs.readFile('client/game/clock.js','utf8');const {ClockDriver}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  let now=0;const engine=new Simulation(scenario,hierarchy),driver=new ClockDriver(engine,{now:()=>now});
  try{
    now=5000;driver.pump();expect(engine.clock.tick).toBe(0);
    engine.start();now+=500;driver.pump();expect(engine.clock.tick).toBe(0);now+=500;driver.pump();expect(engine.clock.tick).toBe(1);
    engine.setSpeed(5);now+=400;driver.pump();expect(engine.clock.tick).toBe(3);
    engine.pause();now+=3600000;driver.pump();expect(engine.clock.tick).toBe(3);
    engine.step();expect(engine.clock.tick).toBe(4);
    engine.start();engine.setSpeed(100);now+=3600000;driver.pump();expect(engine.clock.tick).toBe(104);
  }finally{driver.dispose();}
  const a=new Simulation(scenario,hierarchy),b=new Simulation(scenario,hierarchy);let ta=0,tb=0;const da=new ClockDriver(a,{now:()=>ta}),db=new ClockDriver(b,{now:()=>tb});
  try{a.start();b.start();a.setSpeed(20);b.setSpeed(20);for(let i=0;i<10;i++){ta+=100;da.pump();}tb=1000;db.pump();expect(a.serialize()).toBe(b.serialize());}finally{da.dispose();db.dispose();}
});
test('runtime save API is atomic, exact, validates geography/paths and preserves original on rejection',async({request})=>{
  const id=`simapi-${Date.now()}`,root=path.resolve('saves'),folder=path.resolve(root,id);
  const h=await read('client/data/map-v2/hierarchy.json');const data=Object.fromEntries(await Promise.all(['scenario','countries','ownership'].map(async name=>[name,await read(`scenarios/1700/${name}.json`)])));
  const engine=new Simulation(data,h,{seed:19});engine.step(37);const save=makeSave(engine.snapshot());
  try{
    expect((await request.put(`/api/saves/${id}`,{data:save})).status()).toBe(200);
    const bytes=await fs.readFile(path.join(folder,'save.json'),'utf8');expect(await(await request.get(`/api/saves/${id}`)).json()).toEqual(save);
    expect((await(await request.get('/api/saves')).json()).some(row=>row.id===id)).toBe(true);
    const bad=structuredClone(save);bad.geography='wrong';expect((await request.put(`/api/saves/${id}`,{data:bad})).status()).toBe(400);expect(await fs.readFile(path.join(folder,'save.json'),'utf8')).toBe(bytes);
    expect((await request.put('/api/saves/CON',{data:save})).status()).toBe(400);expect((await request.put('/api/saves/bad%2Fid',{data:save})).status()).toBe(400);
    expect((await request.put(`/api/saves/${id}`,{data:save,headers:{origin:'https://example.invalid'}})).status()).toBe(403);
    engine.step();const next=makeSave(engine.snapshot());expect((await request.put(`/api/saves/${id}`,{data:next})).status()).toBe(200);expect(await(await request.get(`/api/saves/${id}`)).json()).toEqual(next);
    expect(await fs.readdir(folder)).toEqual(['save.json']);
  }finally{if(path.dirname(folder)!==root||!/^simapi-\d+$/.test(path.basename(folder)))throw Error('Unsafe cleanup');await fs.rm(folder,{recursive:true,force:true});}
});
test('save IDs reject Windows reserved names with the shared client/server validator',()=>{
  for(const id of ['CON','prn','AuX','nul',...Array.from({length:9},(_,i)=>`COM${i+1}`),...Array.from({length:9},(_,i)=>`lpt${i+1}`),'bad/id',''])expect(validSaveId(id)).toBe(false);
  for(const id of ['save-1700','CON-save','COM0','lpt10'])expect(validSaveId(id)).toBe(true);
});
for(const kind of ['malformed','structural','incompatible'])test(`${kind} save does not break listing or valid save loading and remains untouched`,async({request})=>{
  const root=path.resolve('saves'),prefix=`simlist-${kind}-${Date.now()}`,ids=[`${prefix}-valid`,`${prefix}-bad`];
  const folders=ids.map(id=>path.resolve(root,id));
  const h=await read('client/data/map-v2/hierarchy.json'),data=Object.fromEntries(await Promise.all(['scenario','countries','ownership'].map(async name=>[name,await read(`scenarios/1700/${name}.json`)])));
  const save=makeSave(new Simulation(data,h).snapshot());
  const invalid=structuredClone(save);if(kind==='structural')invalid.state.clock.tick=-1;else invalid.geography='incompatible';
  const bytes=kind==='malformed'?'{broken json':JSON.stringify(invalid);
  try{
    expect((await request.put(`/api/saves/${ids[0]}`,{data:save})).status()).toBe(200);
    await fs.mkdir(folders[1]);await fs.writeFile(path.join(folders[1],'save.json'),bytes);
    const listing=await request.get('/api/saves');expect(listing.status()).toBe(200);
    const rows=await listing.json();expect(rows.some(row=>row.id===ids[0])).toBe(true);expect(rows.some(row=>row.id===ids[1])).toBe(false);
    const loaded=await request.get(`/api/saves/${ids[0]}`);expect(loaded.status()).toBe(200);expect(await loaded.json()).toEqual(save);
    expect(await fs.readFile(path.join(folders[1],'save.json'),'utf8')).toBe(bytes);expect(await fs.readdir(folders[1])).toEqual(['save.json']);
  }finally{
    for(const folder of folders){if(path.dirname(folder)!==root||!/^simlist-(malformed|structural|incompatible)-\d+-(valid|bad)$/.test(path.basename(folder)))throw Error('Unsafe cleanup');await fs.rm(folder,{recursive:true,force:true});}
  }
});
test('1700 game UI play/pause/speeds/save/reload/load, ownership authority and DEV isolation',async({page})=>{
  test.setTimeout(120000);
  const errors=[],id=`simui-${Date.now()}`,root=path.resolve('saves'),folder=path.resolve(root,id);
  const files=['scenario','countries','ownership'].map(name=>`scenarios/1700/${name}.json`);const hashes=async()=>Promise.all(files.map(async f=>crypto.createHash('sha256').update(await fs.readFile(f)).digest('hex')));const before=await hashes();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await page.goto('/?scenario=1700');await page.waitForFunction(()=>window.mandateSimulation);await expect(page.locator('#game-date')).toHaveText('1700-01-01');
    await page.waitForTimeout(300);expect(await page.evaluate(()=>mandateSimulation.clock.tick)).toBe(0);
    expect(await page.evaluate(()=>mandateMap.model.owners===mandateSimulation.ownership&&mandateMap.model.owners.set===undefined)).toBe(true);
    const revision=await page.evaluate(()=>mandateMap.model.revision);await page.evaluate(()=>mandateSimulation.step(2));await expect(page.locator('#game-date')).toHaveText('1700-01-03');expect(await page.evaluate(()=>mandateMap.model.revision)).toBe(revision);
    await page.locator('#game-speed').selectOption('20');await page.locator('#game-play').click();await expect.poll(()=>page.evaluate(()=>mandateSimulation.clock.tick)).toBeGreaterThan(2);
    await page.locator('#game-play').click();const paused=await page.evaluate(()=>mandateSimulation.clock.tick);await page.waitForTimeout(300);expect(await page.evaluate(()=>mandateSimulation.clock.tick)).toBe(paused);
    let saveRequests=0;page.on('request',req=>{if(req.method()==='PUT'&&req.url().includes('/api/saves/'))saveRequests++;});
    await page.locator('#game-save-id').fill('cOn');await page.locator('#game-save').click();await expect(page.locator('#game-status')).not.toBeEmpty();expect(saveRequests).toBe(0);
    const snapshot=await page.evaluate(()=>mandateSimulation.serialize());await page.locator('#game-save-id').fill(id);await page.locator('#game-save').click();await expect(page.locator('#game-status')).toContainText(id);
    await page.reload();await page.waitForFunction(()=>window.mandateSimulation);await expect(page.locator('#game-date')).toHaveText('1700-01-01');await page.locator('#game-saves').selectOption(id);await page.locator('#game-load').click();await expect(page.locator('#game-status')).toContainText(`Загружено: ${id}`);
    expect(await page.evaluate(()=>mandateSimulation.serialize())).toBe(snapshot);
    await page.waitForFunction(()=>!mandateMap.politicalPending);await page.screenshot({path:'test-results/simulation-game.png'});
    await page.goto('/?editor=1&scenario=1700');await page.waitForFunction(()=>window.mandateEditor);expect(await page.locator('#game-date').count()).toBe(0);expect(await page.evaluate(()=>window.mandateSimulation===undefined)).toBe(true);
    expect(await hashes()).toEqual(before);expect(errors).toEqual([]);
  }finally{if(path.dirname(folder)!==root||!/^simui-\d+$/.test(path.basename(folder)))throw Error('Unsafe cleanup');await fs.rm(folder,{recursive:true,force:true});}
});
