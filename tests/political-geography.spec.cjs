const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const politics=require('../shared/political-geography.cjs');
const {assignPoliticalGeography,geometryOf}=require('../scripts/political-geography-assignment.cjs');
const {generatePoliticalGeography}=require('../scripts/import-political-geography-1700.cjs');
const {parseStrictJson}=require('../scripts/strict-json.cjs');
const {Simulation}=require('../shared/simulation.cjs');
const {makeSave,validateSave}=require('../shared/save.cjs');
const fixture=require('./fixtures/population.cjs');
const hierarchy=fixture.hierarchy,baseline=fixture.population;
const polities=['alpha','beta'].map((id,i)=>({id,name:id,shortName:id,type:'synthetic',color:i?'#445566':'#112233'}));
const relations={version:1,relations:[]},overrides={version:1,overrides:[]};
const rect=(x,y,w=1,h=1)=>({type:'Polygon',coordinates:[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]]});
const features=hierarchy.territories.map((t,i)=>({id:t.id,geometry:rect(i*3,0)}));
const source=(id,geometry)=>({type:'Feature',properties:{polityId:id},geometry});
const fc=features=>({type:'FeatureCollection',features});
const assign=extra=>assignPoliticalGeography({features,hierarchy,baseline,polities,relations,overrides,...extra});
const published=()=>({...assign({sources:[fc([source('alpha',rect(0,0))])]}).asset,status:'published'});
const scenario=()=>({...structuredClone(fixture.scenario),polities,polityRelations:relations,politicalGeography:published()});

test('registry validates stable authored metadata and rejects invalid/duplicate IDs',()=>{
  expect([...politics.validatePolities(polities)]).toEqual(['alpha','beta']);
  for(const value of [[...polities,polities[0]],[{...polities[0],id:'é'}],[{...polities[0],color:'red'}]])expect(()=>politics.validatePolities(value)).toThrow();
});
test('unknown ownership/controller and territory references fail; explicit null is valid',()=>{
  const asset=published(),id=features[0].id;
  for(const bad of [{...asset,owners:{missing:'alpha'}},{...asset,owners:{[id]:'missing'}},{...asset,controllers:{[id]:'missing'}}])expect(()=>politics.validatePoliticalGeography(bad,polities,relations,hierarchy)).toThrow();
  expect(()=>politics.validatePoliticalGeography({...asset,owners:{[id]:null},controllers:{}},polities,relations,hierarchy)).not.toThrow();
  expect(()=>politics.initializePoliticalScenario({...scenario(),politicalGeography:null},hierarchy)).toThrow();
});
test('all dependency types validate references; union is symmetric, dependencies directional',()=>{
  for(const type of politics.RELATIONS)expect(politics.validateRelations({version:1,relations:[{type,from:'beta',to:'alpha'}]},polities)[0]).toEqual({type,from:type==='personal_union'?'alpha':'beta',to:type==='personal_union'?'beta':'alpha'});
  for(const r of [{type:'war',from:'alpha',to:'beta'},{type:'subject_of',from:'missing',to:'beta'},{type:'subject_of',from:'alpha',to:'alpha'}])expect(()=>politics.validateRelations({version:1,relations:[r]},polities)).toThrow();
  expect(()=>politics.validateRelations({version:1,relations:[{type:'personal_union',from:'alpha',to:'beta'},{type:'personal_union',from:'beta',to:'alpha'}]},polities)).toThrow('duplicate');
});
test('published owner/controller initialize existing runtime authority including unassigned and independent control',()=>{
  const input=scenario(),id=features[0].id;input.politicalGeography.controllers[id]='beta';
  const engine=new Simulation(input,hierarchy);expect(engine.territoryPoliticalState(id)).toEqual({territoryId:id,ownerPolityId:'alpha',controllerPolityId:'beta'});
  expect(engine.territoryPoliticalState(features[1].id).ownerPolityId).toBeNull();expect(engine.polities).toBe(engine.countries);
  input.politicalGeography.owners[id]='beta';expect(engine.ownership.get(id)).toBe('alpha');
});
test('save/load preserves runtime edits and relationships; old synthetic save wins over static politics',()=>{
  const input=scenario();input.polityRelations={version:1,relations:[{type:'subject_of',from:'beta',to:'alpha'}]};
  const a=new Simulation(input,hierarchy);a.submit({type:'SetOwnership',ids:[features[0].id],owner:'beta'});a.step(31);
  const save=makeSave(a.snapshot());validateSave(save,hierarchy);const b=new Simulation(input,hierarchy);b.load(save.state);expect(b.serialize()).toBe(a.serialize());a.step(31);b.step(31);expect(b.serialize()).toBe(a.serialize());
  const old=new Simulation(fixture.scenario,hierarchy).snapshot();b.load(old);expect(b.snapshot()).toEqual(old);expect(b.ownership.get(features[0].id)).toBe(fixture.scenario.ownership[features[0].id]);
});
test('draft political layer preserves synthetic DEV fallback without interpreting modern source prefixes',()=>{
  const input=scenario();input.politicalGeography.status='draft';expect(new Simulation(input,hierarchy).snapshot().ownership).toEqual(fixture.scenario.ownership);
  expect(assign({}).asset.owners).toEqual({});
});
test('GeoJSON imports with explicit configurable polity field; largest exact overlap wins',()=>{
  const f=source('alpha',rect(0,0,.25));f.properties={entity:'alpha'};
  const g=source('beta',rect(.25,0,.75));g.properties={entity:'beta'};
  const result=assign({sources:[fc([f,g])],polityField:'entity'});expect(result.asset.owners[features[0].id]).toBe('beta');expect(result.audit.territoryAssignments[0].confidence).toBe('MEDIUM');
  expect(()=>assign({sources:[fc([source('missing',rect(0,0))])]})).toThrow();
});
test('equal overlaps use ASCII tie; ambiguity exposes winner and runner percentages',()=>{
  const result=assign({sources:[fc([source('beta',rect(0,0)),source('alpha',rect(0,0))])]});const row=result.audit.ambiguousTerritories[0];
  expect(row.winningPolityId).toBe('alpha');expect(row.secondPolityId).toBe('beta');expect(row.winningOverlapPct).toBe(100);expect(row.secondOverlapPct).toBe(100);
});
test('low confidence is audited and thresholds validated',()=>{
  const result=assign({sources:[fc([source('alpha',rect(0,0,.2))])]});expect(result.audit.ambiguousTerritories[0].confidence).toBe('LOW');
  for(const thresholds of [{high:NaN},{medium:-1},{high:.5,medium:.6},{unknown:1}])expect(()=>assign({thresholds})).toThrow();
});
test('override wins after overlap; null and controller overrides remain auditable',()=>{
  const id=features[0].id,row={territoryId:id,ownerPolityId:'beta',controllerPolityId:'alpha',reason:'Synthetic conflict',source:'Synthetic fixture'};
  const result=assign({sources:[fc([source('alpha',rect(0,0))])],overrides:{version:1,overrides:[row]}});
  expect(result.asset.owners[id]).toBe('beta');expect(result.asset.controllers[id]).toBe('alpha');expect(result.audit.manualOverrides[0].previousOwnerPolityId).toBe('alpha');
  const cleared=assign({overrides:{version:1,overrides:[{...row,ownerPolityId:null}]}});expect(cleared.asset.owners[id]).toBeUndefined();expect(cleared.asset.controllers[id]).toBe('alpha');
  for(const rows of [[row,row],[{...row,territoryId:'missing'}],[{...row,source:''}]])expect(()=>assign({overrides:{version:1,overrides:rows}})).toThrow();
});
test('source/feature/registry/canonical order does not alter assignment bytes; same-polity patches union once',()=>{
  const a=source('alpha',rect(0,0)),b=source('beta',rect(3,0));const input={sources:[fc([a,a]),fc([b])]};
  const result=assign(input);expect(result.audit.territoryAssignments[0].winningOverlapPct).toBe(100);
  expect(assign({...input,sources:input.sources.slice().reverse(),features:features.slice().reverse(),polities:polities.slice().reverse()})).toEqual(result);
  expect(assign({sources:[fc([a,b])]})).toEqual(assign({sources:[fc([b,a])]}));
  expect(JSON.stringify(assign(input))).toBe(JSON.stringify(result));
});
test('malformed geometry and canonical ID/count mismatch rejected before assignment',()=>{
  for(const g of [null,{type:'Point',coordinates:[0,0]},rect(NaN,0),rect(181,0),{type:'Polygon',coordinates:[[[0,0],[1,0],[0,1]]]}])expect(()=>geometryOf(g)).toThrow();
  expect(()=>assign({features:features.slice(1)})).toThrow('count mismatch');expect(()=>assign({features:[features[0],features[0]]})).toThrow();
  expect(()=>geometryOf({type:'Polygon',coordinates:[[[0,0],[3,3],[0,3],[2,0],[0,0]]]})).toThrow('self-intersecting');
  expect(()=>geometryOf({type:'Polygon',coordinates:[rect(0,0).coordinates[0],rect(3,0,.1,.1).coordinates[0]]})).toThrow('outside');
  expect(()=>parseStrictJson('{"owners":{"x":null,"\\u0078":"alpha"}}')).toThrow();
});
test('unassigned area/population and polity urban/rural totals derive solely from baseline',()=>{
  const result=assign({sources:[fc([source('alpha',rect(0,0))])]});
  const expected=baseline.cohorts.filter(c=>c.territoryId===features[0].id),total=expected.reduce((n,c)=>n+c.count,0);
  expect(result.audit.politySummary.find(p=>p.polityId==='alpha').population).toBe(total);
  expect(result.audit.summary.assignedPopulation+result.audit.summary.unassignedPopulation).toBe(baseline.cohorts.reduce((n,c)=>n+c.count,0));
  expect(result.audit.summary.unassignedTerritories).toBe(features.length-1);expect(result.audit.summary.unassignedAreaKm2).toBeGreaterThan(0);
  for(const p of result.audit.politySummary)expect(p.urban+p.rural).toBe(p.population);
});
test('political borders reference shared canonical arcs and distinguish owner from control',()=>{
  const topology={arcs:[[],[],[]],neighbors:[[0],[0,1],[1]]},state={ownership:{[features[0].id]:'alpha',[features[1].id]:'beta'},controllers:{[features[1].id]:'alpha'}};
  const before=JSON.stringify(topology);expect(politics.politicalBorderArcs(topology,hierarchy.territories,state)).toEqual([1]);expect(politics.politicalBorderArcs(topology,hierarchy.territories,state,{control:true})).toEqual([]);expect(JSON.stringify(topology)).toBe(before);
});
test('offline preview/repeated atomic publication is deterministic; failed generation preserves all authoritative bytes',async()=>{
  const root=path.resolve('tmp');await fs.mkdir(root,{recursive:true});const folder=await fs.mkdtemp(path.join(root,'political-test-')),scenarioDir=path.join(folder,'scenario'),audit=path.join(folder,'audit');
  const write=(name,value)=>fs.writeFile(path.join(scenarioDir,name),JSON.stringify(value));
  try{
    await fs.mkdir(scenarioDir);await write('polities.json',polities);await write('polity-relations.json',relations);await write('political-geography-overrides.json',overrides);await write('political-geography.json',{sentinel:true});
    for(const name of ['atomic.topo.json','population.json','population.meta.json'])await write(name,{frozen:name});
    const protectedFiles=['atomic.topo.json','population.json','population.meta.json'].map(f=>path.join(scenarioDir,f)),hashes=async()=>Promise.all(protectedFiles.map(async f=>crypto.createHash('sha256').update(await fs.readFile(f)).digest('hex'))),before=await hashes();
    const sourceFile=path.join(folder,'source.geojson');await fs.writeFile(sourceFile,JSON.stringify(fc([source('alpha',rect(0,0))])));
    const options={scenarioDir,audit,sources:[sourceFile],sourceName:'Synthetic rectangles',sourceDate:'1700',sourceVersion:'fixture-v1'},context={geography:{features,hierarchy,geographyHash:'a'.repeat(64),hierarchyHash:'b'.repeat(64)},baseline,protectedFiles};
    await generatePoliticalGeography(options,context);expect(JSON.parse(await fs.readFile(path.join(scenarioDir,'political-geography.json')))).toEqual({sentinel:true});
    await generatePoliticalGeography({...options,publish:true},context);const bytes=await fs.readFile(path.join(scenarioDir,'political-geography.json'),'utf8');await generatePoliticalGeography({...options,publish:true},context);expect(await fs.readFile(path.join(scenarioDir,'political-geography.json'),'utf8')).toBe(bytes);
    await fs.writeFile(sourceFile,'{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"polityId":"missing"},"geometry":null}]}');
    await expect(generatePoliticalGeography({...options,publish:true},context)).rejects.toThrow();expect(await fs.readFile(path.join(scenarioDir,'political-geography.json'),'utf8')).toBe(bytes);expect(await hashes()).toEqual(before);
    expect((await fs.readdir(scenarioDir)).some(f=>f.endsWith('.tmp'))).toBe(false);
  }finally{if(path.dirname(folder)!==root)throw Error('Unsafe fixture cleanup');await fs.rm(folder,{recursive:true,force:true});}
});
test('scenario API initializes published politics and editor preserves authored political bytes',async({request})=>{
  const root=path.resolve('scenarios'),id=`politicalfixture-${crypto.randomUUID()}`,folder=path.join(root,id);
  const base=await(await request.get('/api/scenarios/1700')).json(),h=JSON.parse(await fs.readFile('client/data/adm2/hierarchy.json'));base.scenario.id=id;
  try{
    expect((await request.put(`/api/scenarios/${id}`,{data:base})).status()).toBe(200);
    const asset={version:1,year:1700,geography:h.id,status:'published',owners:{[h.territories[0].id]:'alpha'},controllers:{[h.territories[0].id]:'beta'},provenance:{note:'Synthetic API fixture'}};
    const files={'polities.json':polities,'polity-relations.json':relations,'political-geography.json':asset,'political-geography-overrides.json':overrides};
    for(const [file,value]of Object.entries(files))await fs.writeFile(path.join(folder,file),JSON.stringify(value,null,3)+'\n');
    const response=await request.get(`/api/scenarios/${id}`);expect(response.status()).toBe(200);const data=await response.json();expect(data.ownership[h.territories[0].id]).toBe('alpha');expect(data.controllers[h.territories[0].id]).toBe('beta');expect(data.ownership[h.territories[1].id]).toBeNull();
    expect((await request.put(`/api/scenarios/${id}`,{data:{...data,politicalGeography:{bad:true}}})).status()).toBe(200);
    for(const [file,value]of Object.entries(files))expect(await fs.readFile(path.join(folder,file),'utf8')).toBe(JSON.stringify(value,null,3)+'\n');
    await fs.writeFile(path.join(folder,'political-geography.json'),'null');const invalid=await request.get(`/api/scenarios/${id}`);expect(invalid.status()).toBe(500);expect((await invalid.json()).error).toEqual(expect.any(String));
  }finally{if(path.dirname(folder)!==root)throw Error('Unsafe fixture cleanup');await fs.rm(folder,{recursive:true,force:true});}
});
test('real mesh preview is explicit, debug click queries runtime, and frozen file hashes remain identical',async({request,page})=>{
  test.setTimeout(120000);
  const files=['data/processed/canonical/atomic.topo.json','client/data/adm2/hierarchy.json','scenarios/1700/population.json','scenarios/1700/population.meta.json','scenarios/1700/ownership.json','scenarios/1700/countries.json'];
  const hashes=async()=>Promise.all(files.map(async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'))),before=await hashes();
  const result=await generatePoliticalGeography();expect(result.audit.summary.assignedTerritories).toBe(0);expect(result.audit.summary.unassignedPopulation).toBe(591714189);
  const preview=await(await request.get('/api/scenarios/1700?politicalPreview=1')).json();expect(preview.politicalPreview).toBe(true);expect(Object.values(preview.ownership).every(value=>value===null)).toBe(true);
  await page.goto('/?scenario=1700&politicalPreview=1');await page.waitForFunction(()=>window.inspectPoliticalTerritory);await expect(page.locator('#political-inspect')).toContainText('PREVIEW');
  const row=await page.evaluate(()=>{const id=mandateMap.model.geography?.territories?.[0]?.id||[...mandateSimulation.ownership.keys()][0];mandateMap.canvas.dispatchEvent(new CustomEvent('regionselect',{detail:{regionId:id}}));return inspectPoliticalTerritory(id);});
  expect(row.ownerPolityId).toBeNull();expect(row.controllerPolityId).toBeNull();expect(Number.isSafeInteger(row.population)).toBe(true);await expect(page.locator('#political-inspect')).toHaveText(JSON.stringify(row));expect(await hashes()).toEqual(before);
});
