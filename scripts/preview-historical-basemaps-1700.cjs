const fs=require('node:fs/promises'),path=require('node:path');
const {SOURCE,FILE,sha,parseSource,proposeMapping,validateMapping,inspectSource,adaptSource}=require('./historical-basemaps-adapter.cjs');
const {parseStrictJson}=require('./strict-json.cjs');
const {generatePoliticalGeography}=require('./import-political-geography-1700.cjs');
const ROOT=path.resolve(__dirname,'..'),SOURCE_DIR=path.join(ROOT,'data/source/political-geography/1700'),AUDIT_DIR=path.join(ROOT,'data/generated/political-geography/1700/historical-basemaps');
const FROZEN=['data/processed/canonical/atomic.topo.json','client/data/adm2/hierarchy.json','scenarios/1700/population.json','scenarios/1700/population.meta.json','scenarios/1700/political-geography.json','scenarios/1700/polities.json','scenarios/1700/polity-relations.json','scenarios/1700/political-geography-overrides.json','scripts/import-political-geography-1700.cjs','scripts/political-geography-assignment.cjs','shared/political-geography.cjs'];
const json=value=>JSON.stringify(value,null,2)+'\n';
function argsOf(argv){
  const options={};
  for(let i=0;i<argv.length;i++){
    const flag=argv[i];if(flag==='--publish')throw Error('Historical basemaps adapter is PREVIEW ONLY; --publish is forbidden');
    if(['--propose','--exclude-invalid'].includes(flag)){if(options[flag])throw Error('Duplicate option');options[flag]=true;continue;}
    if(!['--source','--mapping','--audit','--commit'].includes(flag)||!argv[i+1]||argv[i+1].startsWith('--'))throw Error(`Invalid preview option ${flag}`);
    if(options[flag])throw Error('Duplicate option');options[flag]=argv[++i];
  }
  return {source:options['--source'],mapping:options['--mapping'],audit:options['--audit'],commit:options['--commit'],propose:!!options['--propose'],excludeInvalid:!!options['--exclude-invalid']};
}
const local=(file,base)=>{const p=path.resolve(file);if(!p.startsWith(base+path.sep))throw Error(`Path must be inside ${path.relative(ROOT,base)}`);return p;};
async function runPreview(options={},dependencies={}){
  if(Object.hasOwn(options,'publish'))throw Error('Publication is forbidden for historical basemaps preview');
  const sourceFile=local(options.source||path.join(SOURCE_DIR,'historical-basemaps-world_1700.geojson'),path.join(ROOT,'data/source'));
  const mappingFile=local(options.mapping||path.join(SOURCE_DIR,'historical-basemaps-polity-map.json'),path.join(ROOT,'data/source'));
  const auditDir=local(options.audit||AUDIT_DIR,path.join(ROOT,'data/generated'));
  if(sourceFile===mappingFile)throw Error('Source and mapping paths must differ');
  if(!/^[a-f0-9]{40}$/.test(options.commit||''))throw Error('Supply the exact upstream --commit SHA');
  const before=Object.fromEntries(await Promise.all(FROZEN.map(async file=>[file,sha(await fs.readFile(path.join(ROOT,file)))])));
  const bytes=await fs.readFile(sourceFile),sourceSha256=sha(bytes),source=parseSource(bytes),inspection=inspectSource(source);
  const provenance={repository:SOURCE,commit:options.commit,originalFile:FILE,originalFileSha256:sourceSha256,license:'GPL-3.0',licenseReviewRequiredBeforeProduction:true,sourceDate:'1700',rawUrl:`https://raw.githubusercontent.com/aourednik/historical-basemaps/${options.commit}/${FILE}`,licenseUrl:`${SOURCE}/blob/${options.commit}/LICENSE`,adapterMethod:'explicit NAME -> draft polity ID mapping; unnamed features excluded; no automatic SUBJECTO/PARTOF relationships; invalid named geometries require explicit preview exclusion',note:'Local preview only. Source entities and relationship candidates are unreviewed. No licensing compatibility with Mandate is claimed.'};
  await fs.mkdir(auditDir,{recursive:true});
  const write=async(name,value)=>fs.writeFile(path.join(auditDir,name),json(value));
  await write('source-provenance.json',provenance);await write('source-schema.json',inspection.report);await write('source-inventory.json',inspection.inventory);await write('relationship-candidates.json',inspection.relationshipCandidates);await write('source-overlaps.json',inspection.overlaps);
  if(options.propose){
    const proposed=proposeMapping(source,sourceSha256);await write('proposed-polity-map.json',proposed);
    // Never overwrite an authored mapping: proposals require an explicit step.
    await fs.mkdir(path.dirname(mappingFile),{recursive:true});await fs.writeFile(mappingFile,json(proposed),{flag:'wx'});
    return {mode:'draft-proposals-only',featureCount:inspection.report.featureCount,namedEntityCount:inspection.report.namedEntityCount,borderPrecisionDistribution:inspection.report.borderPrecisionDistribution,mappingFile:path.relative(ROOT,mappingFile)};
  }
  const mappingBytes=await fs.readFile(mappingFile),mapping=parseStrictJson(mappingBytes),mappingSha256=sha(mappingBytes);
  const names=inspection.inventory.map(r=>r.sourceName),unmappedNames=names.filter(name=>!Object.hasOwn(mapping?.mappings||{},name));
  await write('mapping-audit.json',{mappedNames:names.length-unmappedNames.length,unmappedNames,reviewStatus:mapping?.reviewStatus||null});
  validateMapping(mapping,source,sourceSha256);
  const adapted=adaptSource(source,mapping,sourceSha256,inspection,{excludeInvalid:!!options.excludeInvalid});
  const adapterInputDir=path.join(path.dirname(mappingFile),'preview-adapter');await fs.mkdir(adapterInputDir,{recursive:true});
  for(const [file,value]of Object.entries({'adapted-world_1700.geojson':adapted.source,'polities.json':adapted.registry,'polity-relations.json':{version:1,relations:[]},'overrides.json':{version:1,overrides:[]}}))await fs.writeFile(path.join(adapterInputDir,file),json(value));
  await write('mapping-audit.json',{...adapted.mappingSummary,mappingSha256});await write('excluded-source-features.json',adapted.excluded);await write('source-precision.json',adapted.precisionAudit);
  const result=await (dependencies.generate||generatePoliticalGeography)({sources:[path.join(adapterInputDir,'adapted-world_1700.geojson')],polities:path.join(adapterInputDir,'polities.json'),relations:path.join(adapterInputDir,'polity-relations.json'),overrides:path.join(adapterInputDir,'overrides.json'),audit:path.join(auditDir,'assignment'),sourceName:'historical-basemaps world_1700 (draft NAME adapter)',sourceDate:'1700',sourceVersion:options.commit,sourceUrl:provenance.rawUrl,sourceCitation:`${SOURCE}; GPL-3.0; raw SHA-256 ${sourceSha256}; mapping SHA-256 ${mappingSha256}; preview only; exclusions audited`});
  const summary=result.audit.summary,totalPopulation=summary.assignedPopulation+summary.unassignedPopulation,totalArea=summary.assignedAreaKm2+summary.unassignedAreaKm2;
  const protectedHashes={};
  for(const [file,beforeSha256]of Object.entries(before)){const afterSha256=sha(await fs.readFile(path.join(ROOT,file)));if(beforeSha256!==afterSha256)throw Error(`Frozen file changed: ${file}`);protectedHashes[file]={beforeSha256,afterSha256,unchanged:true};}
  if(sha(await fs.readFile(sourceFile))!==sourceSha256||sha(await fs.readFile(mappingFile))!==mappingSha256)throw Error('Source/mapping changed during preview');
  await write('frozen-hashes.json',protectedHashes);
  const report={mode:'preview-only',published:false,mapping:adapted.mappingSummary,...summary,provenance:{...provenance,assignment:summary.provenance},assignedTerritoryPct:100*summary.assignedTerritories/summary.canonicalTerritories,assignedPopulationPct:totalPopulation?100*summary.assignedPopulation/totalPopulation:0,assignedAreaPct:totalArea?100*summary.assignedAreaKm2/totalArea:0,sourceBorderPrecision:adapted.precisionAudit,relationshipCandidates:inspection.relationshipCandidates.length,excludedNamedGeometries:adapted.excluded.filter(r=>r.sourceName!==null),auditDir:path.relative(ROOT,auditDir)};
  await write('preview-summary.json',report);return report;
}
module.exports={runPreview,argsOf,FROZEN};
if(require.main===module)runPreview(argsOf(process.argv.slice(2))).then(result=>console.log(json(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
