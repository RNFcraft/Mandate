const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync,spawn}=require('node:child_process');
const {verifyFrozen,geometryDigest,freeze}=require('../scripts/freeze-gameplay-map.cjs');
const {generate}=require('../scripts/generate-gameplay-map.cjs');
const {Simulation}=require('../shared/simulation.cjs');
const {makeSave,validateSave}=require('../shared/save.cjs');
const {allocate,projectPopulation,projectAssignments}=require('../shared/province-projection.cjs');
const {unpackTopology}=require('../scripts/topology-codec.cjs');
const {feature,mesh}=require('topojson-client');
const fixture=require('./fixtures/population.cjs');
const read=async file=>JSON.parse(await fs.readFile(file));
test('frozen geography, IDs, manifest and shared land adjacency are canonical and idempotent',async()=>{
  const m=await verifyFrozen();expect(m.geographyId).toBe('mandate-provinces-v1');expect(m.provinceCount).toBe(5001);expect(m.geometryVersion).toBe(1);
  const packed=await read('client/data/map-v2/provinces.topo.json'),hierarchy=await read('client/data/map-v2/hierarchy.json'),adjacency=(await read('client/data/map-v2/adjacency.json')).neighbors;
  expect(geometryDigest(packed)).toBe(m.geometrySha256);expect(await freeze()).toEqual(m);
  expect(hierarchy.territories.map(t=>t.id)).toEqual(Array.from({length:5001},(_,i)=>`province:${String(i+1).padStart(5,'0')}`));
  for(const [id,rows]of Object.entries(adjacency)){expect(new Set(rows).size).toBe(rows.length);expect(rows).not.toContain(id);for(const other of rows)expect(adjacency[other]).toContain(id);}
  const t=unpackTopology(packed),owners=t.arcs.map(()=>new Set()),visit=a=>{for(const n of a)if(Array.isArray(n))visit(n);else owners[n<0?~n:n].add(current);};let current;
  for(const g of t.objects.provinces.geometries){current=g.id;visit(g.arcs);}const expected=Object.fromEntries(hierarchy.territories.map(r=>[r.id,new Set()]));for(const ids of owners)if(ids.size===2){const [a,b]=[...ids];expected[a].add(b);expected[b].add(a);}for(const id of Object.keys(expected))expect(adjacency[id]).toEqual([...expected[id]].sort());
  for(const name of Object.keys(m.files).filter(n=>n.endsWith('.json')))expect(await fs.readFile('client/data/map-v2/'+name,'utf8')).not.toMatch(/preview:\d{5}/);
  await expect(generate(undefined,'client/data/map-v2')).rejects.toThrow('Frozen gameplay geography cannot be overwritten');
});
test('scenario/save/state authorities reject the old atomic gameplay version',()=>{
  const simulation=new Simulation(fixture.scenario,fixture.hierarchy),save=makeSave(simulation.snapshot());expect(save.version).toBe(2);expect(save.state.version).toBe(2);
  for(const old of [{...save,version:1},{...save,geography:'mandate-atomic-v1'}])expect(()=>validateSave(old,fixture.hierarchy)).toThrow(/version|geography/);
  const old=simulation.snapshot();old.geography='mandate-atomic-v1';expect(()=>simulation.load(old)).toThrow('Incompatible geography');
  const oldScenario=structuredClone(fixture.scenario);oldScenario.scenario.version=3;oldScenario.scenario.geography='mandate-atomic-v1';expect(()=>new Simulation(oldScenario,fixture.hierarchy)).toThrow('Incompatible scenario');
});
test('cohort projection conserves every cohort and identity; owner/control area ties are ASCII',()=>{
  const mapping={a:{intersections:[{provinceId:'province:00002',allocationFraction:.5,overlapAreaKm2:1},{provinceId:'province:00001',allocationFraction:.5,overlapAreaKm2:1}]},b:{intersections:[{provinceId:'province:00001',allocationFraction:1,overlapAreaKm2:1}]}};
  expect(allocate(3,mapping.a.intersections)).toEqual([{provinceId:'province:00001',count:2},{provinceId:'province:00002',count:1}]);
  const source={...fixture.population,cohorts:[{...fixture.population.cohorts[0],id:'a1',territoryId:'a',count:3},{...fixture.population.cohorts[0],id:'a2',territoryId:'a',count:5,literacyBps:900}]};const out=projectPopulation(source,mapping);
  expect(out.qa.checkedCohorts).toBe(2);expect(out.qa.difference).toBe(0);expect(out.population.cohorts).toHaveLength(4);expect(out.population.cohorts.reduce((s,r)=>s+r.count,0)).toBe(8);expect(out).toEqual(projectPopulation({...source,cohorts:source.cohorts.slice().reverse()},mapping));
  const assignment=projectAssignments({a:'beta',b:'alpha'},{a:'alpha',b:'beta'},mapping,['province:00001','province:00002']);expect(assignment.ownership['province:00001']).toBe('alpha');expect(assignment.controllers['province:00002']).toBe('alpha');expect(assignment.qa.ambiguous.length).toBeGreaterThan(0);
});
test('tracked runtime cohorts conserve exact global/settlement totals and fallback provenance',async()=>{
  const h=await read('client/data/map-v2/hierarchy.json'),p=await read('scenarios/1700/population.json'),ids=new Set(h.territories.map(t=>t.id)),sum={total:0,urban:0,rural:0};for(const c of p.cohorts){expect(ids.has(c.territoryId)).toBe(true);sum.total+=c.count;sum[c.settlement]+=c.count;}expect(sum).toEqual({total:591714189,urban:46409598,rural:545304591});
  for(const name of ['1700','modern']){const owners=await read(`scenarios/${name}/ownership.json`);expect(Object.keys(owners).sort()).toEqual([...ids].sort());}
  const uncovered=await read('client/data/map-v2/uncovered-atoms.json');expect(uncovered.count).toBe(138);expect(uncovered.totalPopulation).toBe(19986);expect(uncovered.populationPositive.length).toBeGreaterThan(0);expect(uncovered.maxDistanceKm).toBeGreaterThan(0);
});
test('province political mesh hides equal-owner edges and changes with runtime ownership',async()=>{
  const t=unpackTopology(await read('client/data/map-v2/provinces.topo.json')),gs=t.objects.provinces.geometries,owner=new Map(gs.map(g=>[g.id,'same']));
  expect(mesh(t,t.objects.provinces,(a,b)=>a!==b&&owner.get(a.id)!==owner.get(b.id)).coordinates).toHaveLength(0);
  owner.set(gs[0].id,'different');expect(mesh(t,t.objects.provinces,(a,b)=>a!==b&&owner.get(a.id)!==owner.get(b.id)).coordinates.length).toBeGreaterThan(0);
});
test('normal scenario uses province authority and crisp DPR canvas without atomic requests',async({browser})=>{
  const context=await browser.newContext({deviceScaleFactor:2,viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  try{await page.goto('http://127.0.0.1:3010/?scenario=1700');await page.waitForFunction(()=>window.mandateSimulation&&mandateMap.frames>0);
    expect(await page.evaluate(()=>({geography:mandateSimulation.snapshot().geography,count:mandateMap.model.owners.size,pop:mandateSimulation.populationSummary().total,backing:[mandateMap.canvas.width,mandateMap.canvas.height],dpr:mandateMap.dpr}))).toEqual({geography:'mandate-provinces-v1',count:5001,pop:591714189,backing:[2880,1800],dpr:2});
    expect(requests.some(url=>/\/data\/adm2\/|\/api\/political/.test(url))).toBe(false);expect(await page.locator('canvas').evaluate(el=>getComputedStyle(el).imageRendering)).not.toBe('pixelated');
    const position=await page.evaluate(()=>({x:mandateMap.x+182.35*mandateMap.scale,y:mandateMap.y+41.14*mandateMap.scale}));await page.mouse.move(position.x,position.y);await page.mouse.click(position.x,position.y);expect(await page.evaluate(()=>mandateMap.selectedId)).toMatch(/^province:/);
    const before=await page.evaluate(()=>mandateMap.zoom);await page.mouse.wheel(0,-300);await expect.poll(()=>page.evaluate(()=>mandateMap.zoom)).toBeGreaterThan(before);
    await page.evaluate(()=>{mandateMap.zoom=1;mandateMap.selectedId=null;mandateMap.hoveredId=null;mandateMap.resize();mandateMap.x=(mandateMap.width-360*mandateMap.scale)/2;mandateMap.y=(mandateMap.height-180*mandateMap.scale)/2;mandateMap.background=null;mandateMap.invalidate();});await page.waitForTimeout(150);await page.screenshot({path:'test-results/map-v2-normal-world-dpr2.png'});expect(errors).toEqual([]);
    await fs.writeFile('test-results/map-v2-network.json',JSON.stringify(requests,null,2));
  }finally{await context.close();}
});
test('clean installed checkout starts through npm start with no ignored GIS/atomic runtime data',async({browser})=>{
  test.setTimeout(120000);const workspace=path.resolve('.'),root=path.resolve('tmp');await fs.mkdir(root,{recursive:true});const folder=await fs.mkdtemp(path.join(root,'clean-province-runtime-'));
  const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).split(/\r?\n/).filter(f=>/^(client\/|shared\/|scripts\/|scenarios\/(1700|modern)\/|package(-lock)?\.json$)/.test(f)&&!f.startsWith('client/data/adm2/'));
  let child;
  try{for(const f of files){const target=path.join(folder,f);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(workspace,f),target);}
    await fs.symlink(path.join(workspace,'node_modules'),path.join(folder,'node_modules'),process.platform==='win32'?'junction':'dir');await expect(fs.access(path.join(folder,'data/processed'))).rejects.toThrow();
    const npmCLI=process.env.npm_execpath?.replace(/(?:npx|npm)-cli\.js$/,'npm-cli.js')||path.join(path.dirname(process.execPath),process.platform==='win32'?'node_modules/npm/bin/npm-cli.js':'../lib/node_modules/npm/bin/npm-cli.js');child=spawn(process.execPath,[npmCLI,'start'],{cwd:folder,env:{...process.env,PORT:'3024'},windowsHide:true,detached:process.platform!=='win32',stdio:'pipe'});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
    await expect.poll(()=>output,{timeout:30000}).toContain('http://127.0.0.1:3024');const page=await browser.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
    await page.goto('http://127.0.0.1:3024/?scenario=1700');await page.waitForFunction(()=>window.mandateSimulation);expect(await page.evaluate(()=>mandateSimulation.snapshot().geography)).toBe('mandate-provinces-v1');expect(await page.evaluate(()=>mandateSimulation.populationSummary().total)).toBe(591714189);expect(requests.some(url=>/\/adm2\/|\/api\/political/.test(url))).toBe(false);expect(errors).toEqual([]);await page.goto('http://127.0.0.1:3024/?mapPreview=gameplay');await page.waitForFunction(()=>window.mandateMap?.frames>0);expect(await page.evaluate(()=>mandateMap.gameplayPreview.records.size)).toBe(5001);await page.close();
  }finally{if(child){if(process.platform==='win32')try{execFileSync('taskkill',['/pid',String(child.pid),'/t','/f'],{stdio:'ignore'});}catch{}else try{process.kill(-child.pid,'SIGTERM');}catch{}}if(path.dirname(folder)!==root)throw Error('Unsafe clean clone fixture');await fs.rm(folder,{recursive:true,force:true});}
});
test('published normal 1700 has the authored registry, owned capitals, relationships and matching province colors',async({page,request})=>{
 const data=await(await request.get('/api/scenarios/1700?population=1')).json(),h=await read('client/data/map-v2/hierarchy.json'),ids=new Set(h.territories.map(t=>t.id)),registry=new Set(data.polities.map(p=>p.id));expect(registry.size).toBe(167);expect(registry.has('RU')).toBe(false);expect(registry.has('US')).toBe(false);expect(data.politicalGeography.status).toBe('published');expect(data.politicalGeography.geography).toBe(h.id);expect(Object.keys(data.ownership).sort()).toEqual([...ids].sort());for(const [id,owner]of Object.entries(data.ownership)){expect(ids.has(id)).toBe(true);expect(owner===null||registry.has(owner)).toBe(true);}expect(data.controllers).toEqual({});expect(data.polityRelations.relations).toHaveLength(41);expect(data.countries.filter(c=>c.capitalRegionId)).toHaveLength(160);for(const c of data.countries)if(c.capitalRegionId){expect(ids.has(c.capitalRegionId)).toBe(true);expect(data.ownership[c.capitalRegionId]).toBe(c.id);}
 const anchors=await read('scenarios/1700/province-political-authoring.json');const {contains}=require('../scripts/mandate-world-provinces.cjs'),t=unpackTopology(await read('client/data/map-v2/provinces.topo.json')),features=feature(t,t.objects.provinces).features;for(const a of anchors.capitalAnchors.filter(a=>['fra_bourbon','nld_republic','habsburg','rus_tsardom','qing','tokugawa','venice','papal'].includes(a.polityId))){const c=data.countries.find(c=>c.id===a.polityId);expect(contains(features.find(f=>f.id===c.capitalRegionId).geometry,a.point)).toBe(true);}
 const requests=[],errors=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));await page.goto('/?scenario=1700');await page.waitForFunction(()=>window.mandateSimulation&&mandateMap.frames>0);expect(await page.evaluate(()=>[mandateSimulation.countries.size,[...mandateSimulation.countries.values()].filter(c=>c.capitalRegionId).length,mandateSimulation.populationSummary().total])).toEqual([167,160,591714189]);expect(await page.evaluate(()=>mandateMap.politicalFeatures.every(f=>f.owner===(mandateSimulation.ownership.get(f.id)??null)))).toBe(true);expect(await page.evaluate(()=>mandateMap.politicalBorders)).toEqual(mesh(t,t.objects.provinces,(a,b)=>a!==b&&(data.ownership[a.id]??null)!==(data.ownership[b.id]??null))); expect(requests.some(u=>/\/adm2\/|\/api\/political/.test(u))).toBe(false);expect(errors).toEqual([]);
});
