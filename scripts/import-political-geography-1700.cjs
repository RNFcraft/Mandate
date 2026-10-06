const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {parseStrictJson}=require('./strict-json.cjs');
const {assignPoliticalGeography}=require('./political-geography-assignment.cjs');
const {validatePoliticalGeography,compare}=require('../shared/political-geography.cjs');
const ROOT=path.resolve(__dirname,'..'),SCENARIO=path.join(ROOT,'scenarios/1700'),AUDIT=path.join(ROOT,'data/generated/political-geography/1700');
const FROZEN=['data/processed/canonical/atomic.topo.json','client/data/adm2/hierarchy.json','scenarios/1700/population.json','scenarios/1700/population.meta.json'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),json=value=>JSON.stringify(value,null,2)+'\n';
const USAGE='node scripts/import-political-geography-1700.cjs [--source FILE (repeatable)] [--polity-field polityId] [--source-name NAME --source-date DATE --source-version VERSION] [--source-url URL] [--source-citation CITATION] [--polities FILE] [--relations FILE] [--overrides FILE] [--audit DIR] [--scenario-dir DIR] [--high 0.9 --medium 0.6 --runner-ambiguity 0.1] [--publish]';
function argsOf(argv){
  const options={sources:[]},names={'--polity-field':'polityField','--source-name':'sourceName','--source-date':'sourceDate','--source-version':'sourceVersion','--source-url':'sourceUrl','--source-citation':'sourceCitation','--scenario-dir':'scenarioDir','--runner-ambiguity':'runnerAmbiguity'};
  for(let i=0;i<argv.length;i++){
    const flag=argv[i],key=names[flag]||flag.slice(2);
    if(['--help','--publish'].includes(flag)){if(options[key])throw Error(`Duplicate ${flag}`);options[key]=true;continue;}
    if(!['--source',...Object.keys(names),'--polities','--relations','--overrides','--audit','--high','--medium'].includes(flag)||!argv[i+1]||argv[i+1].startsWith('--'))throw Error(`Invalid option ${flag}\n${USAGE}`);
    const value=argv[++i];if(flag==='--source'){options.sources.push(value);continue;}
    if(Object.hasOwn(options,key))throw Error(`Duplicate ${flag}`);
    options[key]=['high','medium','runnerAmbiguity'].includes(key)?Number(value):value;
  }
  return options;
}
function local(file){const resolved=path.resolve(file);if(!resolved.startsWith(ROOT+path.sep))throw Error('Political import paths must stay inside the game repository');return resolved;}
async function atomicPublish(asset,folder){
  folder=local(folder);await fs.mkdir(folder,{recursive:true});const target=path.join(folder,'political-geography.json'),temp=path.join(folder,`.political-geography-${randomUUID()}.tmp`);
  try{const handle=await fs.open(temp,'wx');try{await handle.writeFile(json(asset));await handle.sync();}finally{await handle.close();}await fs.rename(temp,target);}
  finally{await fs.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
async function generatePoliticalGeography(options={},testContext){
  const scenarioDir=local(options.scenarioDir||SCENARIO),auditDir=local(options.audit||AUDIT);
  if(testContext&&scenarioDir===SCENARIO)throw Error('Synthetic context cannot target production scenario');
  const inFolder=(file,folder)=>file===folder||file.startsWith(folder+path.sep);
  if(inFolder(auditDir,scenarioDir)||inFolder(scenarioDir,auditDir)||!inFolder(auditDir,path.join(ROOT,'data/generated'))&&!inFolder(auditDir,path.join(ROOT,'tmp')))throw Error('Political audit must be separate, under data/generated or tmp');
  const polityFile=local(options.polities||path.join(scenarioDir,'polities.json')),relationFile=local(options.relations||path.join(scenarioDir,'polity-relations.json')),overrideFile=local(options.overrides||path.join(scenarioDir,'political-geography-overrides.json'));
  if(options.publish&&(polityFile!==path.join(scenarioDir,'polities.json')||relationFile!==path.join(scenarioDir,'polity-relations.json')))throw Error('Publication requires scenario-local polity and relationship registries');
  const sourceFiles=(options.sources||[]).map(local);
  if(sourceFiles.length&&['sourceName','sourceDate','sourceVersion'].some(k=>typeof options[k]!=='string'||!options[k].trim()||options[k].length>2000))throw Error('Historical sources require --source-name, --source-date and --source-version');
  if(options.sourceUrl&&!/^https?:\/\/[^\s]+$/.test(options.sourceUrl))throw Error('Source URL must be HTTP(S)');
  if(options.sourceCitation&&(typeof options.sourceCitation!=='string'||!options.sourceCitation.trim()||options.sourceCitation.length>2000))throw Error('Invalid source citation');
  for(const value of [options.sourceName,options.sourceDate,options.sourceVersion,options.sourceCitation])if(value&&(/^[A-Za-z]:[\\/]/.test(value)||value.startsWith('/')))throw Error('Source provenance must not contain absolute machine paths');
  for(const file of [polityFile,relationFile,overrideFile,...sourceFiles])if(inFolder(file,auditDir)||file===path.join(scenarioDir,'political-geography.json'))throw Error('Audit/publication would overwrite political inputs');
  const protectedFiles=testContext?.protectedFiles||FROZEN.map(file=>path.join(ROOT,file));
  const before=Object.fromEntries(await Promise.all(protectedFiles.map(async file=>[file,hash(await fs.readFile(file))])));
  const [polityBytes,relationBytes,overrideBytes,...sourceBytes]=await Promise.all([polityFile,relationFile,overrideFile,...sourceFiles].map(file=>fs.readFile(file)));
  const polities=parseStrictJson(polityBytes),relations=parseStrictJson(relationBytes),overrides=parseStrictJson(overrideBytes),sources=sourceBytes.map(parseStrictJson);
  const sourceProvenance=sourceBytes.map(bytes=>({name:options.sourceName,date:options.sourceDate,version:options.sourceVersion,url:options.sourceUrl||null,citation:options.sourceCitation||null,sha256:hash(bytes),polityField:options.polityField||'polityId'})).sort((a,b)=>compare(a.sha256,b.sha256));
  if(new Set(sourceProvenance.map(s=>s.sha256)).size!==sourceProvenance.length)throw Error('Duplicate historical source file');
  const geography=testContext?.geography||await require('./import-population-1700.cjs').loadGeography();
  let baseline,baselineSha256;
  if(testContext){baseline=testContext.baseline;baselineSha256=hash(json(baseline));}
  else{
    const baselineFolder=path.join(ROOT,'data/population/baselines/1700'),bytes=await fs.readFile(path.join(baselineFolder,'population.json')),manifest=parseStrictJson(await fs.readFile(path.join(baselineFolder,'manifest.json')));
    baselineSha256=hash(bytes);
    if(baselineSha256!==manifest.populationSha256||geography.geographyHash!==manifest.geographySha256||geography.hierarchyHash!==manifest.hierarchySha256)throw Error('Frozen population/geography provenance mismatch');
    baseline=JSON.parse(bytes); // Frozen bytes are already pinned by SHA-256.
  }
  const thresholds=Object.fromEntries(['high','medium','runnerAmbiguity'].filter(k=>Object.hasOwn(options,k)).map(k=>[k,options[k]]));
  const result=assignPoliticalGeography({...geography,baseline,polities,relations,overrides,sources,polityField:options.polityField||'polityId',thresholds,provenance:{canonicalSha256:geography.geographyHash,hierarchySha256:geography.hierarchyHash,populationBaselineSha256:baselineSha256,politiesSha256:hash(polityBytes),relationsSha256:hash(relationBytes),overridesSha256:hash(overrideBytes),sources:sourceProvenance}});
  if(options.publish)result.asset.status='published';
  validatePoliticalGeography(result.asset,polities,result.relations,geography.hierarchy);
  const checkUnchanged=async()=>{
    for(const [file,sha256]of Object.entries(before))if(hash(await fs.readFile(file))!==sha256)throw Error('Frozen geography/population changed during political import; publication refused');
    for(const [file,bytes]of [[polityFile,polityBytes],[relationFile,relationBytes],[overrideFile,overrideBytes],...sourceFiles.map((file,i)=>[file,sourceBytes[i]])])if(hash(await fs.readFile(file))!==hash(bytes))throw Error('Political inputs changed during import; publication refused');
  };
  await checkUnchanged();
  const output={'summary.json':result.audit.summary,'polity-summary.json':result.audit.politySummary,'ambiguous-territories.json':result.audit.ambiguousTerritories,'unassigned-territories.json':result.audit.unassignedTerritories,'manual-overrides.json':result.audit.manualOverrides,'territory-assignments.json':result.audit.territoryAssignments,'political-geography.json':{...result.asset,status:'ready'},'polities.json':polities.slice().sort((a,b)=>compare(a.id,b.id)),'polity-relations.json':result.relations};
  // Serialization/validation finishes before any authoritative replacement.
  const serialized=Object.entries(output).map(([name,value])=>[name,json(value)]);
  await fs.mkdir(auditDir,{recursive:true});for(const [name,bytes]of serialized)await fs.writeFile(path.join(auditDir,name),bytes);
  await checkUnchanged();if(options.publish)await atomicPublish(result.asset,scenarioDir);
  return {...result,auditDir};
}
async function main(argv){const options=argsOf(argv);if(options.help){console.log(USAGE);return;}const result=await generatePoliticalGeography(options);console.log(json({mode:options.publish?'published':'preview',...result.audit.summary}));}
module.exports={generatePoliticalGeography,atomicPublish,argsOf,USAGE};
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
