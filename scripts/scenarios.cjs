const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { TAG, validateScenario, migrateLegacy } = require('../shared/scenario.cjs');
const {emptyPopulation,validatePopulationScenario}=require('../shared/population.cjs');
const root = path.resolve(__dirname, '../scenarios');
const geographyFile = path.resolve(__dirname, '../client/data/geography.json');
const hierarchyFile = path.resolve(__dirname, '../client/data/adm2/hierarchy.json');
let hierarchyPromise;
const hierarchy = () => hierarchyPromise ||= json(hierarchyFile);
let queue = Promise.resolve();
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
async function read(id) {
  const folder = path.join(root, id);
  const [scenario, countries, ownership] = await Promise.all(['scenario', 'countries', 'ownership'].map(name => json(path.join(folder, `${name}.json`))));
  let controllers;
  try { controllers = await json(path.join(folder, 'controllers.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { scenario, countries, ownership, ...(controllers ? { controllers } : {}) };
}
function reply(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(data)); }
async function handle(req, res, pathname) {
  if (pathname === '/api/scenarios' && req.method === 'GET') {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const scenarios = [];
    for (const e of entries) if (e.isDirectory() && TAG.test(e.name)) scenarios.push((await read(e.name)).scenario);
    reply(res, 200, scenarios); return;
  }
  const match = /^\/api\/scenarios\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})$/.exec(pathname);
  if (!match) { reply(res, 404, { error: 'Неизвестный маршрут' }); return; }
  const id = match[1];
  if (req.method === 'GET') {
    const h=await hierarchy(),data=migrateLegacy(await read(id),h);
    if(new URL(req.url,'http://localhost').searchParams.get('population')!=='1'){reply(res,200,data);return;}
    let population;
    try{population=await json(path.join(root,id,'population.json'));}
    catch(error){if(error.code==='ENOENT')population=emptyPopulation();else if(error instanceof SyntaxError){reply(res,400,{error:'Population: malformed population.json'});return;}else throw error;}
    try{validatePopulationScenario(population,h);}catch(error){reply(res,400,{error:error.message});return;}
    reply(res,200,{...data,population});return;
  }
  if (req.method !== 'PUT') { reply(res, 405, { error: 'Метод не поддерживается' }); return; }
  if (process.env.MANDATE_DEV_EDITOR === '0') { reply(res, 403, { error: 'DEV-сохранение отключено' }); return; }
  // Local development API accepts writes only from this server's origin.
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { reply(res, 403, { error: 'Некорректный источник запроса' }); return; }
  if (!(req.headers['content-type'] || '').startsWith('application/json')) { reply(res, 415, { error: 'Ожидается JSON' }); return; }
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    chunks.push(chunk); bytes += chunk.length;
    if (bytes > 16 * 1024 * 1024) { reply(res, 413, { error: 'Сценарий слишком большой' }); return; }
  }
  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const h=await hierarchy();
    const regions = data.scenario?.version===3?h.territories:data.scenario?.version===2&&h.id==='mandate-atomic-v1'?[...h.territories.filter(r=>r.kind==='adm2'),...h.migration.fallbacks.map(r=>({id:r.from}))]:data.scenario?.version===2?h.territories:(await json(geographyFile)).regions;
    validateScenario(data, new Set(regions.map(r => r.id)));
    if (data.scenario.id !== id) throw new Error('ID пути и сценария должны совпадать');
  } catch (error) { reply(res, 400, { error: error.message }); return; }
  const folder = path.join(root, id), token = randomUUID();
  const stage = path.join(root, `.stage-${token}`), backup = path.join(root, `.backup-${token}`);
  await fs.mkdir(stage);
  let backedUp = false, published = false;
  try {
    // Preserve a one-time, byte-for-byte v1 backup before an explicit v2 save.
    try {
      const previous=await read(id);
      if(previous.scenario.version===1&&data.scenario.version>=2){
        const backupRoot=path.join(root,'.legacy-backups');await fs.mkdir(backupRoot,{recursive:true});
        try{await fs.access(path.join(backupRoot,id));}catch{await fs.cp(folder,path.join(backupRoot,id),{recursive:true,errorOnExist:true,force:false});}
      }
      if(previous.scenario.version<3&&data.scenario.version===3){
        const backupRoot=path.join(root,'.atomic-backups');await fs.mkdir(backupRoot,{recursive:true});
        try{await fs.access(path.join(backupRoot,id));}catch{await fs.cp(folder,path.join(backupRoot,id),{recursive:true,errorOnExist:true,force:false});}
      }
    }catch(error){if(error.code!=='ENOENT')throw error;}
    // Population is an independent authored asset, never supplied by the editor.
    try{await fs.copyFile(path.join(folder,'population.json'),path.join(stage,'population.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
    for (const [name, value] of Object.entries(data)) if (['scenario', 'countries', 'ownership', 'controllers'].includes(name)) await fs.writeFile(path.join(stage, `${name}.json`), JSON.stringify(value, null, 2));
    try { await fs.rename(folder, backup); backedUp = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await fs.rename(stage, folder); published = true; } catch (error) { if (backedUp) await fs.rename(backup, folder); throw error; }
    reply(res, 200, { saved: id });
  } finally {
    if (!published) await fs.rm(stage, { recursive: true, force: true });
    if (published && backedUp) await fs.rm(backup, { recursive: true, force: true });
  }
}
module.exports = function scenarios(req, res, pathname) {
  // Reads and writes are serialized so no reader sees a partially replaced folder.
  queue = queue.then(() => handle(req, res, pathname)).catch(error => {
    if (!res.headersSent) reply(res, error.code === 'ENOENT' ? 404 : 500, { error: error.code === 'ENOENT' ? 'Сценарий не найден' : 'Ошибка работы с файлами сценария' });
    else console.error(error);
  });
};
