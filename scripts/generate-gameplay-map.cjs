// Independent geometry authoring preview; never mutates atomic/scenario data.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {parseArgs}=require('node:util');
const mapshaper=require('mapshaper');
const {feature}=require('topojson-client');
const {polygons,area}=require('./adm2-spatial.cjs');
const {packTopology,unpackTopology}=require('./topology-codec.cjs');
const {DEFAULTS,componentsFromMask,allocateBudgets,partitionComponent,planarCentroid}=require('./gameplay-partition.cjs');
const {populationTotals,densityField,atomicOverlay}=require('./gameplay-overlay.cjs');
const {sharedTopology,regroup,topologyMetadata}=require('./gameplay-topology.cjs');
const {auditGeometry}=require('./gameplay-qa.cjs');
const {simplifyShared,DEFAULTS:LEGACY_DEFAULTS}=require('./gameplay-provinces.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const SOURCE='data/map/countries/ne_10m_admin_0_countries.shp';
const ATOMIC='data/processed/canonical/atomic.topo.json';
const POPULATION='data/population/baselines/1700/population.json';
function maskPolygons(json){return (json.geometries||json.features.map(f=>f.geometry)).flatMap(polygons);}
async function landMask(directory){
  await fs.mkdir(directory,{recursive:true});const file=path.join(directory,'source-land.geojson').replaceAll('\\','/');
  await mapshaper.runCommands(`-i ${SOURCE} name=land -dissolve2 gap-fill-area=0 sliver-control=0 -o ${JSON.stringify(file)} format=geojson`);
  return maskPolygons(JSON.parse(await fs.readFile(file,'utf8')));
}
function validateConfig(config){
  for(const [key,value]of Object.entries(config))if(!Object.hasOwn(DEFAULTS,key)||typeof value!=='number'||!Number.isFinite(value)||value<0)throw new Error(`Invalid numeric config: ${key}`);
  if(!Number.isInteger(config.targetProvinceCount)||config.targetProvinceCount<1||!config.samplingStep||!config.tileSize||!config.densityReference||config.densityClamp<1||!Number.isInteger(config.relaxationIterations))throw new Error('Invalid partition configuration');
  if(!config.densityGridDegrees||config.densityFloor>config.densityClamp||!Number.isInteger(config.densitySmoothingRadius)||!Number.isInteger(config.skinnyRepairPasses)||['relaxationStrength','relaxationDecay','relaxationAnchor','seedJitter','countTolerance'].some(key=>config[key]>1))throw new Error('Invalid tuning bounds');
}
async function generate(config=DEFAULTS,out='client/data/map-v2',log=console.log,resume=false){
  validateConfig(config);const start=performance.now(),stages={};let last=start;const stage=name=>{stages[name]=Math.round(performance.now()-last);last=performance.now();};
  const [source,popbytes,baseline]=await Promise.all([fs.readFile(ATOMIC),fs.readFile(POPULATION),fs.readFile('data/population/baselines/1700/population.meta.json','utf8').then(JSON.parse)]);
  if(baseline.geography.sha256!==sha(source))throw new Error('Population baseline/canonical geography hash mismatch');
  const atomic=JSON.parse(source),atoms=feature(atomic,atomic.objects.territories).features.sort((a,b)=>a.id<b.id?-1:1),totals=populationTotals(JSON.parse(popbytes));
  const atomIds=new Set(atoms.map(f=>f.id));for(const id of totals.keys())if(!atomIds.has(id))throw new Error(`Unknown population atom: ${id}`);stage('load');
  log('Dissolving original Natural Earth Admin0 into canonical land mask');const mask=await landMask(out);stage('landMask');
  const cacheKey=sha(JSON.stringify({config,atomic:sha(source),population:sha(popbytes),mask:sha(JSON.stringify(mask))}));
  const cacheDirectory='data/generated/map-v2-partitions',cacheFile=path.join(cacheDirectory,`${cacheKey}.json`);
  await fs.mkdir(cacheDirectory,{recursive:true});
  let components,parts;
  if(resume){const cached=JSON.parse(await fs.readFile(cacheFile,'utf8'));if(cached.key!==cacheKey)throw new Error('Partition cache does not match config/source hashes');components=cached.components;parts=cached.parts;log('Resuming verified independent partition cache');}
  else {components=componentsFromMask(mask,densityField(atoms,totals,config),config);allocateBudgets(components,config.targetProvinceCount,config);}
  stage('sampling');
  log(`Independent partition: ${components.length} land components, ${components.filter(c=>c.budget).length} seeded components`);
  if(!parts){parts=[];for(let i=0;i<components.length;i++){const c=components[i];if(c.budget)parts.push(...partitionComponent(c,config));else parts.push({id:`${c.id}:island`,seedId:null,componentId:c.id,seed:planarCentroid(c.polygon),geometry:{type:'Polygon',coordinates:c.polygon}});if((i+1)%500===0)log(`Partition ${i+1}/${components.length}`);}
    await fs.writeFile(cacheFile,JSON.stringify({key:cacheKey,components:components.map(({samples,...c})=>c),parts}));}
  stage('partition');
  log(`Building shared topology for ${parts.length} clipped pieces`);const shared=await sharedTopology(parts,mask,config);const result=regroup(shared,parts,components,config);stage('topology');
  // Optional shared-arc simplification in spherical distance units (meters).
  // Default zero keeps the already straight Voronoi boundaries unchanged.
  if(config.simplificationTolerance>0)result.cleanup.simplification=simplifyShared(result.topology,{...LEGACY_DEFAULTS,internalRetain:1,simplificationTolerance:config.simplificationTolerance});
  const metadata=topologyMetadata(result.topology,result.metadata,config),features=feature(result.topology,result.topology.objects.provinces).features;
  const overlay=atomicOverlay(atoms,features,totals,log);stage('overlay');
  const records=metadata.records.map(r=>{const s=overlay.sums.get(r.id);return {...r,...s,density:s.population/r.areaKm2};});
  const qa={schema:'mandate-independent-gameplay-preview-v2',...auditGeometry(result.topology,records,mask,config,log),...overlay.qa,cleanup:result.cleanup};stage('qa');
  qa.populationConservationDifference=qa.populationOutputTotal-qa.populationInputTotal;
  if(qa.populationConservationDifference)qa.structuralFailures.push({name:'populationConservationDifference',value:qa.populationConservationDifference,limit:0});
  if(Math.abs(qa.provinceCount-config.targetProvinceCount)>config.targetProvinceCount*config.countTolerance)qa.structuralFailures.push({name:'provinceCount',value:qa.provinceCount,target:config.targetProvinceCount,tolerance:config.countTolerance});
  qa.provenance={landMaskSource:SOURCE,atomicSource:ATOMIC,populationSource:POPULATION,atomicSha256:sha(source),populationSha256:sha(popbytes),landMaskSha256:sha(JSON.stringify(mask)),mappingSha256:sha(JSON.stringify(overlay.mapping)),config};
  const files={mapping:overlay.mapping,provinces:records,maritime:result.maritime,components:components.map(({samples,polygon,...c})=>c),'provinces.topo':packTopology(result.topology),qa};
  for(const [name,data]of Object.entries(files))await fs.writeFile(path.join(out,`${name}.json`),JSON.stringify(data));
  const timing={runtimeSeconds:(performance.now()-start)/1000,stagesMs:stages};await fs.writeFile(path.join(out,'timing.json'),JSON.stringify(timing));
  log(JSON.stringify({provinces:qa.provinceCount,target:config.targetProvinceCount,gapArea:qa.gapArea,overlapArea:qa.overlapArea,oceanArea:qa.oceanArea,invalid:qa.invalidProvinceCount,disconnected:qa.disconnectedProvinceCount,sharedErrors:qa.sharedTopologyErrors.length,intersections:qa.segmentIntersections,populationDifference:qa.populationConservationDifference,uncoveredAtoms:qa.uncoveredAtoms.length,runtimeSeconds:timing.runtimeSeconds,failures:qa.structuralFailures}));
  return {qa,timing};
}
async function auditExisting(out){
  const [topology,records,source,stored]=await Promise.all(['provinces.topo.json','provinces.json','source-land.geojson','qa.json'].map(name=>fs.readFile(path.join(out,name),'utf8').then(JSON.parse)));
  const config=stored.provenance.config,qa=auditGeometry(unpackTopology(topology),records,maskPolygons(source),config);
  const mapping=JSON.parse(await fs.readFile(path.join(out,'mapping.json'),'utf8'));let input=0,output=0;const [pbytes,abytes]=await Promise.all([fs.readFile(POPULATION),fs.readFile(ATOMIC)]),population=populationTotals(JSON.parse(pbytes));
  if(sha(pbytes)!==stored.provenance.populationSha256||sha(abytes)!==stored.provenance.atomicSha256||sha(JSON.stringify(maskPolygons(source)))!==stored.provenance.landMaskSha256||sha(JSON.stringify(mapping))!==stored.provenance.mappingSha256)qa.structuralFailures.push({name:'sourceOrMappingHashMismatch'});
  const expectedIds=new Set(JSON.parse(abytes).objects.territories.geometries.map(g=>g.id)),allocated=new Map(records.map(r=>[r.id,0]));
  for(const [id,m]of Object.entries(mapping)){if(!expectedIds.delete(id))qa.structuralFailures.push({name:'unknownOrDuplicateAtom',atomId:id});input+=population.get(id)||0;const total=m.intersections.reduce((s,r)=>s+r.population,0);output+=total;if(total!==(population.get(id)||0))qa.structuralFailures.push({name:'atomPopulationMismatch',atomId:id});
    for(const r of m.intersections){if(!allocated.has(r.provinceId)||!Number.isSafeInteger(r.population)||r.population<0||!Number.isFinite(r.overlapAreaKm2)||r.overlapAreaKm2<0||!Number.isFinite(r.allocationFraction)||r.allocationFraction<0)qa.structuralFailures.push({name:'invalidOverlayRow',atomId:id});else allocated.set(r.provinceId,allocated.get(r.provinceId)+r.population);}}
  if(expectedIds.size)qa.structuralFailures.push({name:'unassignedAtoms',count:expectedIds.size});
  for(const r of records)if(allocated.get(r.id)!==r.population)qa.structuralFailures.push({name:'provincePopulationMismatch',provinceId:r.id});
  qa.populationInputTotal=input;qa.populationOutputTotal=output;qa.populationConservationDifference=output-input;
  if(Object.keys(mapping).length!==stored.atomCount||output!==records.reduce((s,r)=>s+r.population,0))qa.structuralFailures.push({name:'mappingCoverageOrPopulationMismatch'});
  if(Math.abs(qa.provinceCount-config.targetProvinceCount)>config.targetProvinceCount*config.countTolerance)qa.structuralFailures.push({name:'provinceCountOutsideConfiguredTolerance'});
  await fs.writeFile(path.join(out,'qa-recheck.json'),JSON.stringify(qa));return qa;
}
async function main(){const {values}=parseArgs({options:{target:{type:'string'},config:{type:'string'},out:{type:'string'},qa:{type:'boolean'},help:{type:'boolean'},'resume-partition':{type:'boolean'}}});
  if(values.help){console.log('node scripts/generate-gameplay-map.cjs [--target 5000] [--config config.json] [--out directory] [--qa] [--resume-partition]\n--qa independently rechecks existing geometry, hashes and per-atom/province population allocations; writes qa-recheck.json.\n--resume-partition verifies config/source hashes before reusing the offline partition cache.\nDefault output: client/data/map-v2. Atomic/scenario files are read-only.');return;}
  const out=values.out||'client/data/map-v2';if(values.qa){const qa=await auditExisting(out);console.log(JSON.stringify({provinceCount:qa.provinceCount,gaps:qa.gapArea,overlaps:qa.overlapArea,failures:qa.structuralFailures}));if(qa.structuralFailures.length)process.exitCode=1;return;}
  const config={...DEFAULTS,...(values.config?JSON.parse(await fs.readFile(values.config,'utf8')):{})};if(values.target)config.targetProvinceCount=Number(values.target);const {qa}=await generate(config,out,console.log,values['resume-partition']);if(qa.structuralFailures.length)process.exitCode=1;
}
module.exports={generate,auditExisting,landMask,maskPolygons,validateConfig};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
