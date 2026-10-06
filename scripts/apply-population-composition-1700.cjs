const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {composePopulation,mass,validateRules}=require('./population-composition.cjs');
const ROOT=path.resolve(__dirname,'..');
const BASELINE=path.join(ROOT,'data/population/baselines/1700');
const SCENARIO=path.join(ROOT,'scenarios/1700');
const AUDIT=path.join(ROOT,'data/generated/population/1700');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const USAGE='node scripts/apply-population-composition-1700.cjs [--rules FILE] [--publish | --output FILE] [--audit FILE] [--baseline-dir DIR] [--registries DIR] [--hierarchy FILE]';
function argsOf(argv){
  const options={};
  for(let i=0;i<argv.length;i++){
    const flag=argv[i],key={'--baseline-dir':'baselineDir'}[flag]||flag.slice(2);
    if(Object.hasOwn(options,key))throw Error(`Duplicate option ${flag}`);
    if(['--help','--publish'].includes(flag)){options[key]=true;continue;}
    if(!['--rules','--output','--audit','--baseline-dir','--registries','--hierarchy'].includes(flag)||!argv[i+1]||argv[i+1].startsWith('--'))throw Error(`Invalid option ${flag}\n${USAGE}`);
    options[key]=argv[++i];
  }
  if(options.publish&&options.output)throw Error('--publish and --output are mutually exclusive');
  return options;
}
function local(file){const resolved=path.resolve(file);if(!resolved.startsWith(ROOT+path.sep))throw Error('Composition paths must be inside the game repository');return resolved;}
async function atomicWrite(file,bytes){
  file=local(file);await fs.mkdir(path.dirname(file),{recursive:true});
  const temp=path.join(path.dirname(file),`.${path.basename(file)}-${randomUUID()}.tmp`);
  try{
    const handle=await fs.open(temp,'wx');try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    await fs.rename(temp,file);
  }finally{await fs.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
async function generateComposition(options={}){
  const baselineDir=local(options.baselineDir||BASELINE),registryDir=local(options.registries||path.join(ROOT,'data/population'));
  const hierarchyFile=local(options.hierarchy||path.join(ROOT,'client/data/adm2/hierarchy.json'));
  const rulesFile=local(options.rules||path.join(SCENARIO,'population-composition.json'));
  const outputFile=local(options.publish?path.join(SCENARIO,'population.json'):options.output||path.join(AUDIT,'composed-population.json'));
  const auditFile=local(options.audit||path.join(AUDIT,'composition-summary.json'));
  if(options.publish&&baselineDir!==BASELINE)throw Error('Production publication requires the preserved 1700 baseline; custom baselines are preview-only');
  const inFolder=(file,folder)=>file===folder||file.startsWith(folder+path.sep);
  // The immutable source, registries, config and scenario metadata are never outputs.
  for(const file of [outputFile,auditFile]){
    if(inFolder(file,baselineDir)||inFolder(file,registryDir)&&!inFolder(file,AUDIT)||file===hierarchyFile||file===rulesFile)throw Error('Composition output would overwrite source/config');
    if(inFolder(file,SCENARIO)&&!(options.publish&&file===outputFile&&file===path.join(SCENARIO,'population.json')))throw Error('Use --publish to replace only scenario population.json');
  }
  if(outputFile===auditFile)throw Error('Composition population and audit paths must differ');
  const [baselineBytes,manifestBytes,hierarchyBytes,rulesBytes,...registryBytes]=await Promise.all([
    fs.readFile(path.join(baselineDir,'population.json')),fs.readFile(path.join(baselineDir,'manifest.json')),fs.readFile(hierarchyFile),fs.readFile(rulesFile),...['cultures','religions','strata'].map(key=>fs.readFile(path.join(registryDir,key+'.json')))
  ]);
  const baseline=JSON.parse(baselineBytes),manifest=JSON.parse(manifestBytes),hierarchy=JSON.parse(hierarchyBytes),config=JSON.parse(rulesBytes);
  const baselineSha256=digest(baselineBytes),hierarchySha256=digest(hierarchyBytes);
  if(manifest.schema!=='mandate-population-composition-baseline-v1'||manifest.scenario!=='1700'||manifest.year!==1700||manifest.populationSha256!==baselineSha256||manifest.hierarchySha256!==hierarchySha256||!manifest.totals)throw Error('Composition baseline/hierarchy provenance mismatch');
  const input=mass(baseline);for(const key of ['total','rural','urban'])if(input[key]!==manifest.totals[key])throw Error(`Composition baseline ${key} mismatch`);
  const registries=Object.fromEntries(['cultures','religions','strata'].map((key,i)=>[key,JSON.parse(registryBytes[i])]));
  const rules=validateRules(config,registries,hierarchy);let points;
  if(rules.some(rule=>rule.match.bbox)){
    const {loadGeography}=require('./import-population-1700.cjs'),{interior}=require('./canonical-mesh.cjs');
    const geography=await loadGeography();
    if(geography.geographyHash!==manifest.geographySha256||geography.hierarchyHash!==hierarchySha256)throw Error('Composition canonical geography provenance mismatch');
    points=Object.fromEntries(geography.features.map(f=>[f.id,interior(f.geometry)]));
  }
  const result=composePopulation(baseline,registries,config,hierarchy,{points});
  const populationBytes=json(result.population),audit={...result.audit,provenance:{baselineSha256,hierarchySha256,rulesSha256:digest(rulesBytes),registrySha256:Object.fromEntries(['cultures','religions','strata'].map((key,i)=>[key,digest(registryBytes[i])])),outputSha256:digest(populationBytes)}};
  // All validation and serialization finish before any publication. Audit I/O
  // failure also prevents scenario replacement; final rename replaces one asset.
  await atomicWrite(auditFile,json(audit));await atomicWrite(outputFile,populationBytes);
  return {...result,audit,outputFile,auditFile};
}
async function main(argv){const options=argsOf(argv);if(options.help){console.log(USAGE);return;}const result=await generateComposition(options);console.log(json({output:result.outputFile,audit:result.auditFile,...result.audit}));}
module.exports={generateComposition,argsOf,atomicWrite,USAGE};
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
