import { feature } from 'topojson-client';
import { MapModel } from './model.js';
import { WorldMap } from './renderer.js';
import { loadScenario } from '../scenarios/store.js';
import { prepare, path } from './geometry.js';
import { TerritoryLOD } from './lod.js';
import { unpackTopology } from './topology.js';
import kernel from '../../shared/simulation.cjs';
import {gameControls} from '../game/controls.js';
import {gameplayPreview} from './gameplay-preview.js';

try {
  const params = new URLSearchParams(location.search);
  if(params.get('mapPreview')==='gameplay') {
    await gameplayPreview();
  } else {
  const scenarioId = params.get('scenario') || 'modern';
  const [topology, geography, manifest] = await Promise.all(['/data/adm2/derived.topo.json', '/data/adm2/hierarchy.json', '/data/adm2/manifest.json'].map(async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Map data: ${response.status}`);
    const data=await response.json();return url.endsWith('.topo.json')?unpackTopology(data):data;
  }));
  const initial=await loadScenario(scenarioId,{population:params.get('editor')!=='1',politicalPreview:params.get('politicalPreview')||false});
  const simulation=params.get('editor')==='1'?null:new kernel.Simulation(initial,geography);
  const model = new MapModel(geography,initial,{simulation});
  const geometry = name => feature(topology, topology.objects[name]).features.map(prepare);
  const regions = geometry('regions');
  const countries = geometry('countries');
  const map = new WorldMap(document.querySelector('canvas'), { regions, countries }, model);
  map.lod = new TerritoryLOD(map,manifest);
  let timer, running=false, dirty=false, sequence=0;
  const refreshPolitical=async()=>{
    if(running){dirty=true;return;}running=true;dirty=false;
    const token=sequence;
    try {
      const response=await fetch('/api/political',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(model.exportScenario())});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      if(token===sequence){const t=await unpackTopology(result.topology);if(token!==sequence)return;if(t.reusedArcs){let extra=0;const fresh=t.arcs;t.arcs=t.reusedArcs.map(index=>index===null?fresh[extra++]:topology.arcs[index]);delete t.reusedArcs;}const shapes=feature(t,t.objects.political).features;const borders=Object.fromEntries(t.objects.borders.geometries.map(g=>[g.id,feature(t,g).geometry]));map.politicalFeatures=shapes.map(f=>({...prepare(f),owner:f.properties.owner}));map.politicalBorders=borders.political;map.classifiedBorders=Object.fromEntries(Object.entries(borders).map(([name,g])=>[name,new Path2D(path(g))]));map.ownershipBorders=map.classifiedBorders.political;map.politicalGeneration=(map.politicalGeneration||0)+1;map.politicalComputeMs=result.computeMs;map.politicalPending=false;map.invalidate();}
    }catch(error){map.canvas.dispatchEvent(new CustomEvent('maperror',{detail:error.message}));map.politicalError=error.message;}
    finally{running=false;if(dirty||token!==sequence){clearTimeout(timer);timer=setTimeout(refreshPolitical,100);}}
  };
  model.addEventListener('change',event=>{map.invalidate();const ids=event.detail.owners;if(ids?.length===0)return;map.lod.invalidateOwnership(ids);sequence++;map.politicalPending=true;dirty=true;clearTimeout(timer);timer=setTimeout(refreshPolitical,180);});
  await refreshPolitical();
  // Public integration surface for future simulation and rendering layers.
  window.mandateMap = map;
  if(simulation){window.mandateSimulation=simulation;window.mandateGameControls=gameControls(simulation,geography);}
  if(simulation){
    window.inspectPoliticalTerritory=id=>({...simulation.territoryPoliticalState(id),population:simulation.populationSummary(id).total});
    if(params.get('politicalDebug')==='1'||params.get('politicalPreview')){
      const output=document.createElement('output');output.id='political-inspect';
      output.textContent=initial.politicalPreview?'Political PREVIEW (not published)':initial.politicalGeography?.status==='published'?'Published political geography':'Historical geography is draft; current ownership is DEV TEST DATA';
      document.body.append(output);
      map.canvas.addEventListener('regionselect',event=>{
        const id=event.detail.regionId;if(!simulation.ownership.has(id))return;
        output.textContent=JSON.stringify(window.inspectPoliticalTerritory(id));
      });
    }
  }
  if (params.get('editor') === '1') {
    const { ScenarioEditor } = await import('../editor/editor.js');
    window.mandateEditor = new ScenarioEditor(map);
  }
  }
} catch (error) {
  console.error(error);
  document.body.textContent = 'Не удалось загрузить карту. Подготовьте данные: npm run build, затем npm run build:adm2. Подробности — в консоли.';
}
