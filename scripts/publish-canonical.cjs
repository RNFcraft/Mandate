const fs=require('node:fs/promises');
const {feature,mergeArcs}=require('topojson-client');
const {packTopology}=require('./topology-codec.cjs');
const {remap}=require('../shared/topology-arcs.cjs');
async function publish(result){
  const {topology:t,records,migration,report,state}=result;
  const out='client/data/adm2';
  const grids=await Promise.all(['data/processed/adm2/source-detail.topo.json','client/data/world.topo.json'].map(async file=>JSON.parse(await fs.readFile(file,'utf8')).transform));
  const byId=new Map(records.map((r,i)=>[r.id,i]));
  const neighbors=t.arcs.map(()=>[]);
  const visit=(arcs,index)=>{for(const n of arcs)if(Array.isArray(n))visit(n,index);else{const ids=neighbors[n<0?~n:n];if(!ids.includes(index))ids.push(index);}};
  for(const g of t.objects.territories.geometries)visit(g.arcs,byId.get(g.id));
  if(neighbors.some(ids=>!ids.length||ids.length>2))throw new Error('Invalid canonical adjacency');
  t.neighbors=neighbors;
  const bins=new Map();
  for(const g of t.objects.territories.geometries){const [x,y]=records[byId.get(g.id)].representative,k=`${Math.floor((x+180)/5)}-${Math.floor((y+90)/5)}`;if(!bins.has(k))bins.set(k,[]);bins.get(k).push(g);}
  const batches=[],chunkOf=new Map();
  for(const [key,gs]of [...bins].sort((a,b)=>a[0].localeCompare(b[0],'en')))for(let start=0;start<gs.length;start+=400){const id=`${key}-${start/400}`,geometries=gs.slice(start,start+400);for(const g of geometries){chunkOf.set(byId.get(g.id),id);records[byId.get(g.id)].chunkId=id;}batches.push({id,geometries});}
  const arcChunk=neighbors.map(ids=>ids.map(i=>chunkOf.get(i)).sort()[0]);
  await fs.mkdir(`${out}/chunks`,{recursive:true});
  const chunks=[];
  for(const {id,geometries}of batches){
    const chunk=remap(t,{territories:geometries},neighbors);
    chunk.drawArcs=chunk.arcIds.map(i=>arcChunk[i]===id);
    const b=[180,90,-180,-90];for(const g of geometries){const r=records[byId.get(g.id)];for(let j=0;j<2;j++){b[j]=Math.min(b[j],r.bounds[j]);b[j+2]=Math.max(b[j+2],r.bounds[j+2]);}}
    const json=JSON.stringify(packTopology(chunk,grids));await fs.writeFile(`${out}/chunks/${id}.json`,json);chunks.push({id,bounds:b,count:geometries.length,bytes:Buffer.byteLength(json)});
  }
  const grouped=key=>{
    const groups=new Map();for(const g of t.objects.territories.geometries){const id=records[byId.get(g.id)][key];if(id===null)continue;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(g);}
    return [...groups].sort((a,b)=>a[0].localeCompare(b[0],'en')).map(([id,gs])=>({...mergeArcs(t,gs),id}));
  };
  const derived=remap(t,{regions:grouped('adm1Id'),countries:grouped('adm0Id')});
  // Every derived boundary is an arc of the exact same final atom topology.
  await fs.writeFile(`${out}/derived.topo.json`,JSON.stringify(packTopology(derived,grids)));
  const hierarchy={id:'mandate-atomic-v1',adm0:state.countries.map(c=>({id:c.id,name:c.name})),adm1:state.regions.map(r=>({...r,adm0Id:state.owners[r.id]})),territories:records.map(({id,name,adm0Id,adm1Id,chunkId,kind})=>({id,name,adm0Id,adm1Id,chunkId,kind})),migration};
  for(const r of records)if(!hierarchy.adm0.some(c=>c.id===r.adm0Id))hierarchy.adm0.push({id:r.adm0Id,name:r.adm0Id});
  const hierarchyJson=JSON.stringify(hierarchy);
  const oldReport=JSON.parse(await fs.readFile('data/processed/adm2/report.json','utf8'));
  const combined={...oldReport,...report,territoryCount:records.length,fallbackCount:0,sourceCount:report.realCount,detailBytes:Buffer.byteLength(JSON.stringify(t)),coarseBytes:Buffer.byteLength(JSON.stringify(t)),chunkCount:chunks.length,chunkBytes:chunks.reduce((n,c)=>n+c.bytes,0),maxChunkBytes:Math.max(...chunks.map(c=>c.bytes)),hierarchyBytes:Buffer.byteLength(hierarchyJson),derivedBytes:(await fs.stat(`${out}/derived.topo.json`)).size};
  await fs.writeFile(`${out}/hierarchy.json`,hierarchyJson);
  await fs.writeFile(`${out}/manifest.json`,JSON.stringify({geography:hierarchy.id,arcGrids:grids,chunks,report:combined}));
  for(const [name,data]of Object.entries({'detail.topo':t,'coarse.topo':t,matching:records,migration,report:combined}))await fs.writeFile(`data/processed/adm2/${name}.json`,JSON.stringify(data));
  const ids=new Set(chunks.map(c=>c.id+'.json'));for(const file of await fs.readdir(`${out}/chunks`))if(/^\d+-\d+-\d+\.json$/.test(file)&&!ids.has(file))await fs.unlink(`${out}/chunks/${file}`);
  console.log(`Published ${records.length} atoms / ${chunks.length} chunks`);
  return combined;
}
module.exports={publish,remap};
if(require.main===module)(async()=>{const t=JSON.parse(await fs.readFile('data/processed/canonical/atomic.topo.json','utf8')),records=JSON.parse(await fs.readFile('data/processed/canonical/matching.json','utf8')),migration=JSON.parse(await fs.readFile('data/processed/canonical/migration.json','utf8')),report=JSON.parse(await fs.readFile('data/processed/canonical/report.json','utf8')),state=JSON.parse(await fs.readFile('client/data/state.json','utf8'));await publish({topology:t,records,migration,report,state});})().catch(e=>{console.error(e);process.exitCode=1;});
