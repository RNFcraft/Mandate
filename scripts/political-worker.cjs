const { parentPort } = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');
const mapshaper = require('mapshaper');
const topology=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/processed/adm2/coarse.topo.json'),'utf8'));
const geometries=topology.objects.territories.geometries;
parentPort.on('message',async({id,ownership})=>{
  const start=performance.now();
  try{
    for(const g of geometries)g.properties={owner:ownership[g.id]??'__neutral__'};
    // True polygon union removes overlapping reserve outlines from legacy ADM1.
    // It runs in a worker, never on the browser/camera thread.
    const output=await mapshaper.applyCommands('-i in.topo.json -dissolve2 owner -o out.geojson format=geojson precision=0.0001',{'in.topo.json':JSON.stringify(topology)});
    const collection=JSON.parse(output['out.geojson']);
    const features=collection.features.filter(f=>f.geometry).map(f=>({...f,id:f.properties.owner==='__neutral__'?null:f.properties.owner,properties:{owner:f.properties.owner==='__neutral__'?null:f.properties.owner}})).sort((a,b)=>a.id===null?-1:b.id===null?1:a.id.localeCompare(b.id));
    parentPort.postMessage({id,result:{features,computeMs:performance.now()-start}});
  }catch(error){parentPort.postMessage({id,error:error.message});}
});
