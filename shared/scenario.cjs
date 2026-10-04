const TAG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
function validateScenario(data, regionIds) {
  const fail = message => { throw new Error(message); };
  if (!data || typeof data !== 'object') fail('Некорректный сценарий');
  const meta = data.scenario;
  if (!meta || typeof meta.id !== 'string') fail('Некорректный ID сценария');
  if (!meta || !TAG.test(meta.id) || !Number.isInteger(meta.year) || meta.year < 1700 || meta.year > 9999 || typeof meta.name !== 'string' || !meta.name.trim() || meta.name.length > 160 || !((meta.version === 1 && meta.geography === 'natural-earth-admin1-v1') || (meta.version === 2 && meta.geography === 'mandate-adm2-v1') || (meta.version===3&&meta.geography==='mandate-atomic-v1'))) fail('Некорректные параметры сценария');
  if (!Array.isArray(data.countries)) fail('Ожидается список государств');
  const ids = new Set();
  for (const c of data.countries) {
    if (!c || typeof c.id !== 'string' || !TAG.test(c.id) || ids.has(c.id)) fail('ID государства должен быть уникальным');
    ids.add(c.id);
    for (const field of ['name', 'shortName', 'governmentType']) if (typeof c[field] !== 'string' || !c[field].trim() || c[field].length > 160) fail(`Некорректное поле ${field}`);
    if (!/^#[0-9a-f]{6}$/i.test(c.color)) fail('Некорректный цвет');
    if (c.capitalRegionId !== null && !regionIds.has(c.capitalRegionId)) fail('Неизвестный столичный регион');
  }
  if (!data.ownership || Array.isArray(data.ownership) || typeof data.ownership !== 'object') fail('Некорректное владение');
  if (Object.keys(data.ownership).length !== regionIds.size) fail('Сценарий должен содержать все географические регионы');
  for (const id of regionIds) if (!Object.hasOwn(data.ownership, id) || (data.ownership[id] !== null && !ids.has(data.ownership[id]))) fail(`Некорректный владелец региона ${id}`);
  for (const c of data.countries) if (c.capitalRegionId !== null && data.ownership[c.capitalRegionId] !== c.id) fail('Столица должна принадлежать государству');
  if (data.controllers !== undefined) {
    if (!data.controllers || typeof data.controllers !== 'object' || Array.isArray(data.controllers)) fail('Некорректный слой контроля');
    for (const [id, controller] of Object.entries(data.controllers)) if (!regionIds.has(id) || (controller !== null && !ids.has(controller))) fail('Некорректный контролёр');
  }
  return data;
}
function migrateLegacy(data, hierarchy) {
  if(hierarchy.id==='mandate-atomic-v1')return migrateAtomic(data,hierarchy);
  if(data.scenario.version===2){validateScenario(data,new Set(hierarchy.territories.map(r=>r.id)));return data;}
  validateScenario(data,new Set(hierarchy.adm1.map(r=>r.id)));
  const children=new Map();for(const r of hierarchy.territories){if(!children.has(r.adm1Id))children.set(r.adm1Id,[]);children.get(r.adm1Id).push(r);}
  const ownership=Object.fromEntries(hierarchy.territories.map(r=>[r.id,r.adm1Id?data.ownership[r.adm1Id]:null]));
  const countries=data.countries.map(c=>{const capital=c.capitalRegionId?(children.get(c.capitalRegionId)||[]).find(r=>ownership[r.id]===c.id)?.id:null;
    if(c.capitalRegionId&&!capital)throw new Error(`Cannot migrate capital ${c.capitalRegionId}`);
    return {...c,capitalRegionId:capital||null,...(c.capitalRegionId?{legacyCapitalRegionId:c.capitalRegionId,capitalMigration:'representative-child'}:{})};});
  const migrated={scenario:{...data.scenario,version:2,geography:hierarchy.id},countries,ownership};
  if(data.controllers)migrated.controllers=Object.fromEntries(hierarchy.territories.filter(r=>Object.hasOwn(data.controllers,r.adm1Id)).map(r=>[r.id,data.controllers[r.adm1Id]]));
  validateScenario(migrated,new Set(hierarchy.territories.map(r=>r.id)));return migrated;
}
function migrateAtomic(data,hierarchy){
  const currentIds=new Set(hierarchy.territories.map(r=>r.id));
  if(data.scenario.version===3){validateScenario(data,currentIds);return data;}
  const legacyIds=new Set([...hierarchy.territories.filter(r=>r.kind==='adm2').map(r=>r.id),...hierarchy.migration.fallbacks.map(r=>r.from)]);
  validateScenario(data,data.scenario.version===1?new Set(hierarchy.adm1.map(r=>r.id)):legacyIds);
  const fromResidual=new Map(hierarchy.migration.fallbacks.flatMap(row=>row.to.map(id=>[id,row.from])));
  const parentOwners=new Map();
  if(data.scenario.version===2)for(const r of hierarchy.territories.filter(r=>r.kind==='adm2'&&r.adm1Id)){
    if(!parentOwners.has(r.adm1Id))parentOwners.set(r.adm1Id,new Set());parentOwners.get(r.adm1Id).add(data.ownership[r.id]);
  }
  const ownership={},controllers={},inferredResidualOwners={};let newNeutralCount=0;
  for(const r of hierarchy.territories){
    const from=data.scenario.version===1?r.adm1Id:r.kind==='adm2'?r.id:fromResidual.get(r.id);
    ownership[r.id]=from&&Object.hasOwn(data.ownership,from)?data.ownership[from]:null;
    if(r.kind==='residual'&&!from){
      const owners=parentOwners.get(r.adm1Id);
      if(owners?.size===1){ownership[r.id]=[...owners][0];inferredResidualOwners[r.id]=ownership[r.id];}
      if(ownership[r.id]===null)newNeutralCount++;
    }
    if(from&&data.controllers&&Object.hasOwn(data.controllers,from))controllers[r.id]=data.controllers[from];
  }
  const retiredOwnership={},retiredControllers={},effects=[];
  if(data.scenario.version===2)for(const row of hierarchy.migration.fallbacks){
    retiredOwnership[row.from]=data.ownership[row.from];if(data.controllers&&Object.hasOwn(data.controllers,row.from))retiredControllers[row.from]=data.controllers[row.from];
    effects.push({...row,owner:data.ownership[row.from]});
  }
  const countries=data.countries.map(c=>{
    let capital=c.capitalRegionId;
    if(data.scenario.version===1)capital=hierarchy.territories.find(r=>r.adm1Id===capital&&ownership[r.id]===c.id)?.id||null;
    else if(capital&&!currentIds.has(capital))capital=hierarchy.migration.fallbacks.find(row=>row.from===capital)?.to.find(id=>ownership[id]===c.id)||null;
    return {...c,capitalRegionId:capital,...(c.capitalRegionId!==capital&&c.capitalRegionId?{legacyCapitalRegionId:c.capitalRegionId,capitalMigration:capital?'residual-child':'retired-covered-territory'}:{})};
  });
  const migrated={scenario:{...data.scenario,version:3,geography:hierarchy.id,territoryMigration:{from:data.scenario.geography,newNeutralCount,inferredResidualOwners,retiredOwnership,retiredControllers,effects}},countries,ownership,...(data.controllers?{controllers}:{})};
  validateScenario(migrated,currentIds);return migrated;
}
module.exports = { TAG, validateScenario, migrateLegacy, migrateAtomic };
