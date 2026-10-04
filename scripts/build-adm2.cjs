// Offline only: stream the 525 MiB source; never expose it to the HTTP client.
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const readline = require('node:readline');
const path = require('node:path');
const crypto = require('node:crypto');
const mapshaper = require('mapshaper');
const { feature } = require('topojson-client');
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);
const OUT = 'client/data/adm2';
const WORK = 'data/processed/adm2';
const SOURCE = 'data/source/adm2/geoBoundariesCGAZ_ADM2.geojson';
const polygons = g => g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
function bounds(g) {
  const b = [180,90,-180,-90];
  for (const p of polygons(g)) for (const ring of p) for(const [x,y] of ring){b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);}
  return b;
}
function ringContains(ring,x,y) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function contains(g,x,y) {return polygons(g).some(p=>ringContains(p[0],x,y)&&!p.slice(1).some(r=>ringContains(r,x,y)));}
// Interior scanline samples, including holes; avoids centroids outside concave polygons.
function samples(g,b) {
  const result=[];
  for(const fraction of [.25,.5,.75]){
    const y=b[1]+(b[3]-b[1])*fraction, cuts=[];
    for(const p of polygons(g))for(const r of p)for(let i=1;i<r.length;i++){
      const a=r[i-1],c=r[i];if((a[1]>y)!==(c[1]>y))cuts.push(a[0]+(y-a[1])*(c[0]-a[0])/(c[1]-a[1]));
    }
    cuts.sort((a,c)=>a-c);
    const spans=[];
    for(let i=0;i+1<cuts.length;i++){const x=(cuts[i]+cuts[i+1])/2;if(contains(g,x,y))spans.push({x,y,width:cuts[i+1]-cuts[i]});}
    spans.sort((a,c)=>c.width-a.width);result.push(...spans.slice(0,2).map(s=>[s.x,s.y]));
  }
  return result.length?result:[polygons(g)[0][0][0]];
}
let arcNeighbors;
function subset(t, geometries) {
  const ids=new Map(),arcs=[];
  const mapArc=n=>{const key=n<0?~n:n;if(!ids.has(key)){ids.set(key,arcs.length);arcs.push(t.arcs[key]);}const i=ids.get(key);return n<0?~i:i;};
  const nested=a=>Array.isArray(a)?a.map(nested):mapArc(a);
  const gs=geometries.map(g=>({...g,arcs:nested(g.arcs)}));
  return {type:'Topology',transform:t.transform,objects:{territories:{type:'GeometryCollection',geometries:gs}},arcs,neighbors:[...ids.keys()].map(i=>arcNeighbors[i])};
}
async function main(){
  await fs.mkdir(WORK,{recursive:true});await fs.mkdir(OUT,{recursive:true});await fs.mkdir(`${OUT}/chunks`,{recursive:true});
  const base=JSON.parse(await fs.readFile('client/data/world.topo.json','utf8'));
  const state=JSON.parse(await fs.readFile('client/data/state.json','utf8'));
  const baseOwners=state.owners;
  const countryIds=new Set(state.countries.map(c=>c.id)),countryParents=new Map();
  for(const [id,country]of Object.entries(baseOwners)){if(!countryParents.has(country))countryParents.set(country,[]);countryParents.get(country).push(id);}
  const adm1=feature(base,base.objects.regions).features;
  const grid=new Map();
  for(const f of adm1){const b=bounds(f.geometry);for(let x=Math.floor(b[0]/5);x<=Math.floor(b[2]/5);x++)for(let y=Math.floor(b[1]/5);y<=Math.floor(b[3]/5);y++){const key=`${x},${y}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(f);}}
  const groups=new Map(), territories=[], seen=new Set(), matched=new Set();let count=0;
  const append=async(group,text)=>{if(!groups.has(group)){groups.set(group,{buffer:'',started:false});await fs.writeFile(`${WORK}/${group}.geojson`,'{"type":"FeatureCollection","features":[');}
    const entry=groups.get(group);entry.buffer+=(entry.started?',':'')+text;entry.started=true;
    if(entry.buffer.length>512000){await fs.appendFile(`${WORK}/${group}.geojson`,entry.buffer);entry.buffer='';}
  };
  const hash=crypto.createHash('sha256');const input=createReadStream(SOURCE);input.on('data',b=>hash.update(b));
  for await(const line of readline.createInterface({input,crlfDelay:Infinity})){
    const text=line.trim().replace(/,$/,'');if(!text.startsWith('{ "type": "Feature"'))continue;
    const f=JSON.parse(text),p=f.properties;
    if(!p.shapeID||!p.shapeGroup)throw new Error('ADM2 source has no stable source ID');
    if(!/^[A-Za-z0-9_-]{1,32}$/.test(p.shapeGroup))throw new Error('Invalid source country tag');
    const id=`gb:${p.shapeGroup}:${p.shapeID}`;if(seen.has(id))throw new Error(`Duplicate ADM2 ID ${id}`);seen.add(id);
    const b=bounds(f.geometry),points=samples(f.geometry,b),votes=new Map();
    for(const [x,y] of points){const candidates=grid.get(`${Math.floor(x/5)},${Math.floor(y/5)}`)||[];
      const hits=candidates.filter(c=>contains(c.geometry,x,y));
      const hit=hits.find(c=>baseOwners[c.id]===p.shapeGroup)||(!countryIds.has(p.shapeGroup)?hits[0]:null);if(hit)votes.set(hit.id,(votes.get(hit.id)||0)+1);
    }
    let parent=[...votes.entries()].sort((a,c)=>c[1]-a[1]||a[0].localeCompare(c[0]))[0];
    if(!parent&&countryParents.get(p.shapeGroup)?.length===1)parent=[countryParents.get(p.shapeGroup)[0],points.length];
    const adm1Id=parent?.[0]||null,adm0Id=adm1Id?baseOwners[adm1Id]:p.shapeGroup;
    if(adm1Id)matched.add(adm1Id);
    territories.push({id,name:p.shapeName||id,adm0Id,adm1Id,sourceAdm0Id:p.shapeGroup,bounds:b,representative:points[Math.floor(points.length/2)],match:adm1Id?'interior-majority':'unmatched',confidence:parent?parent[1]/points.length:0});
    f.id=id;f.properties={id};await append(p.shapeGroup,JSON.stringify(f));
    if(++count%5000===0)console.log(`Streamed ${count} ADM2`);
  }
  const sourceHash=hash.digest('hex');
  // Explicit fallback territorial units preserve every legacy ADM1 in countries with missing ADM2 coverage.
  for(const f of adm1)if(!matched.has(f.id)){
    const id=`fallback:${f.id}`,b=bounds(f.geometry),points=samples(f.geometry,b);
    territories.push({id,name:state.regions.find(r=>r.id===f.id).name,adm0Id:baseOwners[f.id],adm1Id:f.id,bounds:b,representative:points[0],match:'fallback',confidence:1});
    await append('fallback',JSON.stringify({...f,id,properties:{id}}));
  }
  for(const [group,e]of groups)await fs.appendFile(`${WORK}/${group}.geojson`,e.buffer+']}');
  await fs.writeFile(`${WORK}/simplified.geojson`,'{"type":"FeatureCollection","features":[');let first=true;
  for(const group of [...groups.keys()].sort()){
    await mapshaper.runCommands(`-i ${WORK}/${group}.geojson name=territories -simplify weighted interval=500 keep-shapes -o ${WORK}/reduced.geojson format=geojson precision=0.00001`);
    const reduced=JSON.parse(await fs.readFile(`${WORK}/reduced.geojson`,'utf8'));
    for(const f of reduced.features){await fs.appendFile(`${WORK}/simplified.geojson`,(first?'':',')+JSON.stringify(f));first=false;}
    console.log(`Simplified ${group}: ${reduced.features.length}`);
    await fs.unlink(`${WORK}/${group}.geojson`);
  }
  await fs.appendFile(`${WORK}/simplified.geojson`,']}');
  await mapshaper.runCommands(`-i ${WORK}/simplified.geojson name=territories -o ${WORK}/detail.topo.json format=topojson quantization=1000000`);
  await mapshaper.runCommands(`-i ${WORK}/detail.topo.json -simplify weighted interval=6000 keep-shapes -o ${WORK}/coarse.topo.json format=topojson quantization=40000`);
  const t=JSON.parse(await fs.readFile(`${WORK}/detail.topo.json`,'utf8'));
  for(const g of t.objects.territories.geometries){g.id=g.properties.id;delete g.properties;}
  await fs.writeFile(`${WORK}/detail.topo.json`,JSON.stringify(t));
  const coarse=JSON.parse(await fs.readFile(`${WORK}/coarse.topo.json`,'utf8'));
  for(const g of coarse.objects.territories.geometries){g.id=g.properties.id;delete g.properties;}
  await fs.writeFile(`${WORK}/coarse.topo.json`,JSON.stringify(coarse));
  const meta=new Map(territories.map(r=>[r.id,r])),bins=new Map();
  arcNeighbors=t.arcs.map(()=>[]);
  const recordArcs=(arcs,id)=>{for(const arc of arcs)if(Array.isArray(arc))recordArcs(arc,id);else{const i=arc<0?~arc:arc;if(!arcNeighbors[i].includes(id))arcNeighbors[i].push(id);}};
  const territoryIndex=new Map(territories.map((r,i)=>[r.id,i]));
  for(const g of t.objects.territories.geometries)if(g.arcs)recordArcs(g.arcs,territoryIndex.get(g.id));
  for(const g of t.objects.territories.geometries){const r=meta.get(g.id),[x,y]=r.representative,key=`${Math.floor((x+180)/5)}-${Math.floor((y+90)/5)}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(g);}
  const chunks=[];let totalBytes=0;
  for(const [key,gs]of [...bins].sort((a,b)=>a[0].localeCompare(b[0]))){
    // Dense cells are split into bounded batches; manifest contains actual geometry bounds.
    for(let start=0;start<gs.length;start+=400){const geometries=gs.slice(start,start+400),id=`${key}-${start/400}`,b=[180,90,-180,-90];
      for(const g of geometries){const r=meta.get(g.id);for(let j=0;j<2;j++){b[j]=Math.min(b[j],r.bounds[j]);b[j+2]=Math.max(b[j+2],r.bounds[j+2]);}r.chunkId=id;}
      const data=JSON.stringify(subset(t,geometries));await fs.writeFile(`${OUT}/chunks/${id}.json`,data);const bytes=Buffer.byteLength(data);totalBytes+=bytes;chunks.push({id,bounds:b,bytes,count:geometries.length});
    }
  }
  await fs.writeFile(`${WORK}/matching.json`,JSON.stringify(territories));
  const hierarchy={id:'mandate-adm2-v1',adm0:state.countries.map(c=>({id:c.id,name:c.name})),adm1:state.regions.map(r=>({...r,adm0Id:baseOwners[r.id]})),territories:territories.map(({id,name,adm0Id,adm1Id,chunkId,match})=>({id,name,adm0Id,adm1Id,chunkId,...(match==='fallback'?{fallback:true}:{})}))};
  for(const r of territories)if(!hierarchy.adm0.some(c=>c.id===r.adm0Id))hierarchy.adm0.push({id:r.adm0Id,name:r.adm0Id});
  const hierarchyData=JSON.stringify(hierarchy);await fs.writeFile(`${OUT}/hierarchy.json`,hierarchyData);
  const adjacency=await require('./adm2-adjacency.cjs')(WORK,OUT);
  for(const c of chunks)c.bytes=adjacency.sizes.get(c.id);
  totalBytes=chunks.reduce((sum,c)=>sum+c.bytes,0);
  const report={source:SOURCE,sourceBytes:(await fs.stat(SOURCE)).size,sourceSha256:sourceHash,sourceCount:count,territoryCount:territories.length,fallbackCount:territories.filter(r=>r.match==='fallback').length,unmatchedCount:territories.filter(r=>r.match==='unmatched').length,ambiguousCount:territories.filter(r=>r.confidence<1&&r.adm1Id).length,chunkCount:chunks.length,chunkBytes:totalBytes,hierarchyBytes:Buffer.byteLength(hierarchyData),maxChunkBytes:Math.max(...chunks.map(c=>c.bytes)),detailBytes:(await fs.stat(`${WORK}/detail.topo.json`)).size,coarseBytes:(await fs.stat(`${WORK}/coarse.topo.json`)).size};
  await fs.writeFile(`${OUT}/manifest.json`,JSON.stringify({geography:hierarchy.id,chunks,report}));
  await fs.writeFile(`${WORK}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  const chunkIds=new Set(chunks.map(c=>c.id+'.json'));
  for(const file of await fs.readdir(`${OUT}/chunks`))if(/^\d+-\d+-\d+\.json$/.test(file)&&!chunkIds.has(file))await fs.unlink(path.join(OUT,'chunks',file));
  await fs.unlink(`${WORK}/simplified.geojson`);await fs.unlink(`${WORK}/reduced.geojson`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
