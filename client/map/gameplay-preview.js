import {feature, mesh} from 'topojson-client';
import {unpackTopology} from './topology.js';
import {prepare, path} from './geometry.js';
import {WorldMap} from './renderer.js';

export async function gameplayPreview(){
  const [packed,provinces,qa]=await Promise.all(['provinces.topo','provinces','qa'].map(async name=>{
    const r=await fetch(`/data/map-v2/${name}.json`);if(!r.ok)throw new Error('Generate preview: node scripts/generate-gameplay-map.cjs');return r.json();
  }));
  const topology=await unpackTopology(packed),object=topology.objects.provinces;
  const regions=feature(topology,object).features.map(prepare),records=new Map(provinces.map(p=>[p.id,p]));
  const palette=['#a88e69','#748d73','#8395a3','#a17778','#999775','#7e8fa1','#b08e79','#8a809c','#6f9690','#a694af','#b2a078','#8a9c86','#9a7c64'];
  const colors=new Map();for(const p of provinces){const used=new Set(p.adjacency.map(id=>colors.get(id)));let i=0;while(used.has(palette[i]))i++;colors.set(p.id,palette[i]||`hsl(${colors.size*137.5%360} 35% 55%)`);}
  const model={revision:1,countries:new Map(provinces.map(p=>[p.id,{color:colors.get(p.id)}]))};
  const land=feature(topology,topology.objects.land).features.map(prepare);
  const map=new WorldMap(document.querySelector('canvas'),{regions,countries:land},model);
  // Preview-only display resolution; the production renderer stays unchanged.
  map.resize=()=>{WorldMap.prototype.resize.call(map);const ratio=devicePixelRatio||1;map.canvas.width=Math.ceil(map.width*ratio);map.canvas.height=Math.ceil(map.height*ratio);map.background=null;map.invalidate();};map.resize();
  map.lod={level:'far',update(){const close=map.zoom>=8;if(this.close===close)return;this.close=close;const active=close?regions:regions.filter(r=>{const p=records.get(r.id);return p.areaKm2>=qa.provenance.config.minProvinceArea||p.archipelago;});map.setInteractive(active);if(!active.some(r=>r.id===map.hoveredId))map.hoveredId=null;}};
  map.politicalFeatures=regions.map(r=>({...r,owner:r.id}));
  const borders=new Path2D(path(mesh(topology,object,(a,b)=>a!==b))),coastline=new Path2D(path(mesh(topology,topology.objects.land)));
  map.classifiedBorders={adm1:borders,coastline};
  // Draw province boundaries at every zoom level through the existing renderer.
  map.lod.level='middle';map.gameplayPreview={records,qa};window.mandateMap=map;
  const output=document.createElement('output');output.id='gameplay-inspect';
  Object.assign(output.style,{position:'fixed',left:'16px',top:'16px',padding:'12px',background:'#182c39ee',color:'#eee',pointerEvents:'none',maxWidth:'420px',font:'14px monospace',whiteSpace:'pre-wrap'});
  document.body.append(output);
  const inspect=()=>{const p=records.get(map.hoveredId||map.selectedId);output.textContent=p?`Map v2 preview — ${p.id}\nIntersected atoms: ${p.atomCount}\nArea: ${p.areaKm2.toFixed(1)} km²\nPopulation 1700: ${p.population.toLocaleString()}\nSeed: ${p.seedId||'island group'}\nLand component: ${p.componentId}\nCompactness: ${p.compactness.toFixed(3)}\nGeometry components: ${p.geometryComponents}`:`Map v2 · independent geometry preview\n${provinces.length} provinces · ${qa.atomCount} source atoms\nHover or click; wheel to zoom.`;};
  const modes=['normal','land','borders','density','area','compactness','islands'];
  const setMode=mode=>{if(!modes.includes(mode))mode='normal';map.gameplayPreview.mode=mode;
    for(const p of provinces){let color=colors.get(p.id);if(mode==='density')color=`hsl(${220-Math.min(1,Math.log1p(p.density)/7)*200} 45% 55%)`;if(mode==='area')color=`hsl(${220-Math.min(1,p.areaKm2/60000)*200} 45% 55%)`;if(mode==='compactness')color=p.compactness<qa.provenance.config.compactnessThreshold?'#d87668':'#748d73';if(mode==='islands')color=p.archipelago?'#ba9bc2':'#748d73';model.countries.get(p.id).color=color;}
    map.politicalFeatures=['land','borders'].includes(mode)?[]:regions.map(r=>({...r,owner:r.id}));map.classifiedBorders=mode==='land'?{coastline}:{adm1:borders,coastline};model.revision++;map.background=null;map.invalidate();};
  const locations={world:[0,0,1],europe:[15,49,9],india:[80,23,8],china:[105,35,5],japan:[138,36,16],indonesia:[120,-3,8],sahara:[15,24,5],siberia:[105,62,5],canada:[-110,63,5],alaska:[-152,65,7],australia:[134,-25,6],philippines:[122,12,14],aegean:[24,38,18],scandinavia:[17,64,8],britain:[-4,55,14],caribbean:[-70,18,9]};
  const focus=name=>{const [lon,lat,zoom]=locations[name]||locations.world;map.zoom=zoom;map.scale=map.baseScale*zoom;map.x=map.width/2-(lon+180)*map.scale;map.y=map.height/2-(90-lat)*map.scale;map.background=null;map.invalidate();};
  Object.assign(map.gameplayPreview,{setMode,focus,locations});
  const controls=document.createElement('div');Object.assign(controls.style,{position:'fixed',right:'16px',top:'16px',display:'flex',gap:'8px'});
  for(const [values,change]of [[modes,setMode],[Object.keys(locations),focus]]){const select=document.createElement('select');for(const value of values){const option=document.createElement('option');option.value=value;option.textContent=value==='borders'?'Land mask + gameplay borders':value;select.append(option);}select.addEventListener('change',()=>change(select.value));controls.append(select);}
  document.body.append(controls);setMode(new URLSearchParams(location.search).get('mapLayer')||'normal');
  map.canvas.addEventListener('pointermove',inspect);map.canvas.addEventListener('pointerleave',inspect);map.canvas.addEventListener('regionselect',inspect);inspect();map.invalidate();
}
