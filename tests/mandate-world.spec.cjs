const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const {authorWorld}=require('../scripts/mandate-world-authoring.cjs');
const {auditWorld,canonicalNeighbors}=require('../scripts/mandate-world-audit.cjs');
const {generateWorld,FROZEN}=require('../scripts/generate-mandate-world-1700.cjs');
const {hierarchy,population}=require('./fixtures/population.cjs');
const polities=['a','b','c','d','e','f'].map(id=>({id,name:id,shortName:id,type:id==='f'?'decentralized_region':'kingdom',color:'#778899'}));
const rule=(id,match,ownerPolityId)=>({id,match,ownerPolityId,reason:'Gameplay approximation'});
const config=()=>({version:1,year:1700,datasetId:'mandate-world-v1',description:'Synthetic gameplay authoring',polities,majorPolityIds:['a'],rules:[rule('fallback',{},null)],relationships:{version:1,relations:[]},overrides:[]});
const geometry=x=>({type:'Polygon',coordinates:[[[x,0],[x+1,0],[x+1,1],[x,1],[x,0]]]});
const features=hierarchy.territories.map((t,i)=>({id:t.id,geometry:geometry(i*3)}));
const input={features,hierarchy,baseline:population};
const topology={arcs:[[],[],[]],objects:{territories:{type:'GeometryCollection',geometries:[{id:features[0].id,type:'Polygon',arcs:[[0,1]]},{id:features[1].id,type:'Polygon',arcs:[[-2,2]]}]}}};

test('all six authoring precedence levels resolve deterministically, including residual sourceCountry metadata',()=>{
  const c=config(),id=features[0].id,sourceCountry=hierarchy.territories[0].adm0Id;
  const chain=[rule('fallback',{},'a'),rule('country',{sourceCountry},'b'),rule('bbox',{bbox:[-1,-1,8,2]},'c'),rule('bbox-country',{bbox:[-1,-1,8,2],sourceCountry},'d'),rule('list',{territoryIds:[id]},'e'),rule('exact',{territoryId:id},'f')];
  for(let i=0;i<chain.length;i++){c.rules=chain.slice(0,i+1);expect(authorWorld(c,input).asset.owners[id]).toBe(chain[i].ownerPolityId);}
  c.rules=[rule('country',{sourceCountry:hierarchy.territories[1].adm0Id},'f')];expect(authorWorld(c,input).asset.owners[features[1].id]).toBe('f');
});
test('same specificity conflicts fail even below a stronger rule; identical targets and null are valid',()=>{
  const c=config(),id=features[0].id;c.rules=[rule('one',{},'a'),rule('two',{},'b'),rule('exact',{territoryId:id},'f')];expect(()=>authorWorld(c,input)).toThrow('equal-specificity');
  c.rules=[rule('one',{},null),rule('two',{},null)];expect(authorWorld(c,input).asset.owners).toEqual({});
  c.rules=[rule('decentralized',{},'f')];expect(Object.values(authorWorld(c,input).asset.owners)).toEqual(['f','f']);
});
test('unknown references, malformed selectors and relationships are rejected; gameplay override needs no citation',()=>{
  for(const m of [{sourceCountry:'missing'},{territoryId:'missing'},{territoryIds:[features[0].id,features[0].id]},{bbox:null},{bbox:[0,0,0,1]},{ownership:'RU'}]){const c=config();c.rules=[rule('bad',m,'a')];expect(()=>authorWorld(c,input)).toThrow();}
  const c=config();c.relationships.relations=[{type:'colonial_dependency',from:'f',to:'a'}];c.overrides=[{territoryId:features[0].id,ownerPolityId:'f',reason:'Strategic continuity'}];expect(authorWorld(c,input).asset.owners[features[0].id]).toBe('f');c.relationships.relations[0].to='unknown';expect(()=>authorWorld(c,input)).toThrow();
});
test('assignments and bytes ignore rule/registry/feature order and DEV RU/US ownership',()=>{
  const c=config();c.rules=[rule('a-country',{sourceCountry:hierarchy.territories[0].adm0Id},'a'),rule('b-box',{bbox:[2,-1,5,2]},'b')];
  const a=authorWorld(c,{...input,ownership:{[features[0].id]:'RU'}}),b=authorWorld({...c,rules:c.rules.slice().reverse(),polities:c.polities.slice().reverse()},{...input,features:features.slice().reverse(),ownership:{[features[0].id]:'US'}});expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});
test('audits use existing shared arcs, population mass and conservative disconnected/enclave warnings',()=>{
  const c=config();c.rules=[rule('all',{},'f')];c.overrides=[{territoryId:features[0].id,ownerPolityId:'a',reason:'Synthetic enclave'}];const result=authorWorld(c,input),before=JSON.stringify(topology),audit=auditWorld(result,c,topology,hierarchy);
  expect(canonicalNeighbors(topology,hierarchy.territories).edges).toEqual([{arc:1,a:features[0].id,b:features[1].id}]);expect(audit.borderAdjacencies[0].sharedArcCount).toBe(1);expect(audit.summary.assignedPopulation).toBe(population.cohorts.reduce((n,c)=>n+c.count,0));expect(audit.isolatedTerritories).toHaveLength(2);expect(JSON.stringify(topology)).toBe(before);
});
test('preview writes deterministic audit without publication; explicit test-fixture publication is atomic and preserves frozen bytes',async()=>{
  const root=path.resolve('tmp');await fs.mkdir(root,{recursive:true});const folder=await fs.mkdtemp(path.join(root,'world-test-')),scenarioDir=path.join(folder,'scenario'),audit=path.join(folder,'audit');
  try{
    await fs.mkdir(scenarioDir);const c=config();c.rules=[rule('all',{},'f')];await fs.writeFile(path.join(scenarioDir,'political-geography-authoring.json'),JSON.stringify(c));await fs.writeFile(path.join(scenarioDir,'political-geography.json'),'{}');await fs.writeFile(path.join(scenarioDir,'population.json'),'frozen synthetic population');
    const context={geography:{features,hierarchy,geographyHash:'a'.repeat(64),hierarchyHash:'b'.repeat(64)},topology,baseline:population,protectedFiles:[path.join(scenarioDir,'population.json')]},options={scenarioDir,audit};
    await generateWorld(options,context);expect(await fs.readFile(path.join(scenarioDir,'political-geography.json'),'utf8')).toBe('{}');const bytes=await fs.readFile(path.join(audit,'political-geography.json'),'utf8');await generateWorld(options,context);expect(await fs.readFile(path.join(audit,'political-geography.json'),'utf8')).toBe(bytes);
    await generateWorld({...options,publish:true},context);expect(JSON.parse(await fs.readFile(path.join(scenarioDir,'political-geography.json'))).status).toBe('published');expect(await fs.readFile(path.join(scenarioDir,'population.json'),'utf8')).toBe('frozen synthetic population');
    c.rules.push(rule('conflict',{},'a'));await fs.writeFile(path.join(scenarioDir,'political-geography-authoring.json'),JSON.stringify(c));const previous=await fs.readFile(path.join(scenarioDir,'political-geography.json'),'utf8');await expect(generateWorld({...options,publish:true},context)).rejects.toThrow('conflict');expect(await fs.readFile(path.join(scenarioDir,'political-geography.json'),'utf8')).toBe(previous);
  }finally{if(path.dirname(folder)!==root)throw Error('Unsafe cleanup');await fs.rm(folder,{recursive:true,force:true});}
});
test('Mandate World real preview meets coverage and renders colors, canonical borders and click inspection without publishing',async({page,request})=>{
  test.setTimeout(120000);
  const protectedFiles=[...FROZEN,'scenarios/1700/political-geography.json','scenarios/1700/polities.json','scenarios/1700/polity-relations.json','scenarios/1700/ownership.json','scenarios/1700/countries.json'],hashes=async()=>Promise.all(protectedFiles.map(async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex'))),before=await hashes();
  const {audit}=await generateWorld();expect(audit.summary.polityCount).toBeGreaterThanOrEqual(100);expect(audit.summary.polityCount).toBeLessThanOrEqual(200);expect(audit.summary.assignedPopulationPct).toBeGreaterThan(95);expect(audit.summary.assignedInhabitedAreaPct).toBeGreaterThan(90);
  const data=await(await request.get('/api/scenarios/1700?population=1&politicalPreview=mandate-world-v1')).json();expect(data.polities.some(p=>p.id==='qing')).toBe(true);expect(Object.values(data.ownership)).toContain('fra_bourbon');expect((await request.get('/api/scenarios/1700?politicalPreview=../bad')).status()).toBe(400);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?scenario=1700&politicalPreview=mandate-world-v1');await page.waitForFunction(()=>window.inspectPoliticalTerritory&&mandateMap.politicalFeatures?.length);
  await expect(page.locator('#political-inspect')).toContainText('PREVIEW');await expect(page.locator('#political-inspect')).toBeInViewport();expect(await page.evaluate(()=>mandateMap.politicalFeatures.some(f=>f.owner==='fra_bourbon'))).toBe(true);expect(await page.evaluate(()=>mandateMap.model.owners===mandateSimulation.ownership)).toBe(true);
  const row=await page.evaluate(()=>{const id=[...mandateSimulation.ownership].find(([,owner])=>owner==='fra_bourbon')[0];mandateMap.canvas.dispatchEvent(new CustomEvent('regionselect',{detail:{regionId:id}}));return inspectPoliticalTerritory(id);});expect(row.ownerPolityId).toBe('fra_bourbon');expect(row.controllerPolityId).toBe('fra_bourbon');expect(Number.isSafeInteger(row.population)).toBe(true);await expect(page.locator('#political-inspect')).toHaveText(JSON.stringify(row));expect(errors).toEqual([]);
  await page.screenshot({path:path.resolve('data/generated/political-geography/1700/mandate-world-v1/map-preview.png')});
  expect(await hashes()).toEqual(before);
});
