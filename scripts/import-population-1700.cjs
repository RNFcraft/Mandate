const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {feature}=require('topojson-client');
const {readAscii}=require('./population-raster.cjs');
const {createBaseline,compare,SOURCE}=require('./population-baseline.cjs');
const {allocateParallel,defaultWorkers}=require('./population-parallel.cjs');
const ROOT=path.resolve(__dirname,'..');
const GEOMETRY=path.join(ROOT,'data/processed/canonical/atomic.topo.json');
const HIERARCHY=path.join(ROOT,'client/data/adm2/hierarchy.json');
const USAGE='node scripts/import-population-1700.cjs --total data/source/population/hyde32/<total-1700-file.asc> --urban data/source/population/hyde32/<urban-1700-file.asc> --rural data/source/population/hyde32/<rural-1700-file.asc> [--workers N (1..16)] [--strict] [--max-unresolved-pct 0.05] [--max-anomaly-pct 0.05]';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
function validateHydeGrid(grid){
  // Absolute tolerance in degrees accepts HYDE's rounded 0.0833333 header.
  // Validation does not snap cellsize: allocation uses the parsed value.
  const cellsizeTolerance=1e-6;
  if(grid.ncols!==4320||grid.nrows!==2160||Math.abs(grid.cellsize-1/12)>cellsizeTolerance||Math.abs(grid.x+180)>1e-5||Math.abs(grid.y+90)>1e-5)throw Error('Expected global HYDE 3.2 5 arc-minute grid (4320 x 2160, origin -180/-90), people per cell; check inputs');
}
function argsOf(argv){
  const options={};for(let i=0;i<argv.length;i++){
    const key=argv[i];if(key==='--strict'){options.strict=true;continue;}if(key==='--help'){options.help=true;continue;}
    if(!['--workers','--total','--urban','--rural','--max-unresolved-pct','--max-anomaly-pct','--output','--audit'].includes(key)||i+1===argv.length||argv[i+1].startsWith('--'))throw Error(`Invalid option ${key}\n${USAGE}`);
    const name={'--max-unresolved-pct':'maxUnresolvedPct','--max-anomaly-pct':'maxAnomalyPct'}[key]||key.slice(2);if(Object.hasOwn(options,name))throw Error(`Duplicate option ${key}`);options[name]=(name.endsWith('Pct')||name==='workers')?Number(argv[++i]):argv[++i];
  }
  if(!options.help&&['total','urban','rural'].some(k=>!options[k]))throw Error(`Expected explicit total, urban and rural HYDE 1700 people-per-cell input paths.\n${USAGE}`);
  for(const key of ['maxUnresolvedPct','maxAnomalyPct'])if(Object.hasOwn(options,key)&&(!Number.isFinite(options[key])||options[key]<0||options[key]>100))throw Error(`Invalid ${key}: expected 0..100 percent`);
  options.workers??=defaultWorkers();
  if(!Number.isInteger(options.workers)||options.workers<1||options.workers>16)throw Error('Invalid workers: expected integer 1..16');
  return options;
}
async function loadGeography(){
  let bytes,hBytes,report;
  try{[bytes,hBytes,report]=await Promise.all([fs.readFile(GEOMETRY),fs.readFile(HIERARCHY),fs.readFile(path.join(ROOT,'data/processed/canonical/invariants.json'),'utf8').then(JSON.parse)]);}
  catch(error){throw Error(`Exact canonical atomic geography is unavailable: ${error.message}. No substitute geometry will be used.`);}
  const topology=JSON.parse(bytes),hierarchy=JSON.parse(hBytes),geographyHash=hash(bytes);
  if(hierarchy.id!=='mandate-atomic-v1'||!topology.objects?.territories||report.topologySha256!==hash(JSON.stringify(topology))||report.significantOverlapCount!==0||report.overlapFaceCount!==0||report.intersectionErrors?.length||report.coverage?.significantUncoveredParts!==0)throw Error('Canonical geometry does not match successful mesh invariant report');
  const features=feature(topology,topology.objects.territories).features,ids=new Set(features.map(f=>f.id)),expected=new Set(hierarchy.territories.map(t=>t.id));
  if(ids.size!==features.length||ids.size!==expected.size||[...expected].some(id=>!ids.has(id)))throw Error('Canonical polygon IDs do not match hierarchy');
  return {features,hierarchy,geographyHash,hierarchyHash:hash(hBytes)};
}
function workspaceFolder(folder){const resolved=path.resolve(folder);if(!resolved.startsWith(ROOT+path.sep)||resolved===ROOT)throw Error('Output must be a folder inside the game repository');return resolved;}
// Two-file publication with rollback on normal I/O failure. Temporary/backup files
// stay in the destination directory; no scenario folder or raw file is replaced.
async function publishPopulation(result,folder){
  if(path.resolve(folder)===path.resolve('scenarios/1700')&&result.population.cohorts.some(c=>!c.territoryId.startsWith('province:')))result=await require('./province-publication.cjs').compilePopulationResult(result);
  folder=workspaceFolder(folder);await fs.mkdir(folder,{recursive:true});const token=randomUUID(),files=[];
  try{
    for(const [name,value]of [['population.json',result.population],['population.meta.json',result.meta]]){
      const target=path.join(folder,name),temp=path.join(folder,`.${name}-${token}.tmp`),backup=path.join(folder,`.${name}-${token}.bak`),row={target,temp,backup,backed:false,published:false};files.push(row);
      const file=await fs.open(temp,'wx');try{await file.writeFile(json(value));await file.sync();}finally{await file.close();}
    }
    for(const row of files){try{await fs.rename(row.target,row.backup);row.backed=true;}catch(e){if(e.code!=='ENOENT')throw e;}await fs.rename(row.temp,row.target);row.published=true;}
  }catch(error){
    for(const row of files.slice().reverse()){if(row.published)await fs.unlink(row.target);if(row.backed){await fs.rename(row.backup,row.target);row.backed=false;}}
    throw error;
  }finally{
    for(const row of files){await fs.unlink(row.temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  }
  for(const row of files)if(row.backed)await fs.unlink(row.backup);
}
async function writeAudit(audit,folder){
  folder=workspaceFolder(folder);await fs.mkdir(folder,{recursive:true});
  const lists={fallbackCells:'fallback-cells',unresolvedCells:'unresolved-cells',ruralFallbackCells:'rural-fallback-cells',settlementWithoutTotalCells:'settlement-without-total-cells',invalidSourceValues:'invalid-source-values'};
  for(const [key,name]of Object.entries(lists)){
    const file=await fs.open(path.join(folder,name+'.jsonl'),'w');try{for(const row of audit[key])await file.write(JSON.stringify(row)+'\n');}finally{await file.close();}
  }
  await fs.writeFile(path.join(folder,'summary.json'),json({...Object.fromEntries(Object.entries(audit).filter(([key])=>!Object.hasOwn(lists,key))),...Object.fromEntries(Object.keys(lists).map(k=>[k,audit[k].length]))}));
}
const REGIONS=[['Europe',[-12,35,45,72]],['India',[68,5,90,36]],['China',[90,18,135,54]],['Japan',[128,28,147,47]],['North America',[-170,8,-50,80]],['South America',[-85,-57,-32,13]],['Africa',[-20,-35,55,37]],['Siberia / Central Asia',[45,36,180,78]]];
async function writeDerived(result,folder,features,ownership){
  const countries=new Map();for(const row of result.territories){const owner=ownership[row.territoryId]??null;countries.set(owner,(countries.get(owner)||0)+row.population);}
  const countryRows=[...countries].map(([countryId,population])=>({countryId,population})).sort((a,b)=>b.population-a.population||compare(a.countryId||'',b.countryId||''));
  const {bounds,area,polygons}=require('./adm2-spatial.cjs'),byId=new Map(features.map(f=>[f.id,f]));
  const regions=REGIONS.map(([name,b])=>{let population=0,urban=0,rural=0;for(const row of result.territories){const extent=bounds(byId.get(row.territoryId).geometry),x=(extent[0]+extent[2])/2,y=(extent[1]+extent[3])/2;if(x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3]){population+=row.population;urban+=row.urban;rural+=row.rural;}}return {name,bounds:b,population,urban,rural};});
  // Enrich copies for diagnostics only; authoritative territory values remain untouched.
  const {auditCentroid}=require('./population-audit-centroid.cjs');
  const auditRows=result.territories.map(row=>{
    const areaKm2=area(polygons(byId.get(row.territoryId).geometry));
    if(!Number.isFinite(areaKm2)||areaKm2<=0)throw Error(`Invalid canonical audit area: ${row.territoryId}`);
    return {...row,areaKm2,populationDensityPerKm2:row.population/areaKm2,centroid:auditCentroid(byId.get(row.territoryId).geometry)};
  });
  await fs.writeFile(path.join(folder,'territories.json'),json(result.territories));
  await fs.writeFile(path.join(folder,'largest-territories.json'),json(auditRows.slice().sort((a,b)=>b.population-a.population||compare(a.territoryId,b.territoryId)).slice(0,100)));
  await fs.writeFile(path.join(folder,'highest-density-territories.json'),json(auditRows.filter(row=>row.population>0).sort((a,b)=>b.populationDensityPerKm2-a.populationDensityPerKm2||compare(a.territoryId,b.territoryId)).slice(0,100)));
  await fs.writeFile(path.join(folder,'country-summary.json'),json(countryRows));await fs.writeFile(path.join(folder,'region-examples.json'),json({method:'nonexclusive geographic boxes; territory bbox midpoint membership; diagnostic only',regions}));
  return {topCountries:countryRows.slice(0,20),regionExamples:regions};
}
async function main(argv){
  const options=argsOf(argv);if(options.help){console.log(USAGE);return;}
  const paths=Object.fromEntries(['total','urban','rural'].map(k=>[k,path.resolve(options[k])])),missing=[];
  for(const [key,file]of Object.entries(paths))try{await fs.access(file);}catch{missing.push(`${key}: ${file}`);}
  if(missing.length)throw Error(`HYDE source files unavailable; no population output created.\nExpected inputs:\n${Object.entries(paths).map(([key,file])=>`${key}: ${file}`).join('\n')}\nMissing:\n${missing.join('\n')}`);
  const output=workspaceFolder(options.output||path.join(ROOT,'scenarios/1700')),auditFolder=workspaceFolder(options.audit||path.join(ROOT,'data/generated/population/1700'));
  if(output===auditFolder||auditFolder.startsWith(output+path.sep)||output.startsWith(auditFolder+path.sep))throw Error('Scenario output and audit folders must be separate');
  const started=process.hrtime.bigint(),rasters={};console.log('SOURCE: reading explicit people-per-cell ASCII inputs');
  for(const key of ['total','urban','rural'])rasters[key]=await readAscii(paths[key]);
  validateHydeGrid(rasters.total);
  const scenario=JSON.parse(await fs.readFile(path.join(ROOT,'scenarios/1700/scenario.json'),'utf8'));
  if(scenario.id!=='1700'||scenario.year!==1700||!['mandate-atomic-v1','mandate-provinces-v1'].includes(scenario.geography))throw Error('Scenario 1700 metadata does not match baseline target');
  console.log('SPATIAL: loading exact canonical atomic polygons');const geography=await loadGeography();
  let result;
  try{const spatial=await allocateParallel(rasters,{workers:options.workers,geographyHash:geography.geographyHash,hierarchyHash:geography.hierarchyHash,onProgress:p=>console.log(p.text)});result=createBaseline(rasters,geography.features,geography.hierarchy,{...options,...geography,allocation:spatial.allocation});result.performance=spatial.performance;}
  catch(error){
    if(error.audit){
      await writeAudit(error.audit,auditFolder);
      const summary=JSON.parse(await fs.readFile(path.join(auditFolder,'summary.json'),'utf8'));
      const report={status:'failed',reason:error.message,...summary,source:SOURCE,sourceFiles:Object.fromEntries(['total','urban','rural'].map(key=>[key,{sha256:rasters[key].sha256}]))};
      await fs.writeFile(path.join(auditFolder,'summary.json'),json(report));console.error(json(report));
    }
    throw error;
  }
  await writeAudit(result.audit,auditFolder);const derived=await writeDerived(result,auditFolder,geography.features,JSON.parse(await fs.readFile(path.join(ROOT,'scenarios/1700/ownership.json'),'utf8')));
  await publishPopulation(result,output);const report={...result.meta,performance:{...result.performance,totalWallSeconds:Number(process.hrtime.bigint()-started)/1e9,peakRssMiB:Math.max(result.performance.peakRssMiB,process.memoryUsage().rss/1048576,process.resourceUsage().maxRSS/1024),populationJsonBytes:Buffer.byteLength(json(result.population))},...derived};await fs.writeFile(path.join(auditFolder,'summary.json'),json(report));console.log(json(report));
}
module.exports={argsOf,validateHydeGrid,loadGeography,publishPopulation,writeAudit,writeDerived,USAGE};
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
