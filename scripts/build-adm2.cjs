// Offline only: stream the 525 MiB source; never expose it to the HTTP client.
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const readline = require('node:readline');
const path = require('node:path');
const crypto = require('node:crypto');
const mapshaper = require('mapshaper');
const { feature } = require('topojson-client');
const {gridIndex,countryOf,assess}=require('./adm2-spatial.cjs');
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);
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
async function main(){
  await fs.mkdir(WORK,{recursive:true});
  const base=JSON.parse(await fs.readFile('client/data/world.topo.json','utf8'));
  const state=JSON.parse(await fs.readFile('client/data/state.json','utf8'));
  const baseOwners=state.owners;
  const countryIds=new Set(state.countries.map(c=>c.id)),countryParents=new Map();
  for(const [id,country]of Object.entries(baseOwners)){if(!countryParents.has(country))countryParents.set(country,[]);countryParents.get(country).push(id);}
  const adm1=feature(base,base.objects.regions).features;
  const areaCandidates=gridIndex(adm1);
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
    const sourceCountry=countryOf(p.shapeGroup);
    const b=bounds(f.geometry),points=samples(f.geometry,b),votes=new Map();
    for(const [x,y] of points){const candidates=grid.get(`${Math.floor(x/5)},${Math.floor(y/5)}`)||[];
      const hits=candidates.filter(c=>contains(c.geometry,x,y));
      const hit=hits.find(c=>baseOwners[c.id]===sourceCountry);if(hit)votes.set(hit.id,(votes.get(hit.id)||0)+1);
    }
    let parent=[...votes.entries()].sort((a,c)=>c[1]-a[1]||a[0].localeCompare(c[0]))[0];
    if(!parent&&countryParents.get(sourceCountry)?.length===1)parent=[countryParents.get(sourceCountry)[0],points.length];
    // Preserve existing unresolved legacy links explicitly, never infer a new foreign
    // ADM1 for an unrecognised source tag. This keeps authored ownership compatible.
    const legacy=legacyLinks.get(id);
    if(!countryParents.has(sourceCountry)&&legacy?.adm1Id)parent=[legacy.adm1Id,0];
    let assessment,error;
    try{assessment=assess(f.geometry,areaCandidates(b),sourceCountry,baseOwners);}catch(e){error=e.message;}
    // A geometry-only correction must have near-total coverage and no close rival.
    // Reserve-only parents remain suggestions to avoid removing authored base IDs.
    if(assessment?.strong&&legacyRealParents.has(assessment.scores[0].id))parent=[assessment.scores[0].id,points.length];
    const adm1Id=parent?.[0]||null,adm0Id=adm1Id?baseOwners[adm1Id]:sourceCountry;
    const score=assessment?.scores.find(s=>s.id===adm1Id)?.share||0;
    const confidence=Number(Math.min(score,assessment?.margin||0).toFixed(6));
    const match=!adm1Id?'unmatched':assessment?.strong&&assessment.scores[0].id===adm1Id?'area-confident':'ambiguous';
    if(adm1Id)matched.add(adm1Id);
    territories.push({id,name:p.shapeName||id,adm0Id,adm1Id,sourceAdm0Id:p.shapeGroup,bounds:b,representative:points[Math.floor(points.length/2)],match,confidence,margin:Number((assessment?.margin||0).toFixed(6)),candidates:assessment?.scores.map(s=>({id:s.id,share:Number(s.share.toFixed(6))}))||[],...(error?{geometryError:error}:{}),...(!countryParents.has(sourceCountry)&&legacy?.adm1Id?{legacyUnresolved:true}:{})});
    f.id=id;f.properties={id};await append(p.shapeGroup,JSON.stringify(f));
    if(++count%5000===0)console.log(`Streamed ${count} ADM2`);
  }
  const sourceHash=hash.digest('hex');
  if(sourceHash!==baselineHash)throw new Error('ADM2 source differs from compatibility baseline; create an explicit migration before publishing');
  // Explicit fallback territorial units preserve every legacy ADM1 in countries with missing ADM2 coverage.
  for(const f of adm1)if(!matched.has(f.id)){
    const id=`fallback:${f.id}`,b=bounds(f.geometry),points=samples(f.geometry,b);
    territories.push({id,name:state.regions.find(r=>r.id===f.id).name,adm0Id:baseOwners[f.id],adm1Id:f.id,bounds:b,representative:points[0],match:'fallback',confidence:1});
    await append('fallback',JSON.stringify({...f,id,properties:{id}}));
  }
  const currentIds=new Set(territories.map(r=>r.id));
  const removedIds=[...legacyLinks.keys()].filter(id=>!currentIds.has(id));
  const addedIds=territories.filter(r=>!legacyLinks.has(r.id)).map(r=>r.id);
  const changedParents=territories.filter(r=>legacyLinks.get(r.id)?.adm1Id!==r.adm1Id).map(r=>({id:r.id,before:legacyLinks.get(r.id)?.adm1Id,after:r.adm1Id}));
  await fs.writeFile(`${WORK}/source-migration.json`,JSON.stringify({sourceSha256:sourceHash,removedIds,addedIds,changedParents,idMapping:{}},null,2));
  if(removedIds.length||addedIds.length||changedParents.length)throw new Error('Geography changed from ownership baseline; explicit migration is required before publishing');
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
  await mapshaper.runCommands(`-i ${WORK}/simplified.geojson name=territories -o ${WORK}/source-detail.topo.json format=topojson quantization=1000000`);
  await mapshaper.runCommands(`-i ${WORK}/source-detail.topo.json -simplify weighted interval=6000 keep-shapes -o ${WORK}/source-coarse.topo.json format=topojson quantization=40000`);
  const t=JSON.parse(await fs.readFile(`${WORK}/source-detail.topo.json`,'utf8'));
  for(const g of t.objects.territories.geometries){g.id=g.properties.id;delete g.properties;}
  await fs.writeFile(`${WORK}/source-detail.topo.json`,JSON.stringify(t));
  const coarse=JSON.parse(await fs.readFile(`${WORK}/source-coarse.topo.json`,'utf8'));
  for(const g of coarse.objects.territories.geometries){g.id=g.properties.id;delete g.properties;}
  await fs.writeFile(`${WORK}/source-coarse.topo.json`,JSON.stringify(coarse));
  await fs.writeFile(`${WORK}/source-matching.json`,JSON.stringify(territories));
  await fs.writeFile(`${WORK}/report.json`,JSON.stringify({source:SOURCE,sourceBytes:(await fs.stat(SOURCE)).size,sourceSha256:sourceHash,sourceCount:count,unmatchedCount:territories.filter(r=>r.match==='unmatched').length,ambiguousCount:territories.filter(r=>r.match==='ambiguous').length}));
  const result=await require('./canonical-mesh.cjs').canonical(`${WORK}/source-detail.topo.json`,`${WORK}/source-matching.json`);
  await require('./mesh-invariants.cjs')();
  await require('./publish-canonical.cjs').publish(result);
  await fs.unlink(`${WORK}/simplified.geojson`);await fs.unlink(`${WORK}/reduced.geojson`);
}
let legacyLinks,legacyRealParents,baselineHash;
// The checked-in baseline linkage fixes compatibility decisions across clean builds.
fs.readFile('data/map/adm2-baseline-links.json','utf8').then(text=>{
  const baseline=JSON.parse(text);baselineHash=baseline.sourceSha256;legacyLinks=new Map(baseline.territories.map(r=>[r.id,r]));legacyRealParents=new Set(baseline.territories.filter(r=>r.match!=='fallback'&&r.adm1Id).map(r=>r.adm1Id));return main();
}).catch(e=>{console.error(e);process.exitCode=1;});
