const TAG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
function validateScenario(data, regionIds) {
  const fail = message => { throw new Error(message); };
  if (!data || typeof data !== 'object') fail('Некорректный сценарий');
  const meta = data.scenario;
  if (!meta || typeof meta.id !== 'string') fail('Некорректный ID сценария');
  if (!meta || !TAG.test(meta.id) || !Number.isInteger(meta.year) || meta.year < 1700 || meta.year > 9999 || typeof meta.name !== 'string' || !meta.name.trim() || meta.name.length > 160 || !((meta.version === 1 && meta.geography === 'natural-earth-admin1-v1') || (meta.version === 2 && meta.geography === 'mandate-adm2-v1'))) fail('Некорректные параметры сценария');
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
module.exports = { TAG, validateScenario, migrateLegacy };
