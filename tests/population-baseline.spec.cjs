const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {execFileSync}=require('node:child_process');
const {parseAscii,readAscii,sameGrid,clean}=require('../scripts/population-raster.cjs');
const {box,spatialIndex,allocate,apportion,normalize,buildCohorts,createBaseline}=require('../scripts/population-baseline.cjs');
const {argsOf,publishPopulation,writeAudit}=require('../scripts/import-population-1700.cjs');
const {Simulation}=require('../shared/simulation.cjs');
const {makeSave}=require('../shared/save.cjs');
const {validatePopulationScenario,initializePopulation,summarizePopulation}=require('../shared/population.cjs');
const {hierarchy,scenario}=require('./fixtures/population.cjs');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const rect=(id,x,y,width,height=1)=>({id,geometry:{type:'Polygon',coordinates:[[[x,y],[x+width,y],[x+width,y+height],[x,y+height],[x,y]]]}});
const ascii=(values,{ncols=values.length,nrows=1,x=0,y=0,w=1,center=false}={})=>`ncols ${ncols}\nnrows ${nrows}\nxll${center?'center':'corner'} ${x}\nyll${center?'center':'corner'} ${y}\ncellsize ${w}\nNODATA_value -9999\n${Array.from({length:nrows},(_,i)=>values.slice(i*ncols,(i+1)*ncols).join(' ')).join('\n')}\n`;
async function inputs(total,urban=total.map(v=>v===-9999?-9999:0),rural=total,grid={}){
  const result={};for(const [key,values]of Object.entries({total,urban,rural})){const text=ascii(values,grid);result[key]={...await parseAscii(text),sha256:digest(text)};}return result;
}
const options={sanity:false,maxAnomalyPct:100,geographyHash:digest('synthetic tiny geometry'),hierarchyHash:digest(JSON.stringify(hierarchy))};
const features=[rect('gb:A:1',0,0,1)];
const resultOf=async(total,urban,rural,polygons=features,extra={})=>createBaseline(await inputs(total,urban,rural),polygons,hierarchy,{...options,...extra});
const root=path.resolve('data/generated');
async function temp(){const folder=path.join(root,'baseline-fixture-'+crypto.randomUUID());await fs.mkdir(folder,{recursive:true});return folder;}
async function cleanup(folder){if(path.dirname(folder)!==root||!/^baseline-fixture-[a-f0-9-]+$/.test(path.basename(folder)))throw Error('Unsafe fixture cleanup');await fs.rm(folder,{recursive:true,force:true});}
test('ASCII dimensions, row order, center origin and NODATA parse exactly',async()=>{
  const g=await parseAscii(ascii([1,2,-9999,4],{ncols:2,nrows:2,x:0.5,y:0.5,center:true}));expect(g.x).toBe(0);expect(g.y).toBe(0);expect([...g.values]).toEqual([1,2,-9999,4]);expect(clean(g,2)).toEqual({value:0,nodata:true});
  const result=await resultOf([-9999]);expect(result.population.cohorts).toEqual([]);expect(result.audit.positiveSourceCells).toBe(0);
});
for(const [name,text]of Object.entries({badRows:ascii([1,2],{ncols:1,nrows:2}).replace('1\n2\n','1\n'),extraRows:ascii([1])+'2\n',badNumber:ascii(['oops']),duplicateHeader:'ncols 1\n'+ascii([1]),badCoordinates:ascii([1],{x:190}),mixedOrigin:ascii([1]).replace('yllcorner','yllcenter')}))test(`ASCII rejects ${name}`,async()=>{await expect(parseAscii(text)).rejects.toThrow('Raster:');});
test('streamed plain/gzip raster input hashes original bytes; corrupt input rejects',async()=>{
  const folder=await temp();try{
    const bytes=Buffer.from(ascii([12,4])),gz=zlib.gzipSync(bytes),plain=path.join(folder,'total.asc'),compressed=plain+'.gz';await fs.writeFile(plain,bytes);await fs.writeFile(compressed,gz);
    const a=await readAscii(plain),b=await readAscii(compressed);expect([...a.values]).toEqual([...b.values]);expect(a.sha256).toBe(digest(bytes));expect(b.sha256).toBe(digest(gz));
    await fs.writeFile(compressed,'not gzip');await expect(readAscii(compressed)).rejects.toThrow();await expect(readAscii(path.join(folder,'missing.asc'))).rejects.toThrow();
  }finally{await cleanup(folder);}
});
test('grid mismatch rejects before allocation',async()=>{
  const rasters=await inputs([10]);rasters.urban.x=1;expect(()=>sameGrid(Object.values(rasters))).toThrow('mismatched');expect(()=>allocate(rasters,features)).toThrow('mismatched');
});
for(const [name,parts,expected]of [
  ['full cell',[rect('gb:A:1',0,0,1)],{'gb:A:1':100}],
  ['50/50',[rect('gb:A:1',0,0,0.5),rect('residual:A:p',0.5,0,0.5)],{'gb:A:1':50,'residual:A:p':50}],
  ['25/75',[rect('gb:A:1',0,0,0.25),rect('residual:A:p',0.25,0,0.75)],{'gb:A:1':25,'residual:A:p':75}],
  ['coastal partial cell',[rect('gb:A:1',0,0,0.1)],{'gb:A:1':100}]
])test(`${name}: overlap allocation conserves all intended land population`,async()=>{const result=await resultOf([100],[0],[100],parts);expect(Object.fromEntries(result.territories.map(r=>[r.territoryId,r.population]))).toEqual(expected);expect(result.meta.generated.total).toBe(100);});
test('holes exclude land and multipolygon parts combine to one territory weight',async()=>{
  const holed=rect('gb:A:1',0,0,1);holed.geometry.coordinates.push([[0.25,0.25],[0.25,0.75],[0.75,0.75],[0.75,0.25],[0.25,0.25]]);
  const other=rect('residual:A:p',0.25,0.25,0.5,0.5),result=await resultOf([100],[0],[100],[holed,other]);expect(result.territories.map(r=>r.population)).toEqual([75,25]);
  const multipart={id:'gb:A:1',geometry:{type:'MultiPolygon',coordinates:[rect('x',0,0,0.2).geometry.coordinates,rect('x',0.8,0,0.2).geometry.coordinates]}};expect((await resultOf([100],[0],[100],[multipart])).meta.generated.total).toBe(100);
});
test('Hamilton apportionment is integer, conservative and uses stable ASCII ID ties',()=>{
  const rows=[{id:'b',weight:1},{id:'a',weight:1},{id:'c',weight:1}];expect(apportion(rows,2)).toEqual([{id:'a',count:1},{id:'b',count:1},{id:'c',count:0}]);expect(apportion(rows.reverse(),2)).toEqual(apportion(rows,2));expect(()=>apportion(rows,1.5)).toThrow();
});
test('urban/rural shares normalize independently of total signal',async()=>{
  const result=await resultOf([100],[2],[6]);expect(result.meta.generated).toMatchObject({total:100,urban:25,rural:75});expect(result.audit.shareMismatchCells).toBe(1);expect(result.audit.anomalyPopulation).toBe(0);
});
for(const layer of ['urban','rural'])test(`zero total with positive ${layer} signal is audited without adding population`,async()=>{
  const urban=[0,layer==='urban'?2:0],rural=[10000,layer==='rural'?2:0],rasters=await inputs([10000,0],urban,rural),result=createBaseline(rasters,features,hierarchy,options);
  expect(result.audit.settlementWithoutTotalCells).toEqual([{index:1,x:1,y:0,urban:urban[1],rural:rural[1],reason:'cleaned total == 0 but urban or rural > 0'}]);
  expect(result.audit.settlementWithoutTotalPopulation).toBe(2);expect(result.audit.anomalyPopulation).toBe(2);expect(result.meta.audit.settlementWithoutTotalCells).toBe(1);expect(result.meta.audit.settlementWithoutTotalPopulation).toBe(2);
  expect(result.meta.generated).toMatchObject({total:10000,urban:0,rural:10000});expect(result.population.cohorts.reduce((n,c)=>n+c.count,0)).toBe(10000);
});
test('significant settlement-without-total anomaly fails default threshold, including an entirely missing total layer',async()=>{
  const allocation=allocate(await inputs([100,0],[0,1],[100,1]),features);expect(allocation.audit.anomalyPct).toBe(2);expect(()=>normalize(allocation,{sanity:false})).toThrow('anomaly');
  const zero=allocate(await inputs([0],[2],[3]),features);expect(zero.audit.settlementWithoutTotalPopulation).toBe(5);expect(zero.audit.anomalyPct).toBe(100);expect(()=>normalize(zero,{sanity:false})).toThrow('anomaly');expect(zero.rows).toEqual([]);
});
test('tiny settlement-without-total anomaly passes only within configured anomaly budget and conserves total signal',async()=>{
  const allocation=allocate(await inputs([10000,0],[0,1],[10000,1]),features);expect(allocation.audit.anomalyPct).toBe(0.02);
  expect(()=>normalize(allocation,{sanity:false,maxAnomalyPct:0.019})).toThrow('anomaly');expect(normalize(allocation,{sanity:false,maxAnomalyPct:0.02}).target).toBe(10000);expect(normalize(allocation,{sanity:false}).target).toBe(10000);
});
test('settlement-without-total records are written to JSONL and summary, including failure audit',async()=>{
  const allocation=allocate(await inputs([100,0],[0,1],[100,2]),features),folder=await temp();
  try{let rejected;try{normalize(allocation,{sanity:false});}catch(error){rejected=error;}expect(rejected).toBeTruthy();await writeAudit(rejected.audit,folder);
    expect(JSON.parse((await fs.readFile(path.join(folder,'settlement-without-total-cells.jsonl'),'utf8')).trim())).toEqual(allocation.audit.settlementWithoutTotalCells[0]);
    const summary=JSON.parse(await fs.readFile(path.join(folder,'summary.json'),'utf8'));expect(summary.settlementWithoutTotalCells).toBe(1);expect(summary.settlementWithoutTotalPopulation).toBe(3);expect(summary.anomalyPopulation).toBe(3);
  }finally{await cleanup(folder);}
});
for(const nodata of [-1,null,NaN])test(`NODATA mismatch ${String(nodata)} rejects before spatial allocation`,async()=>{
  const rasters=await inputs([100]);rasters.urban=await parseAscii(ascii([0]).replace('NODATA_value -9999\n',nodata===null?'':`NODATA_value ${nodata}\n`));
  expect(()=>allocate(rasters,features,{query:()=>{throw Error('Spatial allocation must not run');}})).toThrow('mismatched NODATA');
});
test('matching NODATA semantics pass for numeric sentinel, absent header and NaN sentinel',async()=>{
  for(const nodata of [-9999,null,NaN]){
    const rasters=await inputs([100]);for(const key of ['total','urban','rural'])rasters[key]=await parseAscii(ascii([key==='urban'?0:100]).replace('NODATA_value -9999\n',nodata===null?'':`NODATA_value ${nodata}\n`));
    const allocation=allocate(rasters,features);expect(normalize(allocation,{sanity:false}).target).toBe(100);expect(allocation.audit.nodataCompatibility.value).toEqual(Number.isNaN(nodata)?'NaN':nodata);
  }
});
test('missing settlement signal falls back to rural with audit and configurable anomaly threshold',async()=>{
  const rasters=await inputs([100],[0],[0]),allocation=allocate(rasters,features);expect(allocation.audit.ruralFallbackCells).toHaveLength(1);expect(allocation.audit.anomalyPopulation).toBe(100);expect(()=>normalize(allocation,{sanity:false})).toThrow('anomaly');
  const result=createBaseline(rasters,features,hierarchy,options);expect(result.meta.generated).toMatchObject({urban:0,rural:100});
});
test('negative/NaN values are removed and audited without fractional or negative people',async()=>{
  const rasters=await inputs([100,-3,NaN],[NaN,0,0],[100,0,0]),result=createBaseline(rasters,features,hierarchy,options);expect(result.audit.invalidSourceValues).toHaveLength(3);expect(result.audit.rawSourceTotal).toBe(97);expect(result.meta.generated.total).toBe(100);expect(result.population.cohorts.every(c=>Number.isSafeInteger(c.count)&&c.count>0)).toBe(true);
});
test('nearby zero-overlap fallback is deterministic and limited by resolution',async()=>{
  const result=await resultOf([100],[0],[100],[rect('gb:A:1',1.2,0,0.2)]);expect(result.audit.fallbackCells).toHaveLength(1);expect(result.audit.fallbackPopulation).toBe(100);expect(result.audit.fallbackCells[0].distanceKm).toBeLessThan(result.audit.fallbackCells[0].limitKm);
});
test('nearest fallback tie uses territory ID even when candidate order is reversed',async()=>{
  const parts=[rect('residual:A:p',1.2,0,0.2),rect('gb:A:1',1.2,0,0.2)],rasters=await inputs([100]),index=spatialIndex(parts);const a=allocate(rasters,parts),b=allocate(rasters,parts,{query:box=>index(box).reverse()});expect(a.rows).toEqual(b.rows);expect(a.audit.fallbackCells[0].id).toBe('gb:A:1');
});
test('antimeridian nearest fallback wraps longitude rather than assigning across the world',async()=>{
  const rasters=await inputs([100],[0],[100],{x:179}),parts=[rect('gb:A:1',-180,0,0.2)];const result=createBaseline(rasters,parts,hierarchy,options);expect(result.audit.fallbackCells).toHaveLength(1);expect(result.meta.generated.total).toBe(100);
});
test('far positive cells remain unresolved; tolerated mass is excluded explicitly from chosen target',async()=>{
  const rasters=await inputs([9999,0,0,0,0,1]),allocation=allocate(rasters,features);expect(allocation.audit.unresolvedPopulation).toBe(1);expect(allocation.audit.unresolvedPct).toBe(0.01);const result=createBaseline(rasters,features,hierarchy,options);expect(result.meta.generated.total).toBe(9999);expect(result.meta.audit.normalizedTarget).toBe(9999);expect(result.meta.audit.difference).toBe(0);
  expect(()=>normalize(allocation,{sanity:false,strict:true})).toThrow('unresolved');expect(()=>normalize(allocation,{sanity:false,maxUnresolvedPct:0.001})).toThrow('unresolved');
});
test('large unresolved share fails with attached complete audit; CLI strict flag is explicit',async()=>{
  const rasters=await inputs([100]),allocation=allocate(rasters,[rect('gb:A:1',20,0,1)]);expect(allocation.audit.unresolvedCells).toHaveLength(1);try{normalize(allocation,{sanity:false});throw Error('Expected rejection');}catch(e){expect(e.audit.unresolvedPct).toBe(100);}
  expect(argsOf(['--total','t','--urban','u','--rural','r','--strict']).strict).toBe(true);expect(()=>argsOf(['--total','t'])).toThrow('explicit');expect(()=>argsOf(['--bad'])).toThrow('Invalid option');
});
test('broad sanity guards reject wrong global magnitude and all-urban totals',async()=>{
  const allocation=allocate(await inputs([100]),features);expect(()=>normalize(allocation)).toThrow('global target');
  const result=allocate(await inputs([200000000],[200000000],[0]),features);expect(()=>normalize(result)).toThrow('sanity');expect(()=>normalize(result,{maxUnresolvedPct:-1})).toThrow('Invalid');
});
test('fractional source targets use global rounding and exact integer conservation',async()=>{
  const result=await resultOf([101.7],[2],[3],[rect('gb:A:1',0,0,0.25),rect('residual:A:p',0.25,0,0.75)]);expect(result.meta.generated.total).toBe(102);expect(result.population.cohorts.reduce((n,c)=>n+c.count,0)).toBe(102);expect(result.population.cohorts.every(c=>Number.isSafeInteger(c.count)&&c.count>0)).toBe(true);
});
test('candidate/source polygon order does not change output bytes or stable IDs; collisions reject',async()=>{
  const parts=[rect('gb:A:1',0,0,0.5),rect('residual:A:p',0.5,0,0.5)],rasters=await inputs([101],[20],[80]),a=createBaseline(rasters,parts,hierarchy,options),query=spatialIndex(parts),b=createBaseline(rasters,parts.slice().reverse(),hierarchy,{...options,query:box=>query(box).reverse()});expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  expect(buildCohorts(a.territories.slice().reverse())).toEqual(a.population);expect(()=>buildCohorts(a.territories,()=> '0'.repeat(24))).toThrow('collision');expect(a.population.cohorts.every(c=>c.id.startsWith('p1700-')&&c.birthRateBps===undefined&&c.deathRateBps===undefined&&c.literacyBps===null)).toBe(true);
});
test('nullable literacy is compatible with numeric cohorts, ignores zero-count unknowns and survives saves',async()=>{
  const result=await resultOf([100],[20],[80]);validatePopulationScenario(result.population,hierarchy);const engine=new Simulation({...scenario,population:result.population},hierarchy);expect(engine.populationSummary().literacyBps).toBeNull();engine.step(365);expect(engine.populationSummary().total).toBe(100);const saved=engine.serialize();const loaded=new Simulation(scenario,hierarchy);loaded.load(JSON.parse(saved));expect(loaded.serialize()).toBe(saved);
  const p=initializePopulation(result.population,hierarchy);p.cohorts[0].literacyBps=5000;p.cohorts[1].literacyBps=10000;expect(summarizePopulation(p).literacyBps).toBe(6000);p.cohorts[1].literacyBps=null;expect(summarizePopulation(p).literacyBps).toBeNull();p.cohorts[1].count=0;expect(summarizePopulation(p).literacyBps).toBe(5000);p.cohorts[0].count=0;expect(summarizePopulation(p).literacyBps).toBe(0);
});
test('metadata hashes provenance; repeated publication identical; raw inputs never copied to output',async()=>{
  const result=await resultOf([100],[20],[80]),folder=await temp();try{
    await publishPopulation(result,folder);const before=await fs.readFile(path.join(folder,'population.json'),'utf8');await publishPopulation(result,folder);expect(await fs.readFile(path.join(folder,'population.json'),'utf8')).toBe(before);expect((await fs.readdir(folder)).sort()).toEqual(['population.json','population.meta.json']);
    const meta=JSON.parse(await fs.readFile(path.join(folder,'population.meta.json'),'utf8'));for(const key of ['total','urban','rural'])expect(meta.sourceFiles[key].sha256).toMatch(/^[a-f0-9]{64}$/);expect(meta.geography.sha256).toBe(options.geographyHash);expect(JSON.stringify(meta)).not.toContain(path.resolve('.'));
  }finally{await cleanup(folder);}
});
test('baseline requires complete source/geography provenance',async()=>{
  const rasters=await inputs([100]);expect(()=>createBaseline(rasters,features,hierarchy,{...options,geographyHash:undefined})).toThrow('provenance');delete rasters.urban.sha256;expect(()=>createBaseline(rasters,features,hierarchy,options)).toThrow('provenance');
  expect(()=>argsOf(['--total','t','--urban','u','--rural','r','--max-unresolved-pct','NaN'])).toThrow('Invalid');
});
test('two-asset publication rolls back old bytes on second replacement failure',async()=>{
  const folder=await temp(),result=await resultOf([100],[20],[80]),rename=fs.rename;
  try{
    await publishPopulation(result,folder);const names=['population.json','population.meta.json'],before=await Promise.all(names.map(n=>fs.readFile(path.join(folder,n),'utf8'))),next=await resultOf([200],[50],[150]);let failed=false;
    fs.rename=async(from,to)=>{if(!failed&&from.endsWith('.tmp')&&to===path.join(folder,'population.meta.json')){failed=true;throw Object.assign(Error('Injected I/O failure'),{code:'EIO'});}return rename(from,to);};
    await expect(publishPopulation(next,folder)).rejects.toThrow('Injected');expect(await Promise.all(names.map(n=>fs.readFile(path.join(folder,n),'utf8')))).toEqual(before);expect((await fs.readdir(folder)).sort()).toEqual(names);
  }finally{fs.rename=rename;await cleanup(folder);}
});
test('missing real input CLI fails clearly without creating or modifying 1700 population assets',async()=>{
  const targets=['population.json','population.meta.json'],before=await Promise.all(targets.map(n=>fs.readFile(`scenarios/1700/${n}`).catch(e=>{if(e.code==='ENOENT')return null;throw e;})));
  try{execFileSync(process.execPath,['scripts/import-population-1700.cjs','--total','data/source/population/hyde32/missing-test-total.asc','--urban','data/source/population/hyde32/missing-test-urban.asc','--rural','data/source/population/hyde32/missing-test-rural.asc'],{stdio:'pipe'});throw Error('Expected failure');}catch(e){expect(String(e.stderr)).toContain('Expected inputs:');expect(String(e.stderr)).toContain('no population output');}
  expect(await Promise.all(targets.map(n=>fs.readFile(`scenarios/1700/${n}`).catch(e=>{if(e.code==='ENOENT')return null;throw e;})))).toEqual(before);
});
test('baseline-sized saves above former 16 MiB limit preserve generated cohorts exactly',async({request})=>{
  const id=`baselinesize-${Date.now()}`,saveRoot=path.resolve('saves'),folder=path.join(saveRoot,id),data=await(await request.get('/api/scenarios/1700')).json(),h=JSON.parse(await fs.readFile('client/data/adm2/hierarchy.json','utf8'));
  const result=createBaseline(await inputs([100],[20],[80]),[rect(h.territories[0].id,0,0,1)],h,options),engine=new Simulation({...data,population:result.population},h),state=engine.snapshot();
  // Tiny synthetic raster stays tiny; JSON padding models payload volume only.
  state.systems.baselineVolumeProbe={padding:'x'.repeat(17*1024*1024)};const save=makeSave(state);
  try{expect((await request.put(`/api/saves/${id}`,{data:save})).status()).toBe(200);const response=await request.get(`/api/saves/${id}`);expect(response.status()).toBe(200);const loaded=await response.json();expect(loaded.state.systems.population).toEqual(state.systems.population);expect(digest(JSON.stringify(loaded))).toBe(digest(JSON.stringify(save)));}
  finally{if(path.dirname(folder)!==saveRoot||!/^baselinesize-\d+$/.test(path.basename(folder)))throw Error('Unsafe cleanup');await fs.rm(folder,{recursive:true,force:true});}
});
test('game loads generated fixture, save/load is exact, ownership does not move cohorts, editor preserves both authored assets',async({request,page})=>{
  const id=`baselinefixture-${Date.now()}`,scenarioRoot=path.resolve('scenarios'),folder=path.join(scenarioRoot,id),saveRoot=path.resolve('saves'),saveFolder=path.join(saveRoot,id),errors=[];
  const data=await(await request.get('/api/scenarios/1700')).json(),real=JSON.parse(await fs.readFile('client/data/adm2/hierarchy.json','utf8'));data.scenario.id=id;
  const parts=[rect(real.territories[0].id,0,0,1)],result=createBaseline(await inputs([100],[20],[80]),parts,real,options);const realFiles=['scenario','countries','ownership'].map(n=>`scenarios/1700/${n}.json`),hashes=()=>Promise.all(realFiles.map(async f=>digest(await fs.readFile(f)))),before=await hashes();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    expect((await request.put(`/api/scenarios/${id}`,{data})).status()).toBe(200);await publishPopulation(result,folder);const assets=await Promise.all(['population.json','population.meta.json'].map(n=>fs.readFile(path.join(folder,n),'utf8')));
    await page.goto(`/?scenario=${id}`);await page.waitForFunction(()=>window.mandateSimulation);expect(await page.evaluate(()=>mandateSimulation.populationSummary())).toMatchObject({total:100,urban:20,rural:80,literacyBps:null});
    const population=await page.evaluate(()=>JSON.stringify(mandateSimulation.snapshot().systems.population));expect(await page.evaluate(id=>mandateSimulation.submit({type:'SetOwnership',ids:[id],owner:null}).ok,real.territories[0].id)).toBe(true);expect(await page.evaluate(()=>JSON.stringify(mandateSimulation.snapshot().systems.population))).toBe(population);
    const state=await page.evaluate(()=>mandateSimulation.serialize());await page.locator('#game-save-id').fill(id);await page.locator('#game-save').click();await expect(page.locator('#game-status')).toContainText(id);await page.reload();await page.waitForFunction(()=>window.mandateSimulation);await page.locator('#game-saves').selectOption(id);await page.locator('#game-load').click();await expect(page.locator('#game-status')).toContainText(id);expect(await page.evaluate(()=>mandateSimulation.serialize())).toBe(state);
    await page.goto(`/?editor=1&scenario=${id}`);await page.waitForFunction(()=>window.mandateEditor);expect((await request.put(`/api/scenarios/${id}`,{data:{...data,population:{bad:true},'population.meta':{bad:true}}})).status()).toBe(200);expect(await Promise.all(['population.json','population.meta.json'].map(n=>fs.readFile(path.join(folder,n),'utf8')))).toEqual(assets);expect(await hashes()).toEqual(before);expect(errors).toEqual([]);
  }finally{for(const [target,parent]of [[folder,scenarioRoot],[saveFolder,saveRoot]]){if(path.dirname(target)!==parent||!/^baselinefixture-\d+$/.test(path.basename(target)))throw Error('Unsafe cleanup');await fs.rm(target,{recursive:true,force:true});}}
});
