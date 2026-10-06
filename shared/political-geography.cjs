// Authored initial-state adapter. Runtime ownership/controllers remain the authority.
const {TAG}=require('./scenario.cjs');
const {borderClass}=require('./borders.cjs');
const compare=(a,b)=>a<b?-1:a>b?1:0;
const RELATIONS=['subject_of','personal_union','colonial_dependency','tributary_of','protectorate_of'];
const fail=message=>{throw Error(`Political geography: ${message}`);};
const plain=value=>value&&Object.getPrototypeOf(value)===Object.prototype;
function fields(value,required,optional=[]){if(!plain(value)||required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>!required.includes(k)&&!optional.includes(k)))fail('invalid fields');}
const text=value=>typeof value==='string'&&!!value.trim()&&value.length<=2000;
const id=value=>typeof value==='string'&&TAG.test(value)&&!['constructor','prototype','__proto__'].includes(value);
function validatePolities(polities){
  if(!Array.isArray(polities))fail('expected polity registry array');const ids=new Set();
  for(const p of polities){
    fields(p,['id','name','shortName','type','color']);
    if(!id(p.id)||ids.has(p.id)||!['name','shortName','type'].every(k=>text(p[k])&&p[k].length<=160)||!/^#[0-9a-f]{6}$/i.test(p.color))fail('invalid/duplicate polity');
    ids.add(p.id);
  }
  return ids;
}
function validateRelations(data,polities){
  fields(data,['version','relations']);if(data.version!==1||!Array.isArray(data.relations))fail('invalid relationship version/array');
  const ids=validatePolities(polities),seen=new Set();
  return data.relations.map(r=>{
    fields(r,['type','from','to'],['reason','source']);
    if(!RELATIONS.includes(r.type)||!ids.has(r.from)||!ids.has(r.to)||r.from===r.to||['reason','source'].some(k=>Object.hasOwn(r,k)&&!text(r[k])))fail('invalid relationship/reference');
    const [from,to]=r.type==='personal_union'?[r.from,r.to].sort(compare):[r.from,r.to],key=JSON.stringify([r.type,from,to]);
    if(seen.has(key))fail('duplicate relationship');seen.add(key);
    return {type:r.type,from,to,...(r.reason?{reason:r.reason}:{}),...(r.source?{source:r.source}:{})};
  }).sort((a,b)=>compare(a.type,b.type)||compare(a.from,b.from)||compare(a.to,b.to));
}
function validateOverrides(data,polities,hierarchy){
  fields(data,['version','overrides']);if(data.version!==1||!Array.isArray(data.overrides))fail('invalid overrides');
  const polityIds=validatePolities(polities),territories=new Set(hierarchy.territories.map(t=>t.id)),seen=new Set();
  for(const row of data.overrides){
    fields(row,['territoryId','ownerPolityId','reason','source'],['controllerPolityId']);
    if(!territories.has(row.territoryId))fail(`unknown override territory ${row.territoryId}`);
    if(seen.has(row.territoryId))fail(`duplicate/conflicting override ${row.territoryId}`);seen.add(row.territoryId);
    for(const key of ['ownerPolityId','controllerPolityId'])if(Object.hasOwn(row,key)&&row[key]!==null&&!polityIds.has(row[key]))fail(`unknown override polity ${row[key]}`);
    if(!text(row.reason)||!text(row.source))fail('override requires reason/source');
    if([row.reason,row.source].some(value=>/^[A-Za-z]:[\\/]/.test(value)||value.startsWith('/')))fail('override provenance must not contain absolute machine paths');
  }
  return data.overrides.slice().sort((a,b)=>compare(a.territoryId,b.territoryId));
}
function validatePoliticalGeography(asset,polities,relations,hierarchy){
  fields(asset,['version','year','geography','status','owners','controllers','provenance']);
  if(asset.version!==1||asset.year!==1700||asset.geography!==hierarchy.id||!['draft','ready','published'].includes(asset.status)||!plain(asset.provenance))fail('invalid political geography header/provenance');
  const ids=validatePolities(polities),territories=new Set(hierarchy.territories.map(t=>t.id));
  if(territories.size!==hierarchy.territories.length)fail('duplicate canonical territory');
  validateRelations(relations,polities);
  for(const key of ['owners','controllers']){
    if(!plain(asset[key]))fail(`invalid ${key}`);
    for(const [territory,polity]of Object.entries(asset[key])){
      if(!territories.has(territory))fail(`unknown territory ${territory}`);
      if(polity!==null&&!ids.has(polity))fail(`unknown polity ${polity}`);
      if(key==='controllers'&&polity===(asset.owners[territory]??null))fail('controller map must contain only differences from owner');
    }
  }
  return asset;
}
function initializePoliticalScenario(data,hierarchy){
  if(!Object.hasOwn(data,'politicalGeography'))return data;
  const polities=data.polities,relations=data.polityRelations;
  const asset=validatePoliticalGeography(data.politicalGeography,polities,relations,hierarchy);
  if(asset.status!=='published')return data; // Draft/preview never silently replace DEV fallback.
  if(data.scenario.year!==1700||data.scenario.geography!==asset.geography)fail('scenario target mismatch');
  const countries=polities.slice().sort((a,b)=>compare(a.id,b.id)).map(p=>({id:p.id,name:p.name,shortName:p.shortName,color:p.color,capitalRegionId:null,governmentType:p.type,polityType:p.type}));
  const ownership=Object.fromEntries(hierarchy.territories.slice().sort((a,b)=>compare(a.id,b.id)).map(t=>[t.id,asset.owners[t.id]??null]));
  const controllers=Object.fromEntries(Object.entries(asset.controllers).sort((a,b)=>compare(a[0],b[0])));
  return {...data,countries,ownership,controllers};
}
function territoryPoliticalState(state,territoryId){
  if(!Object.hasOwn(state.ownership,territoryId))fail(`unknown territory ${territoryId}`);
  const ownerPolityId=state.ownership[territoryId];
  return {territoryId,ownerPolityId,controllerPolityId:Object.hasOwn(state.controllers,territoryId)?state.controllers[territoryId]:ownerPolityId};
}
function politicalBorderArcs(topology,territories,state,{control=false}={}){
  if(!Array.isArray(topology.neighbors)||topology.neighbors.length!==topology.arcs.length)fail('canonical shared-arc neighbors required');
  const ownerOf=id=>{const row=territoryPoliticalState(state,id);return control?row.controllerPolityId:row.ownerPolityId;};
  const arcs=[];for(let i=0;i<topology.neighbors.length;i++)if(borderClass(topology.neighbors[i],territories,ownerOf)==='political')arcs.push(i);
  return arcs;
}
module.exports={RELATIONS,compare,validatePolities,validateRelations,validateOverrides,validatePoliticalGeography,initializePoliticalScenario,territoryPoliticalState,politicalBorderArcs};
