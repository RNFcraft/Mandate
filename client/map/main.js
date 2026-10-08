import {feature} from 'topojson-client';
import {MapModel} from './model.js';
import {WorldMap} from './renderer.js';
import {loadScenario} from '../scenarios/store.js';
import {prepare} from './geometry.js';
import {unpackTopology} from './topology.js';
import kernel from '../../shared/simulation.cjs';
import {gameControls} from '../game/controls.js';
import {gameplayPreview} from './gameplay-preview.js';
import {updateProvincePolitics} from './province-borders.js';
import {EconomyLayer} from './economy-layer.js';
try {
  const params=new URLSearchParams(location.search);
  if(params.get('mapPreview')==='gameplay')await gameplayPreview();
  else if(params.get('mapDebug')==='atomic'){const {atomicDebug}=await import('./atomic-debug.js');await atomicDebug();}
  else {
    const [packed,geography,manifest]=await Promise.all(['provinces.topo','hierarchy','manifest'].map(async name=>{const response=await fetch('/data/map-v2/'+name+'.json');if(!response.ok)throw Error('Missing frozen Map v2 data');return response.json();}));
    if(manifest.geographyId!==geography.id||manifest.provinceCount!==5001)throw Error('Frozen geography manifest mismatch');
    const topology=await unpackTopology(packed),initial=await loadScenario(params.get('scenario')||'modern',{population:params.get('editor')!=='1',politicalPreview:params.get('politicalPreview')||false});
    const simulation=params.get('editor')==='1'?null:new kernel.Simulation(initial,geography),model=new MapModel(geography,initial,{simulation});
    const regions=feature(topology,topology.objects.provinces).features.map(prepare),land=feature(topology,topology.objects.land).features.map(prepare);
    const map=new WorldMap(document.querySelector('canvas'),{regions,countries:land},model);
    // Full frozen province geometry remains interactive at every zoom; no ADM LOD.
    map.lod={level:'far',update(){this.level=map.zoom>=2?'middle':'far';}};
    const refresh=()=>updateProvincePolitics(map,topology,regions);model.addEventListener('change',refresh);refresh();window.mandateMap=map;
    if(simulation){
      window.mandateSimulation=simulation;window.mandateGameControls=gameControls(simulation,geography);window.inspectPoliticalTerritory=id=>({...simulation.territoryPoliticalState(id),population:simulation.populationSummary(id).total});
      let presentation={};
      try{const response=await fetch(`/api/scenarios/${encodeURIComponent(initial.scenario.id)}/economy-visuals`);if(response.ok)presentation=await response.json();}catch{}
      window.mandateEconomyLayer=new EconomyLayer(map,simulation,presentation);
      if(params.get('economyDemo')==='1'&&initial.scenario.id==='economy-visual-demo'){
        const points=window.mandateEconomyLayer.objects.map(o=>o.point);
        if(points.length){const center=[0,1].map(axis=>(Math.min(...points.map(p=>p[axis]))+Math.max(...points.map(p=>p[axis])))/2);
          map.zoom=64;map.scale=map.baseScale*map.zoom;map.x=map.width/2-center[0]*map.scale;map.y=map.height/2-center[1]*map.scale;map.invalidate();}
      }
    }
    if(simulation&&(params.get('politicalDebug')==='1'||params.get('politicalPreview'))){
      const output=document.createElement('output');output.id='political-inspect';output.textContent=initial.politicalPreview?'Political PREVIEW (not published)':initial.politicalGeography?.status==='published'?'Published political geography':'Historical geography is draft; current ownership is DEV TEST DATA';document.body.append(output);
      map.canvas.addEventListener('regionselect',event=>{if(simulation.ownership.has(event.detail.regionId))output.textContent=JSON.stringify(window.inspectPoliticalTerritory(event.detail.regionId));});
    }
    if(params.get('editor')==='1'){const {ScenarioEditor}=await import('../editor/editor.js');window.mandateEditor=new ScenarioEditor(map);}
  }
} catch(error){console.error(error);document.body.textContent='Unable to load frozen Map v2: '+error.message;}
