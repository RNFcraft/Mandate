import { feature, mesh } from 'topojson-client';
import { MapModel } from './model.js';
import { WorldMap } from './renderer.js';
import { loadScenario } from '../scenarios/store.js';
import { prepare, path } from './geometry.js';
import { TerritoryLOD } from './lod.js';

try {
  const params = new URLSearchParams(location.search);
  const scenarioId = params.get('scenario') || 'modern';
  const [topology, geography, manifest] = await Promise.all(['/data/world.topo.json', '/data/adm2/hierarchy.json', '/data/adm2/manifest.json'].map(async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Map data: ${response.status}`);
    return response.json();
  }));
  const model = new MapModel(geography, await loadScenario(scenarioId));
  const geometry = name => feature(topology, topology.objects[name]).features.map(prepare);
  const regions = geometry('regions');
  const countries = geometry('countries');
  const regionalBorders = new Path2D(path(mesh(topology, topology.objects.regions, (a, b) => a !== b)));
  const map = new WorldMap(document.querySelector('canvas'), { regions, countries, regionalBorders }, model);
  map.lod = new TerritoryLOD(map,manifest);
  let timer, running=false, dirty=false, sequence=0;
  const refreshPolitical=async()=>{
    if(running){dirty=true;return;}running=true;dirty=false;
    const token=sequence;
    try {
      const response=await fetch('/api/political',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(model.exportScenario())});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      if(token===sequence){map.politicalFeatures=result.features.map(f=>({...prepare(f),owner:f.properties.owner}));map.politicalBorders={type:'GeometryCollection',geometries:result.features.map(f=>f.geometry)};map.ownershipBorders=new Path2D();for(const f of map.politicalFeatures)map.ownershipBorders.addPath(f.path);map.politicalComputeMs=result.computeMs;map.politicalPending=false;map.invalidate();}
    }catch(error){map.canvas.dispatchEvent(new CustomEvent('maperror',{detail:error.message}));map.politicalError=error.message;}
    finally{running=false;if(dirty||token!==sequence){clearTimeout(timer);timer=setTimeout(refreshPolitical,100);}}
  };
  model.addEventListener('change',event=>{map.invalidate();const ids=event.detail.owners;if(ids?.length===0)return;map.lod.invalidateOwnership(ids);sequence++;map.politicalPending=true;dirty=true;clearTimeout(timer);timer=setTimeout(refreshPolitical,180);});
  await refreshPolitical();
  // Public integration surface for future simulation and rendering layers.
  window.mandateMap = map;
  if (params.get('editor') === '1') {
    const { ScenarioEditor } = await import('../editor/editor.js');
    window.mandateEditor = new ScenarioEditor(map);
  }
} catch (error) {
  console.error(error);
  document.body.textContent = 'Не удалось загрузить карту. Подготовьте данные: npm run build, затем npm run build:adm2. Подробности — в консоли.';
}
