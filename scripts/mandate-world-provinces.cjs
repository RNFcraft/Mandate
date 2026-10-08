// Offline compilation of existing authored politics onto immutable Map v2.
const fs=require('node:fs/promises');
const {feature}=require('topojson-client');
const {unpackTopology}=require('./topology-codec.cjs');
const {projectPoliticalAsset}=require('../shared/province-projection.cjs');
const {compare,validatePoliticalGeography,validateRelations}=require('../shared/political-geography.cjs');
const {validateScenario}=require('../shared/scenario.cjs');
const {auditWorld,distance}=require('./mandate-world-audit.cjs');
const {auditCentroid}=require('./population-audit-centroid.cjs');
const read=async p=>JSON.parse(await fs.readFile(p));
function ringContains(r,p){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function contains(g,p){return (g.type==='Polygon'?[g.coordinates]:g.coordinates).some(rs=>ringContains(rs[0],p)&&!rs.slice(1).some(r=>ringContains(r,p)));}
function candidateRows(asset,mapping,ids){
  const scores=new Map(ids.map(id=>[id,new Map()]));
  for(const atom of Object.keys(mapping).sort(compare))for(const r of mapping[atom].intersections){if(r.overlapAreaKm2<=0)continue;const owner=asset.owners[atom]??null,s=scores.get(r.provinceId);s.set(owner,(s.get(owner)||0)+r.overlapAreaKm2);}
  return new Map([...scores].map(([id,s])=>{const total=[...s.values()].reduce((a,b)=>a+b,0);return [id,[...s].sort((a,b)=>b[1]-a[1]||compare(a[0]??'',b[0]??'')).map(([polityId,areaKm2])=>({polityId,areaKm2,share:total?areaKm2/total:0}))];}));
}
async function compileWorld(result,config,scenarioDir){
  const manifest=await require('./freeze-gameplay-map.cjs').verifyFrozen();
  const [hierarchy,mapping,packed,metadata,population,policy,scenario]=await Promise.all(['client/data/map-v2/hierarchy.json','client/data/map-v2/mapping.json','client/data/map-v2/provinces.topo.json','client/data/map-v2/provinces.json',`${scenarioDir}/population.json`,`${scenarioDir}/province-political-authoring.json`,`${scenarioDir}/scenario.json`].map(read));
  if(policy.version!==1||policy.geography!==hierarchy.id||!Array.isArray(policy.provinceOverrides)||!Array.isArray(policy.capitalAnchors))throw Error('Invalid province political authoring');
  const ids=hierarchy.territories.map(t=>t.id),validIds=new Set(ids),polityIds=new Set(config.polities.map(p=>p.id)),seen=new Set();
  const asset=projectPoliticalAsset(result.asset,mapping,hierarchy).asset,baseOwners={...asset.owners},manual=[];
  for(const o of policy.provinceOverrides.slice().sort((a,b)=>compare(a.provinceId,b.provinceId))){
    if(!validIds.has(o.provinceId)||seen.has(o.provinceId)||!o.reason?.trim()||o.ownerPolityId!==null&&!polityIds.has(o.ownerPolityId)||Object.hasOwn(o,'controllerPolityId')&&o.controllerPolityId!==null&&!polityIds.has(o.controllerPolityId))throw Error('Invalid/duplicate province override');seen.add(o.provinceId);
    const previousOwner=asset.owners[o.provinceId]??null;asset.owners[o.provinceId]=o.ownerPolityId;
    delete asset.controllers[o.provinceId];if(Object.hasOwn(o,'controllerPolityId')&&o.controllerPolityId!==o.ownerPolityId)asset.controllers[o.provinceId]=o.controllerPolityId;
    manual.push({...o,previousOwner});
  }
  const topology=unpackTopology(packed),features=feature(topology,topology.objects.provinces).features,byId=new Map(features.map(f=>[f.id,f])),meta=new Map(metadata.map(p=>[p.id,p])),mass=new Map(ids.map(id=>[id,{population:0,urban:0,rural:0}]));
  for(const c of population.cohorts){const row=mass.get(c.territoryId);if(!row)throw Error('Non-province runtime population');row.population+=c.count;row[c.settlement]+=c.count;}
  const rows=ids.map(id=>({territoryId:id,centroid:auditCentroid(byId.get(id).geometry),areaKm2:meta.get(id).areaKm2,...mass.get(id),ownerPolityId:asset.owners[id]??null,controllerPolityId:Object.hasOwn(asset.controllers,id)?asset.controllers[id]:asset.owners[id]??null,overridden:seen.has(id)})),rowById=new Map(rows.map(r=>[r.territoryId,r]));
  const candidates=candidateRows(result.asset,mapping,ids),reasons=new Map(),flag=(id,reason)=>{if(!reasons.has(id))reasons.set(id,new Set());reasons.get(id).add(reason);};
  for(const [id,rs]of candidates){if(rs[1]?.share>=.15&&rs[0].share-rs[1].share<=.2)flag(id,'close-overlap-shares');if(rs.filter(r=>r.share>=.1).length>1)flag(id,'multiple-significant-assignments');}
  for(const id of seen)flag(id,'explicit-province-correction');
  const capitalValidation=[],anchorSeen=new Set(),capitalByPolity=new Map();
  for(const a of policy.capitalAnchors.slice().sort((a,b)=>compare(a.polityId,b.polityId))){
    if(!polityIds.has(a.polityId)||anchorSeen.has(a.polityId)||!a.name?.trim()||!a.reason?.trim()||!Array.isArray(a.point)||a.point.length!==2||!a.point.every(Number.isFinite)||Math.abs(a.point[0])>180||Math.abs(a.point[1])>90)throw Error('Invalid/duplicate capital anchor');anchorSeen.add(a.polityId);
    const hits=features.filter(f=>contains(f.geometry,a.point)).sort((a,b)=>compare(a.id,b.id)),target=hits[0]?.id;
    if(target&&(baseOwners[target]??null)!==a.polityId)flag(target,'strategic-anchor-conflicts-with-dominant-overlap');
    const owned=rows.filter(r=>r.ownerPolityId===a.polityId).sort((x,y)=>distance(x.centroid,a.point)-distance(y.centroid,a.point)||compare(x.territoryId,y.territoryId)),capital=target&&asset.owners[target]===a.polityId?rowById.get(target):owned[0];
    if(!capital)throw Error(`No owned province for capital ${a.polityId}`);
    capitalByPolity.set(a.polityId,capital.territoryId);capitalValidation.push({...a,pointProvinceId:target??null,dominantOwner:target?baseOwners[target]??null:null,capitalRegionId:capital.territoryId,owner:capital.ownerPolityId,method:capital.territoryId===target?'anchor-containing-owned-province':'nearest-owned-centroid-to-anchor',distanceKm:distance(capital.centroid,a.point),valid:capital.ownerPolityId===a.polityId});
  }
  const countries=config.polities.slice().sort((a,b)=>compare(a.id,b.id)).map(p=>{
    const fallback=rows.filter(r=>r.ownerPolityId===p.id).sort((a,b)=>b.population-a.population||b.areaKm2-a.areaKm2||compare(a.territoryId,b.territoryId))[0],capital=capitalByPolity.get(p.id)??fallback?.territoryId??null;
    if(!capitalByPolity.has(p.id))capitalValidation.push({polityId:p.id,capitalRegionId:capital,owner:fallback?.ownerPolityId??null,method:'authored-gameplay-seat-largest-population-owned-province',valid:capital===null||fallback.ownerPolityId===p.id,note:'Gameplay seat only; no precise historical capital claim.'});
    return {id:p.id,name:p.name,shortName:p.shortName,color:p.color,capitalRegionId:capital,governmentType:p.type,polityType:p.type};
  });
  asset.provenance={...asset.provenance,mappingSha256:manifest.mappingSha256,topologySha256:manifest.topologySha256,provincePolicySha256:require('./province-publication.cjs').sha256(await fs.readFile(`${scenarioDir}/province-political-authoring.json`)),provinceOverrides:manual};
  const ownership=Object.fromEntries(rows.map(r=>[r.territoryId,r.ownerPolityId])),runtime={scenario:{...scenario,name:'Mandate World 1700',version:4,geography:hierarchy.id},countries,ownership,controllers:asset.controllers};
  validateScenario(runtime,validIds);validatePoliticalGeography(asset,config.polities,config.relationships,hierarchy);
  const audit=auditWorld({rows,overrides:manual},config,{...topology,objects:{territories:topology.objects.provinces}},hierarchy);
  const isolated=audit.isolatedTerritories.filter(r=>r.ownerPolityId!==null).map(r=>({...r,archipelago:meta.get(r.territoryId).archipelago,capital:countries.some(c=>c.capitalRegionId===r.territoryId),classification:meta.get(r.territoryId).archipelago?'island-group-review':countries.some(c=>c.capitalRegionId===r.territoryId)?'authored-capital-enclave-review':'isolated-land-province-review'}));
  for(const r of isolated)flag(r.territoryId,'isolated-province-with-foreign-land-neighbors');
  for(const p of audit.disconnectedPolities)for(const c of p.components.slice(1))if(c.territories<=2&&c.distanceToMainRepresentativeKm<500)for(const id of c.territoryIds)flag(id,'detached-nearby-small-component');
  const ambiguous=[...reasons].sort(([a],[b])=>compare(a,b)).map(([id,rs])=>{const cs=candidates.get(id),r=rowById.get(id);return {provinceId:id,winner:cs[0]?.polityId??null,winnerShare:cs[0]?.share??0,runnerUp:cs[1]?.polityId??null,runnerUpShare:cs[1]?.share??0,allCandidates:cs,finalOwner:r.ownerPolityId,population:r.population,areaKm2:r.areaKm2,reason:[...rs].sort(compare),overridden:seen.has(id)};});
  const summary={...audit.summary,geography:hierarchy.id,totalPopulation:rows.reduce((s,r)=>s+r.population,0),ambiguousProvinces:ambiguous.length,explicitProvinceOverrides:manual.length,capitalFailures:capitalValidation.filter(r=>!r.valid).length,suspiciousIsolatedProvinces:isolated.filter(r=>r.classification==='isolated-land-province-review').length,relationshipValidation:'valid',inactivePolities:countries.filter(c=>c.capitalRegionId===null).map(c=>c.id),assignedCapitalCount:countries.filter(c=>c.capitalRegionId!==null).length,relevantInhabitedDefinition:'Frozen gameplay provinces with runtime population > 0',published:false};
  return {asset,runtime,summary,outputs:{'province-summary.json':summary,'province-polity-summary.json':audit.politySummary,'province-largest-polities.json':{byPopulation:audit.largestPolities.slice(0,20),byArea:audit.politySummary.filter(r=>r.polityId).sort((a,b)=>b.areaKm2-a.areaKm2||compare(a.polityId,b.polityId)).slice(0,20),byProvinceCount:audit.politySummary.filter(r=>r.polityId).sort((a,b)=>b.territories-a.territories||compare(a.polityId,b.polityId)).slice(0,20)},'province-border-adjacencies.json':audit.borderAdjacencies,'province-ambiguous.json':ambiguous,'province-isolated.json':isolated,'province-connectivity.json':audit.disconnectedPolities,'province-tiny-polities.json':audit.tinyPolities,'province-unassigned.json':audit.unassignedTerritories,'province-overrides.json':manual,'province-capitals.json':capitalValidation,'province-relationships.json':validateRelations(config.relationships,config.polities),'province-assignments.json':rows,'province-political-geography.json':asset}};
}
module.exports={compileWorld,candidateRows,contains};
