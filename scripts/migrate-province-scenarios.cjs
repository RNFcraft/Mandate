const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {sha256}=require('./province-publication.cjs');
const {verifyFrozen}=require('./freeze-gameplay-map.cjs');
const {projectScenario,projectPopulation,projectPoliticalAsset}=require('../shared/province-projection.cjs');
const {validateScenario}=require('../shared/scenario.cjs');
const {validatePopulationScenario}=require('../shared/population.cjs');
async function migrate(){
  const manifest=await verifyFrozen(),hierarchy=JSON.parse(await fs.readFile('client/data/map-v2/hierarchy.json')),mapping=JSON.parse(await fs.readFile('client/data/map-v2/mapping.json'));
  const files=execFileSync('git',['ls-files','scenarios/*/scenario.json'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(file=>/^scenarios\/[^.][^/]*\/scenario\.json$/.test(file));
  const reports=[];
  for(const file of files){const folder=path.dirname(file),scenario=JSON.parse(await fs.readFile(file));if(scenario.geography===hierarchy.id){reports.push({id:scenario.id,status:'already-migrated'});continue;}
    if(scenario.geography!=='mandate-atomic-v1')throw Error(`Explicit offline atomic migration required first: ${file}`);
    const data={scenario};for(const name of ['countries','ownership','controllers','political-geography','polities','polity-relations'])try{data[name]=JSON.parse(await fs.readFile(path.join(folder,name+'.json')));}catch(e){if(e.code!=='ENOENT')throw e;}
    const {data:projected,qa}=projectScenario(data,mapping,hierarchy);validateScenario(projected,new Set(hierarchy.territories.map(t=>t.id)));
    const output={'scenario.json':projected.scenario,'countries.json':projected.countries,'ownership.json':projected.ownership,'controllers.json':projected.controllers,'province-migration-qa.json':{schema:'mandate-scenario-projection-qa-v1',sourceGeography:scenario.geography,geography:hierarchy.id,mappingSha256:manifest.mappingSha256,...qa}};
    if(data['political-geography'])output['political-geography.json']=projectPoliticalAsset(data['political-geography'],mapping,hierarchy).asset;
    let populationQA=null;
    try{const bytes=await fs.readFile(path.join(folder,'population.json')),source=JSON.parse(bytes),result=projectPopulation(source,mapping);validatePopulationScenario(result.population,hierarchy);populationQA=result.qa;
      output['population.json']=result.population;output['population.meta.json']={schema:'mandate-province-population-v1',geography:hierarchy.id,projectionMethod:'allocation-fraction-cohort-largest-remainder-v1',sourceAtomicPopulationSha256:sha256(bytes),atomicBaselinePopulationSha256:manifest.populationSourceSha256,mappingSha256:manifest.mappingSha256,gameplayGeographySha256:manifest.topologySha256,outputPopulationSha256:sha256(JSON.stringify(result.population)),totals:{total:result.qa.output,urban:result.qa.urban,rural:result.qa.rural}};
      output['population-migration-qa.json']=result.qa;
    }catch(e){if(e.code!=='ENOENT')throw e;}
    const absolute=path.resolve(folder),parent=path.dirname(absolute),stage=path.join(parent,'.province-stage-'+scenario.id),backup=path.join(parent,'.province-backup-'+scenario.id);let backed=false;
    await fs.cp(absolute,stage,{recursive:true,errorOnExist:true,force:false});
    try{for(const [name,value]of Object.entries(output))await fs.writeFile(path.join(stage,name),JSON.stringify(value));await fs.rename(absolute,backup);backed=true;try{await fs.rename(stage,absolute);}catch(e){await fs.rename(backup,absolute);backed=false;throw e;}}
    finally{if(path.dirname(stage)!==parent||path.dirname(backup)!==parent)throw Error('Unsafe scenario stage');await fs.rm(stage,{recursive:true,force:true});if(backed)await fs.rm(backup,{recursive:true,force:true});}
    reports.push({id:scenario.id,status:'migrated',assigned:qa.assigned,ambiguous:qa.ambiguous.length,fallback:qa.fallback.length,population:populationQA});
  }return reports;
}
module.exports={migrate};
if(require.main===module)migrate().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;});
