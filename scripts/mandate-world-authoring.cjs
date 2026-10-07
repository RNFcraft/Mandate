// Offline gameplay authoring. Never reads DEV ownership or historical polygons.
const {compare,validatePolities,validateRelations,validateOverrides,validatePoliticalGeography}=require('../shared/political-geography.cjs');
const {area,polygons}=require('./adm2-spatial.cjs');
const {auditCentroid}=require('./population-audit-centroid.cjs');
const {validatePopulationScenario}=require('../shared/population.cjs');
const fail=message=>{throw Error(`Mandate World authoring: ${message}`);};
const plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
function validateAuthoring(config,hierarchy){
  if(config?.version!==1||config.year!==1700||config.datasetId!=='mandate-world-v1'||!Array.isArray(config.rules)||!Array.isArray(config.overrides)||!Array.isArray(config.majorPolityIds)||typeof config.description!=='string')fail('invalid authoring header');
  const ids=validatePolities(config.polities);validateRelations(config.relationships,config.polities);
  if(config.majorPolityIds.some(id=>!ids.has(id)))fail('unknown major polity');
  const territories=new Set(hierarchy.territories.map(t=>t.id)),countries=new Set(hierarchy.adm0.map(c=>c.id)),ruleIds=new Set();
  const rules=config.rules.map(rule=>{
    if(!plain(rule)||typeof rule.id!=='string'||!/^[a-z0-9_-]{1,64}$/.test(rule.id)||ruleIds.has(rule.id)||!plain(rule.match)||!Object.hasOwn(rule,'ownerPolityId')||rule.ownerPolityId!==null&&!ids.has(rule.ownerPolityId)||typeof rule.reason!=='string'||!rule.reason.trim())fail('invalid rule/id/owner/reason');
    ruleIds.add(rule.id);const m=rule.match;
    if(Object.keys(rule).some(k=>!['id','match','ownerPolityId','reason','source'].includes(k)))fail('unknown rule field');
    if(Object.keys(m).some(k=>!['territoryId','territoryIds','sourceCountry','bbox'].includes(k)))fail('unknown selector (ownership is not a selector)');
    if(Object.hasOwn(m,'territoryId')&&!territories.has(m.territoryId))fail('unknown exact territory');
    if(Object.hasOwn(m,'territoryIds')&&(!Array.isArray(m.territoryIds)||!m.territoryIds.length||new Set(m.territoryIds).size!==m.territoryIds.length||m.territoryIds.some(id=>!territories.has(id))))fail('invalid territory list');
    if(Object.hasOwn(m,'sourceCountry')&&!countries.has(m.sourceCountry))fail(`unknown sourceCountry ${m.sourceCountry}`);
    if(Object.hasOwn(m,'bbox')){const b=m.bbox;if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||Math.abs(b[0])>180||Math.abs(b[2])>180||b[1]<-90||b[3]>90||b[1]>=b[3]||b[0]===b[2])fail('invalid bbox');}
    const priority=Object.hasOwn(m,'territoryId')?5:m.territoryIds?4:m.bbox&&m.sourceCountry?3:m.bbox?2:m.sourceCountry?1:0;
    return {...rule,priority,territorySet:m.territoryIds?new Set(m.territoryIds):null};
  }).sort((a,b)=>compare(a.id,b.id));
  const overrides=config.overrides.map(row=>({...row,source:row.source||'Mandate World 1700: authored gameplay decision; no historical boundary claim'}));
  validateOverrides({version:1,overrides},config.polities,hierarchy);
  return {rules,overrides};
}
function matches(rule,t,point){
  const m=rule.match;
  if(m.territoryId!==undefined&&m.territoryId!==t.id||rule.territorySet&&!rule.territorySet.has(t.id)||m.sourceCountry!==undefined&&m.sourceCountry!==t.adm0Id)return false;
  if(m.bbox){const [w,s,e,n]=m.bbox,[x,y]=point;if(y<s||y>n||(w<e?x<w||x>e:x<w&&x>e))return false;}
  return true;
}
function authorWorld(config,{features,hierarchy,baseline,provenance={}}){
  const {rules,overrides}=validateAuthoring(config,hierarchy);validatePopulationScenario(baseline,hierarchy);
  const byId=new Map(features.map(f=>[f.id,f])),territories=hierarchy.territories.slice().sort((a,b)=>compare(a.id,b.id));
  if(byId.size!==features.length||byId.size!==territories.length||territories.some(t=>!byId.has(t.id)))fail('canonical IDs/count changed');
  const population=new Map();for(const c of baseline.cohorts){if(!population.has(c.territoryId))population.set(c.territoryId,{population:0,urban:0,rural:0});const p=population.get(c.territoryId);p.population+=c.count;p[c.settlement]+=c.count;}
  const rows=[],owners={},controllers={},used=new Map();
  for(const t of territories){
    const f=byId.get(t.id),centroid=auditCentroid(f.geometry),areaKm2=area(polygons(f.geometry));
    if(!Number.isFinite(areaKm2)||areaKm2<=0)fail('invalid canonical area');
    const levels=new Map();
    for(const rule of rules)if(matches(rule,t,centroid)){
      const prev=levels.get(rule.priority);if(prev&&prev.ownerPolityId!==rule.ownerPolityId)fail(`equal-specificity conflict ${prev.id}/${rule.id} at ${t.id}`);
      if(!prev)levels.set(rule.priority,rule);
    }
    const winner=levels.size?levels.get(Math.max(...levels.keys())):null,owner=winner?.ownerPolityId??null;
    if(owner!==null)owners[t.id]=owner;if(winner)used.set(winner.id,(used.get(winner.id)||0)+1);
    rows.push({territoryId:t.id,sourceCountry:t.adm0Id,centroid,areaKm2,...(population.get(t.id)||{population:0,urban:0,rural:0}),ownerPolityId:owner,controllerPolityId:owner,ruleId:winner?.id??null,rulePriority:winner?.priority??null,overridden:false});
  }
  const lookup=new Map(rows.map(r=>[r.territoryId,r])),overrideAudit=[];
  for(const row of overrides){const target=lookup.get(row.territoryId),previousOwnerPolityId=target.ownerPolityId,controller=Object.hasOwn(row,'controllerPolityId')?row.controllerPolityId:row.ownerPolityId;if(row.ownerPolityId===null)delete owners[row.territoryId];else owners[row.territoryId]=row.ownerPolityId;if(controller!==row.ownerPolityId)controllers[row.territoryId]=controller;Object.assign(target,{ownerPolityId:row.ownerPolityId,controllerPolityId:controller,overridden:true});overrideAudit.push({...row,previousOwnerPolityId});}
  const order=value=>Object.fromEntries(Object.entries(value).sort((a,b)=>compare(a[0],b[0])));
  const asset={version:1,year:1700,geography:hierarchy.id,status:'ready',owners:order(owners),controllers:order(controllers),provenance:{...provenance,datasetId:config.datasetId,description:config.description,method:'Authored gameplay rules; canonical centroid bbox membership; hierarchy sourceCountry is authoring proxy only; exact > list > bbox+country > bbox > country > fallback; no historical-basemaps input',manualOverrides:overrides}};
  validatePoliticalGeography(asset,config.polities,config.relationships,hierarchy);
  return {asset,rows,overrides:overrideAudit,rulesUsed:order(Object.fromEntries(used)),rulesUnused:rules.filter(r=>!used.has(r.id)).map(r=>r.id)};
}
module.exports={validateAuthoring,matches,authorWorld};
