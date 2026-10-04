const fs=require('node:fs/promises');
const path=require('node:path');
const mapshaper=require('mapshaper');
const {createReadStream}=require('node:fs');
const readline=require('node:readline');
const {feature,mergeArcs}=require('topojson-client');
const {bounds,area,polygons}=require('./adm2-spatial.cjs');
const ROOT=path.resolve(__dirname,'..');
const read=async file=>JSON.parse(await fs.readFile(path.join(ROOT,file),'utf8'));
const write=async(file,data)=>fs.writeFile(path.join(ROOT,file),JSON.stringify(data));
const MIN_RESIDUAL_KM2=.01;
const sortId=(a,b)=>a.id.localeCompare(b.id,'en');
function interior(g){
  // Take an interior horizontal interval of the largest connected component.
  const parts=polygons(g).map(p=>({p,area:area([p])})).sort((a,b)=>b.area-a.area);
  const p=parts[0].p,b=bounds({type:'Polygon',coordinates:p});
  for(const frac of [.5,.25,.75,.1,.9]){
    const y=b[1]+(b[3]-b[1])*frac,cuts=[];
    for(const ring of p)for(let i=1;i<ring.length;i++){const a=ring[i-1],c=ring[i];if((a[1]>y)!==(c[1]>y))cuts.push(a[0]+(y-a[1])*(c[0]-a[0])/(c[1]-a[1]));}
    cuts.sort((a,b)=>a-b);let best;
    for(let i=0;i+1<cuts.length;i+=2)if(!best||cuts[i+1]-cuts[i]>best.width)best={x:(cuts[i+1]+cuts[i])/2,width:cuts[i+1]-cuts[i]};
    if(best)return [best.x,y];
  }
  return p[0][0];
}
async function canonical(input='data/processed/canonical-baseline/source-detail.topo.json',metadata='data/processed/canonical-baseline/matching.json'){
  process.chdir(ROOT);
  const [source,matching,base,state]=await Promise.all([input,metadata,'client/data/world.topo.json','client/data/state.json'].map(read));
  const real=feature(source,source.objects.territories).features.filter(f=>f.id.startsWith('gb:')).sort(sortId);
  const degenerate=new Map(real.filter(f=>area(polygons(f.geometry))<1e-8).map(f=>[f.id.split(':').slice(2).join(':'),f]));
  if(degenerate.size){
    for await(const line of readline.createInterface({input:createReadStream('data/source/adm2/geoBoundariesCGAZ_ADM2.geojson'),crlfDelay:Infinity})){
      if(![...degenerate.keys()].some(id=>line.includes(id)))continue;
      const text=line.trim().replace(/,$/,'');if(!text.startsWith('{ "type": "Feature"'))continue;
      const raw=JSON.parse(text),f=degenerate.get(raw.properties.shapeID);if(f)f.geometry=raw.geometry;
    }
  }
  // Small real enclaves win over enclosing source polygons; ties use the stable ID.
  const sourceAreas=new Map(real.map(f=>[f.id,area(polygons(f.geometry))]));
  real.sort((a,b)=>sourceAreas.get(a.id)-sourceAreas.get(b.id)||sortId(a,b));
  const meta=new Map(matching.filter(r=>r.id.startsWith('gb:')).map(r=>[r.id,{...r,kind:'adm2'}]));
  const regions=feature(base,base.objects.regions).features.sort(sortId),countries=feature(base,base.objects.countries).features.sort(sortId);
  const regionNames=new Map(state.regions.map(r=>[r.id,r.name]));
  const target=[];
  for(const f of regions){const adm0Id=state.owners[f.id],id=`residual:${adm0Id}:${f.id}`;meta.set(id,{id,name:`Residual · ${regionNames.get(f.id)}`,adm0Id,adm1Id:f.id,kind:'residual',match:'residual',confidence:null,sourceFallbackId:`fallback:${f.id}`});target.push({...f,id});}
  for(const f of countries){const id=`residual:${f.id}:unassigned`;meta.set(id,{id,name:`Residual · ${state.countries.find(c=>c.id===f.id).name}`,adm0Id:f.id,adm1Id:null,kind:'residual',match:'residual',confidence:null});target.push({...f,id});}
  await fs.mkdir('data/processed/canonical',{recursive:true});
  const inputFeatures=[...real,...target].map(f=>({type:'Feature',geometry:f.geometry,properties:{id:f.id}}));
  await write('data/processed/canonical/input.geojson',{type:'FeatureCollection',features:inputFeatures});
  console.log(`Canonical overlay: ${real.length} real + ${target.length} coverage targets`);
  // Stable source order: real ADM2 first, residual ADM1 next, country-only gaps last.
  // Clean constructs noded tiles and assigns each tile to exactly one priority feature.
  await mapshaper.runCommands('-i data/processed/canonical/input.geojson name=territories -clean overlap-rule=min-id gap-fill-area=0 sliver-control=0 snap-interval=0.000001 allow-empty -o data/processed/canonical/clean.topo.json format=topojson no-quantization');
  const clean=await read('data/processed/canonical/clean.topo.json');
  const decoded=feature(clean,clean.objects.territories).features;
  const retained=[],excluded=[],emptyReal=[];
  for(const f of decoded){
    f.id=f.properties.id;
    if(!f.geometry||!f.geometry.coordinates.length){if(f.id.startsWith('gb:'))emptyReal.push(f.id);else excluded.push({id:f.id,areaKm2:0});continue;}
    if(f.id.startsWith('residual:')){
      const parts=polygons(f.geometry),kept=[];
      for(const p of parts){const km2=area([p]);if(km2>=MIN_RESIDUAL_KM2)kept.push(p);else excluded.push({id:f.id,areaKm2:km2});}
      if(!kept.length)continue;
      f.geometry={type:'MultiPolygon',coordinates:kept};
    }
    retained.push(f);
  }
  if(emptyReal.length)throw new Error(`Canonical overlay removed real ADM2 geometry: ${emptyReal.join(', ')}`);
  await write('data/processed/canonical/retained.geojson',{type:'FeatureCollection',features:retained});
  // A second topological pass nodes any shared boundaries affected by residual filtering.
  await mapshaper.runCommands('-i data/processed/canonical/retained.geojson name=territories -clean overlap-rule=min-id gap-fill-area=0 sliver-control=0 snap-interval=0.000001 -o data/processed/canonical/atomic.topo.json format=topojson no-quantization');
  // Re-node the final serialization, preserving exact shared coordinates. A further
  // quantization step would introduce crossing slivers and thin uncovered strips.
  await mapshaper.runCommands('-i data/processed/canonical/atomic.topo.json -clean overlap-rule=min-id gap-fill-area=0 sliver-control=0 -o data/processed/canonical/final.topo.json format=topojson no-quantization');
  const topology=await read('data/processed/canonical/final.topo.json');
  for(const g of topology.objects.territories.geometries){g.id=g.properties.id;delete g.properties;}
  const features=feature(topology,topology.objects.territories).features;
  const records=[];
  for(const f of features){if(!f.geometry)throw new Error(`Empty atom ${f.id}`);const r=meta.get(f.id);records.push({...r,bounds:bounds(f.geometry),representative:interior(f.geometry),areaKm2:area(polygons(f.geometry))});}
  const present=new Set(records.map(r=>r.id));
  if(real.some(f=>!present.has(f.id)))throw new Error('Real ADM2 ID set changed');
  const mapping=matching.filter(r=>r.match==='fallback').map(r=>{const id=`residual:${r.adm0Id}:${r.adm1Id}`,next=records.find(n=>n.id===id);return {from:r.id,to:next?[id]:[],status:next?'residual-only':'fully-covered',residualAreaKm2:next?.areaKm2||0};});
  const migration={from:'mandate-adm2-v1',to:'mandate-atomic-v1',fallbacks:mapping,removedIds:matching.filter(r=>r.match==='fallback').map(r=>r.id),addedIds:records.filter(r=>r.kind==='residual').map(r=>r.id)};
  const report={version:1,realCount:real.length,residualCount:records.length-real.length,atomicCount:records.length,previousFallbackCount:matching.filter(r=>r.match==='fallback').length,minimumResidualPartKm2:MIN_RESIDUAL_KM2,snapDegrees:.000001,priority:'real ADM2 by ascending area then stable ID; ADM1 coverage by stable ID; ADM0 coverage by stable ID',repairedDegenerateSourceIds:[...degenerate.values()].map(f=>f.id).sort(),excludedPartCount:excluded.filter(r=>r.areaKm2>0).length,excludedAreaKm2:excluded.reduce((n,r)=>n+r.areaKm2,0),fullyCoveredFallbackCount:mapping.filter(r=>r.to.length===0).length,retainedFallbackAsResidualCount:mapping.filter(r=>r.to.length).length};
  await write('data/processed/canonical/atomic.topo.json',topology);await write('data/processed/canonical/matching.json',records);await write('data/processed/canonical/migration.json',migration);await write('data/processed/canonical/report.json',report);await write('data/processed/canonical/excluded.json',excluded);
  console.log(report);return {topology,records,migration,report,state};
}
module.exports={canonical,interior};
if(require.main===module)canonical().catch(e=>{console.error(e);process.exitCode=1;});
