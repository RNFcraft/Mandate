import {feature, mesh} from 'topojson-client';
import {unpackTopology} from './topology.js';
import {prepare, path} from './geometry.js';
import {WorldMap} from './renderer.js';

export async function gameplayPreview(){
  const [packed,provinces,qa]=await Promise.all(['provinces.topo','provinces','qa'].map(async name=>{
    const r=await fetch(`/data/map-v2/${name}.json`);if(!r.ok)throw new Error('Generate preview: node scripts/gameplay-provinces.cjs');return r.json();
  }));
  const topology=await unpackTopology(packed),object=topology.objects.provinces;
  const regions=feature(topology,object).features.map(prepare),records=new Map(provinces.map(p=>[p.id,p]));
  const palette=['#a88e69','#748d73','#8395a3','#a17778','#999775','#7e8fa1','#b08e79','#8a809c','#6f9690','#a694af','#b2a078','#8a9c86','#9a7c64'];
  const colors=new Map();for(const p of provinces){const used=new Set(p.adjacency.map(id=>colors.get(id)));let i=0;while(used.has(palette[i]))i++;colors.set(p.id,palette[i]||`hsl(${colors.size*137.5%360} 35% 55%)`);}
  const model={revision:1,countries:new Map(provinces.map(p=>[p.id,{color:colors.get(p.id)}]))};
  const map=new WorldMap(document.querySelector('canvas'),{regions,countries:[]},model);
  map.lod={level:'far',update(){}};
  map.politicalFeatures=regions.map(r=>({...r,owner:r.id}));
  map.classifiedBorders={adm1:new Path2D(path(mesh(topology,object,(a,b)=>a!==b))),coastline:new Path2D(path(mesh(topology,object,(a,b)=>a===b)))};
  // Draw province boundaries at every zoom level through the existing renderer.
  map.lod.level='middle';map.gameplayPreview={records,qa};window.mandateMap=map;
  const output=document.createElement('output');output.id='gameplay-inspect';
  Object.assign(output.style,{position:'fixed',left:'16px',top:'16px',padding:'12px',background:'#182c39ee',color:'#eee',pointerEvents:'none',maxWidth:'420px',font:'14px monospace',whiteSpace:'pre-wrap'});
  document.body.append(output);
  const inspect=()=>{const p=records.get(map.hoveredId||map.selectedId);output.textContent=p?`Map v2 preview — ${p.id}\nAtoms: ${p.atomCount}\nArea: ${p.areaKm2.toFixed(1)} km²\nPopulation 1700: ${p.population.toLocaleString()}\nDensity: ${p.density.toFixed(2)} / km²\nLand components: ${p.landComponents}`:`Map v2 · first generation preview\n${provinces.length} provinces · ${qa.atomCount} atoms\nHover or click a province; wheel to zoom.`;};
  map.canvas.addEventListener('pointermove',inspect);map.canvas.addEventListener('pointerleave',inspect);map.canvas.addEventListener('regionselect',inspect);inspect();map.invalidate();
}
