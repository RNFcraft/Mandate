const fs=require('node:fs/promises'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const {parseStrictJson}=require('./strict-json.cjs');
const {authorWorld}=require('./mandate-world-authoring.cjs');
const {auditWorld}=require('./mandate-world-audit.cjs');
const {validatePoliticalGeography,validateRelations,compare}=require('../shared/political-geography.cjs');
const ROOT=path.resolve(__dirname,'..'),SCENARIO=path.join(ROOT,'scenarios/1700'),AUDIT=path.join(ROOT,'data/generated/political-geography/1700/mandate-world-v1');
const FROZEN=['data/processed/canonical/atomic.topo.json','client/data/adm2/hierarchy.json','scenarios/1700/population.json','scenarios/1700/population.meta.json','scenarios/1700/population-composition.json','scripts/population-composition.cjs','scripts/population-baseline.cjs','shared/population.cjs'];
const hash=b=>createHash('sha256').update(b).digest('hex'),json=v=>JSON.stringify(v,null,2)+'\n';
function argsOf(argv){const o={};for(let i=0;i<argv.length;i++){const flag=argv[i];if(flag==='--publish'){if(o.publish)throw Error('Duplicate publish');o.publish=true;}else if(['--authoring','--audit','--scenario-dir'].includes(flag)&&argv[i+1]&&!argv[i+1].startsWith('--')){const k={'--authoring':'authoring','--audit':'audit','--scenario-dir':'scenarioDir'}[flag];if(o[k])throw Error('Duplicate option');o[k]=argv[++i];}else throw Error(`Invalid option ${flag}`);}return o;}
const local=file=>{const p=path.resolve(file);if(!p.startsWith(ROOT+path.sep))throw Error('World authoring paths must remain inside the game workspace');return p;};
async function publishWorld(result,config,folder){
  folder=local(folder);const parent=path.dirname(folder),stage=path.join(parent,`.world-stage-${randomUUID()}`),backup=path.join(parent,`.world-backup-${randomUUID()}`);let backed=false,published=false;
  try{
    await fs.cp(folder,stage,{recursive:true,errorOnExist:true,force:false});
    const files={'polities.json':config.polities.slice().sort((a,b)=>compare(a.id,b.id)),'polity-relations.json':{version:1,relations:validateRelations(config.relationships,config.polities)},'political-geography.json':{...result.asset,status:'published'},'political-geography-overrides.json':{version:1,overrides:result.asset.provenance.manualOverrides},...(result.runtime?Object.fromEntries(Object.entries(result.runtime).map(([key,value])=>[key+'.json',value])):{})};
    if(result.provinceSummary)files['political-province-qa.json']={...result.provinceSummary,published:true};
    for(const [name,value]of Object.entries(files)){const file=await fs.open(path.join(stage,name),'w');try{await file.writeFile(json(value));await file.sync();}finally{await file.close();}}
    if(result.runtime){const hierarchy=JSON.parse(await fs.readFile(path.join(ROOT,'client/data/map-v2/hierarchy.json')));require('../shared/scenario.cjs').validateScenario(result.runtime,new Set(hierarchy.territories.map(t=>t.id)));validatePoliticalGeography(files['political-geography.json'],files['polities.json'],files['polity-relations.json'],hierarchy);for(const name of ['population.json','population.meta.json','population-composition.json'])if(hash(await fs.readFile(path.join(folder,name)))!==hash(await fs.readFile(path.join(stage,name))))throw Error('Staged population assets changed');}
    await fs.rename(folder,backup);backed=true;try{await fs.rename(stage,folder);published=true;}catch(e){await fs.rename(backup,folder);backed=false;throw e;}
  }finally{
    for(const target of [stage,...(published&&backed?[backup]:[])]){if(path.dirname(target)!==parent||!/^\.world-(stage|backup)-/.test(path.basename(target)))throw Error('Unsafe world stage cleanup');await fs.rm(target,{recursive:true,force:true});}
  }
}
async function generateWorld(options={},context){
  const scenarioDir=local(options.scenarioDir||SCENARIO),authoringFile=local(options.authoring||path.join(scenarioDir,'political-geography-authoring.json')),auditDir=local(options.audit||AUDIT);
  if(context&&scenarioDir===SCENARIO)throw Error('Synthetic context cannot target production scenario');
  if(!auditDir.startsWith(path.join(ROOT,'data/generated')+path.sep)&&!auditDir.startsWith(path.join(ROOT,'tmp')+path.sep))throw Error('World audit must be ignored output');
  if(authoringFile.startsWith(auditDir+path.sep)||auditDir===scenarioDir||auditDir.startsWith(scenarioDir+path.sep))throw Error('Audit cannot overwrite authored assets');
  if(options.publish&&authoringFile!==path.join(scenarioDir,'political-geography-authoring.json'))throw Error('Publication requires scenario-local authoring');
  const protectedFiles=context?.protectedFiles||[...FROZEN,...(await fs.readdir(path.join(ROOT,'client/data/map-v2'))).map(name=>'client/data/map-v2/'+name),'data/population/baselines/1700/population.json'].map(file=>path.join(ROOT,file)),before=Object.fromEntries(await Promise.all(protectedFiles.map(async file=>[file,hash(await fs.readFile(file))])));
  if(!context)before[path.join(scenarioDir,'province-political-authoring.json')]=hash(await fs.readFile(path.join(scenarioDir,'province-political-authoring.json')));
  const authoredBytes=await fs.readFile(authoringFile),config=parseStrictJson(authoredBytes),geography=context?.geography||await require('./import-population-1700.cjs').loadGeography();
  const topology=context?.topology||JSON.parse(await fs.readFile(path.join(ROOT,'data/processed/canonical/atomic.topo.json')));
  const baselineBytes=context?Buffer.from(json(context.baseline)):await fs.readFile(path.join(ROOT,'data/population/baselines/1700/population.json')),baseline=context?.baseline||JSON.parse(baselineBytes);
  if(!context){const manifest=parseStrictJson(await fs.readFile(path.join(ROOT,'data/population/baselines/1700/manifest.json')));if(manifest.populationSha256!==hash(baselineBytes)||manifest.geographySha256!==geography.geographyHash||manifest.hierarchySha256!==geography.hierarchyHash)throw Error('Frozen baseline/geography manifest mismatch');}
  const result=authorWorld(config,{...geography,baseline,provenance:{authoringSha256:hash(authoredBytes),canonicalSha256:geography.geographyHash,hierarchySha256:geography.hierarchyHash,populationBaselineSha256:hash(baselineBytes),source:'Independent authored Mandate gameplay decisions; no historical-basemaps data imported'}});
  const audit=auditWorld(result,config,topology,geography.hierarchy);
  validatePoliticalGeography(result.asset,config.polities,config.relationships,geography.hierarchy);
  if(options.publish&&(audit.summary.assignedPopulationPct<=95||audit.summary.assignedInhabitedAreaPct<=90))throw Error('World coverage goal not met; publication refused');
  const verify=async()=>{for(const [file,sha]of Object.entries(before))if(hash(await fs.readFile(file))!==sha)throw Error('Frozen file changed; publication refused');if(hash(await fs.readFile(authoringFile))!==hash(authoredBytes))throw Error('Authoring changed during generation');};
  await verify();
  const output={'summary.json':audit.summary,'polity-summary.json':audit.politySummary,'largest-polities.json':audit.largestPolities,'unassigned-territories.json':audit.unassignedTerritories,'border-adjacencies.json':audit.borderAdjacencies,'tiny-polities.json':audit.tinyPolities,'disconnected-polities.json':audit.disconnectedPolities,'isolated-territories.json':audit.isolatedTerritories,'source-country-artifacts.json':audit.sourceCountryArtifacts,'manual-overrides.json':result.overrides,'territory-assignments.json':result.rows,'rule-usage.json':{used:result.rulesUsed,unused:result.rulesUnused},'political-geography.json':result.asset,'polities.json':config.polities.slice().sort((a,b)=>compare(a.id,b.id)),'polity-relations.json':{version:1,relations:validateRelations(config.relationships,config.polities)},'frozen-hashes.json':Object.fromEntries(Object.entries(before).map(([file,sha])=>[path.relative(ROOT,file).replaceAll('\\','/'),{beforeSha256:sha,afterSha256:sha,unchanged:true}]))};
  const serialized=Object.entries(output).map(([name,value])=>[name,json(value)]);await fs.mkdir(auditDir,{recursive:true});for(const [name,bytes]of serialized)await fs.writeFile(path.join(auditDir,name),bytes);
  let province;
  if(!context){province=await require('./mandate-world-provinces.cjs').compileWorld(result,config,scenarioDir);province.summary.atomicSourceCountryArtifactWarnings=audit.summary.sourceCountryArtifactWarnings;for(const [name,value]of Object.entries(province.outputs))await fs.writeFile(path.join(auditDir,name),json(value));}
  await verify();
  if(options.publish){if(province&&(province.summary.assignedPopulationPct<=95||province.summary.assignedInhabitedAreaPct<=90||province.summary.capitalFailures))throw Error('Province political coverage/capital validation failed');await publishWorld(context?result:{...result,asset:province.asset,runtime:province.runtime,provinceSummary:province.summary},config,scenarioDir);await verify();}
  return {result,audit,province,mode:options.publish?'published':'preview'};
}
module.exports={generateWorld,publishWorld,argsOf,FROZEN};
if(require.main===module)generateWorld(argsOf(process.argv.slice(2))).then(({audit,province,mode})=>console.log(json({mode,...(province?.summary||audit.summary)}))).catch(e=>{console.error(e.message);process.exitCode=1;});
