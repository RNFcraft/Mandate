const { parentPort } = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');
const {mergeArcs}=require('topojson-client');
const {CLASSES,borderClass}=require('../shared/borders.cjs');
const {remap}=require('../shared/topology-arcs.cjs');
const {packTopology}=require('./topology-codec.cjs');
const topology=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/processed/adm2/detail.topo.json'),'utf8'));
const territories=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../client/data/adm2/hierarchy.json'),'utf8')).territories;
const geometries=topology.objects.territories.geometries;
const grids=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../client/data/adm2/manifest.json'),'utf8')).arcGrids;
const commonArcs=new Map(JSON.parse(fs.readFileSync(path.resolve(__dirname,'../client/data/adm2/derived.topo.json'),'utf8')).sourceArcIds.map((global,index)=>[global,index]));
parentPort.on('message',async({id,ownership})=>{
  const start=performance.now();
  try{
    // Only stitch already-noded arcs at runtime; no spatial GIS union or overlay.
    const groups=new Map();for(const g of geometries){const owner=ownership[g.id]??null;if(!groups.has(owner))groups.set(owner,[]);groups.get(owner).push(g);}
    const features=[...groups].map(([owner,gs])=>({...mergeArcs(topology,gs),id:owner,properties:{owner}})).sort((a,b)=>a.id===null?-1:b.id===null?1:a.id.localeCompare(b.id));
    const arcs=Object.fromEntries(CLASSES.filter(name=>name!=='adm2').map(name=>[name,[]]));
    for(let i=0;i<topology.neighbors.length;i++){const name=borderClass(topology.neighbors[i],territories,id=>ownership[id]??null);if(name!=='adm2')arcs[name].push([i]);}
    const borders=Object.entries(arcs).map(([name,arcs])=>({type:'MultiLineString',arcs,id:name}));
    const subset=remap(topology,{political:features,borders});
    subset.reusedArcs=subset.sourceArcIds.map(global=>commonArcs.has(global)?commonArcs.get(global):null);
    subset.arcs=subset.arcs.filter((arc,i)=>subset.reusedArcs[i]===null);
    delete subset.sourceArcIds;
    const prepared=packTopology(subset,grids,6);
    parentPort.postMessage({id,result:{topology:prepared,computeMs:performance.now()-start}});
  }catch(error){parentPort.postMessage({id,error:error.message});}
});
