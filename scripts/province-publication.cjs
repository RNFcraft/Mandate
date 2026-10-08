// Authoring may use atoms; publication and explicit previews compile to provinces.
const fs=require('node:fs/promises'),crypto=require('node:crypto');
const {projectPoliticalAsset}=require('../shared/province-projection.cjs');
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function compilePoliticalAsset(asset){
  await require('./freeze-gameplay-map.cjs').verifyFrozen();
  const hierarchy=JSON.parse(await fs.readFile('client/data/map-v2/hierarchy.json'));
  if(asset.geography===hierarchy.id)return asset;
  if(asset.geography!=='mandate-atomic-v1')throw Error('Unsupported political authoring geography');
  const mapping=JSON.parse(await fs.readFile('client/data/map-v2/mapping.json'));
  return projectPoliticalAsset(asset,mapping,hierarchy).asset;
}
module.exports={sha256,compilePoliticalAsset};
async function compilePopulationResult(result){
  const {verifyFrozen}=require('./freeze-gameplay-map.cjs'),{projectPopulation}=require('../shared/province-projection.cjs');
  const manifest=await verifyFrozen(),mapping=JSON.parse(await fs.readFile('client/data/map-v2/mapping.json'));
  const {population,qa}=projectPopulation(result.population,mapping);
  const hierarchy=JSON.parse(await fs.readFile('client/data/map-v2/hierarchy.json'));
  require('../shared/population.cjs').validatePopulationScenario(population,hierarchy);
  return {...result,population,meta:{schema:'mandate-province-population-v1',geography:manifest.geographyId,projectionMethod:'allocation-fraction-cohort-largest-remainder-v1',sourceAtomicPopulationSha256:sha256(JSON.stringify(result.population)),atomicBaselinePopulationSha256:manifest.populationSourceSha256,outputPopulationSha256:sha256(JSON.stringify(population)),mappingSha256:manifest.mappingSha256,gameplayGeographySha256:manifest.topologySha256,totals:{total:qa.output,urban:qa.urban,rural:qa.rural},authoringProvenance:result.meta},projectionQA:qa};
}
module.exports.compilePopulationResult=compilePopulationResult;
