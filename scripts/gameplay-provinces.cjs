// SUPERSEDED: atomic-union experiment, retained for legacy/debug tests only.
// Player-facing geometry now comes from generate-gameplay-map.cjs.
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const {feature, mergeArcs} = require('topojson-client');
const {area, polygons} = require('./adm2-spatial.cjs');
const {remap} = require('../shared/topology-arcs.cjs');
const {packTopology} = require('./topology-codec.cjs');
const mapshaper = require('mapshaper');
const DEFAULTS = Object.freeze({target:12000, densityExponent:.35, densityFloor:1,
  islandAreaKm2:100, maritimeRadiusKm:250, cleanupIterations:3,
  tinyAreaKm2:5, compactnessThreshold:.015, tinyBorderKm:.01,
  sizePenalty:.3, compactnessPenalty:.6, internalRetain:.6, simplifyRepairIterations:5});
class Heap {
  constructor(){this.items=[];}
  push(item){const a=this.items;let i=a.length;a.push(item);while(i){const p=(i-1)>>1;if(a[p][0]<=item[0])break;a[i]=a[p];i=p;}a[i]=item;}
  pop(){const a=this.items,top=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1][0]<a[c][0])c++;if(a[c][0]>=last[0])break;a[i]=a[c];i=c;}a[i]=last;}return top;}
  get length(){return this.items.length;}
}
function distance(a,b){const dy=(a[1]-b[1])*Math.PI/180,dx=((a[0]-b[0]+540)%360-180)*Math.PI/180;
  return 6371.0088*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dy/2)**2+Math.cos(a[1]*Math.PI/180)*Math.cos(b[1]*Math.PI/180)*Math.sin(dx/2)**2)));}
function visit(arcs,fn){for(const a of arcs)if(Array.isArray(a))visit(a,fn);else fn(a<0?~a:a);}
function centroid(ps){
  // Centroid in the same cylindrical equal-area plane used by area(). Holes
  // subtract mass; circular longitude averaging handles dateline parts.
  let cx=0,cy=0,latitude=0,mass=0;
  for(const polygon of ps)for(let j=0;j<polygon.length;j++){
    const ring=polygon[j];let crossSum=0,sx=0,sy=0;
    for(let i=1;i<ring.length;i++){
      const x0=ring[i-1][0]*Math.PI/180,y0=Math.sin(ring[i-1][1]*Math.PI/180);
      const x1=ring[i][0]*Math.PI/180,y1=Math.sin(ring[i][1]*Math.PI/180),cross=x0*y1-x1*y0;
      crossSum+=cross;sx+=(x0+x1)*cross;sy+=(y0+y1)*cross;
    }
    if(Math.abs(crossSum)<1e-20)continue;
    const weight=Math.abs(crossSum)*(j===0?1:-1),x=sx/(3*crossSum),y=sy/(3*crossSum);
    cx+=Math.cos(x)*weight;cy+=Math.sin(x)*weight;latitude+=y*weight;mass+=weight;
  }
  return mass>0?[Math.atan2(cy,cx)*180/Math.PI,Math.asin(Math.max(-1,Math.min(1,latitude/mass)))*180/Math.PI]:ps[0][0][0];
}
function graph(topology,population,config=DEFAULTS){
  const geometries=[...topology.objects.territories.geometries].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const totals=new Map();for(const c of population.cohorts)totals.set(c.territoryId,(totals.get(c.territoryId)||0)+c.count);
  const atoms=geometries.map(g=>{const f=feature(topology,g),ps=polygons(f.geometry);
    // Baseline cohorts omit zero-population territories (see baseline metadata).
    const km2=area(ps),pop=totals.get(g.id)||0;
    return {id:g.id,geometry:g,areaKm2:km2,population:pop,density:km2?pop/km2:0,centroid:centroid(ps),adjacency:[],coastal:false};});
  const owners=topology.arcs.map(()=>[]),lengths=topology.arcs.map(a=>{let n=0;for(let i=1;i<a.length;i++)n+=distance(a[i-1],a[i]);return n;});
  atoms.forEach((a,i)=>visit(a.geometry.arcs,n=>{if(!owners[n].includes(i))owners[n].push(i);}));
  for(let n=0;n<owners.length;n++){const o=owners[n];if(!lengths[n])continue;if(o.length===1)atoms[o[0]].coastal=true;
    for(let i=0;i<o.length;i++)for(let j=i+1;j<o.length;j++){const link=(a,b)=>{const old=atoms[a].adjacency.find(e=>e.id===b);if(old)old.borderKm+=lengths[n];else atoms[a].adjacency.push({id:b,borderKm:lengths[n]});};link(o[i],o[j]);link(o[j],o[i]);}}
  const components=[],seen=new Set();for(let i=0;i<atoms.length;i++)if(!seen.has(i)){const members=[i];seen.add(i);for(let k=0;k<members.length;k++)for(const e of atoms[members[k]].adjacency)if(!seen.has(e.id)){seen.add(e.id);members.push(e.id);}const index=components.length;members.forEach(j=>atoms[j].component=index);components.push({members,areaKm2:members.reduce((s,j)=>s+atoms[j].areaKm2,0)});}
  for(const a of atoms){a.weight=Math.pow(config.densityFloor+a.density,config.densityExponent);a.mass=a.areaKm2*a.weight;a.adjacency.sort((x,y)=>x.id-y.id);}
  return {atoms,components,owners,lengths,geometries};
}
function partition(input,config=DEFAULTS){
  const {atoms,components}=input,labels=new Int32Array(atoms.length).fill(-1),dist=new Float64Array(atoms.length).fill(Infinity),seeds=[],small=[];
  const eligible=components.filter(c=>c.areaKm2>=config.islandAreaKm2||c.members.length>1);
  const target=Math.min(atoms.length,Math.max(eligible.length,config.target));
  const edge=(a,b)=>Math.max(.001,distance(a.centroid,b.centroid))*Math.sqrt((a.weight+b.weight)/2);
  const addSeed=i=>{const label=seeds.length;seeds.push(i);const heap=new Heap();dist[i]=0;heap.push([0,i]);while(heap.length){const [d,j]=heap.pop();if(d!==dist[j])continue;for(const e of atoms[j].adjacency){const nd=d+edge(atoms[j],atoms[e.id]);if(nd<dist[e.id]){dist[e.id]=nd;heap.push([nd,e.id]);}}}return label;};
  for(const c of eligible){const first=c.members.reduce((a,b)=>atoms[b].mass>atoms[a].mass?b:a);addSeed(first);}
  const candidates=eligible.flatMap(c=>c.members).sort((a,b)=>a-b);
  while(seeds.length<target){let best=-1,score=-1;for(const i of candidates)if(dist[i]>score){score=dist[i];best=i;}if(best<0||score===0)break;addSeed(best);}
  const sizes=seeds.map(()=>0),massTarget=candidates.reduce((s,i)=>s+atoms[i].mass,0)/Math.max(1,seeds.length),heap=new Heap();
  seeds.forEach((i,p)=>{labels[i]=p;sizes[p]=atoms[i].mass;});
  const enqueue=(i,p,d)=>{for(const e of atoms[i].adjacency)if(labels[e.id]<0){const a=atoms[e.id],s=atoms[seeds[p]];const cost=d+edge(atoms[i],a)*(1+config.sizePenalty*sizes[p]/massTarget)+config.compactnessPenalty*edge(s,a);heap.push([cost,e.id,p]);}};
  seeds.forEach((i,p)=>enqueue(i,p,0));while(heap.length){const [d,i,p]=heap.pop();if(labels[i]>=0)continue;labels[i]=p;sizes[p]+=atoms[i].mass;enqueue(i,p,d);}
  // Maritime membership is explicitly separate from land adjacency.
  const maritime=[];for(const c of components)if(labels[c.members[0]]<0){const i=c.members[0];let best=-1,near=config.maritimeRadiusKm;
    for(let j=0;j<atoms.length;j++)if(labels[j]>=0&&atoms[j].coastal){const d=distance(atoms[i].centroid,atoms[j].centroid);if(d<near){near=d;best=j;}}
    if(best>=0){c.members.forEach(j=>labels[j]=labels[best]);maritime.push({atomId:atoms[i].id,anchorAtomId:atoms[best].id,distanceKm:near});}
    else{const p=seeds.length;seeds.push(i);sizes.push(atoms[i].mass);c.members.forEach(j=>labels[j]=p);small.push(i);}}
  let repairs=0;const connectedWithout=(p,removed)=>{const members=[];for(let i=0;i<labels.length;i++)if(labels[i]===p&&i!==removed&&atoms[i].component===atoms[removed].component)members.push(i);if(!members.length)return false;const seen=new Set([members[0]]),q=[members[0]];for(let k=0;k<q.length;k++)for(const e of atoms[q[k]].adjacency)if(e.id!==removed&&labels[e.id]===p&&!seen.has(e.id)){seen.add(e.id);q.push(e.id);}return seen.size===members.length;};
  // Move minority boundary tails/enclaves only if the donor remains connected.
  for(let pass=0;pass<config.cleanupIterations;pass++){let moved=0;const counts=new Map();labels.forEach(p=>counts.set(p,(counts.get(p)||0)+1));for(let i=0;i<atoms.length;i++){const p=labels[i],a=atoms[i],borders=new Map();for(const e of a.adjacency)borders.set(labels[e.id],(borders.get(labels[e.id])||0)+e.borderKm);const own=borders.get(p)||0;const other=[...borders].filter(([q])=>q!==p).sort((x,y)=>y[1]-x[1]||x[0]-y[0])[0];if(!other)continue;
    const tiny=counts.get(p)===1&&a.areaKm2<config.tinyAreaKm2;
    if((tiny||other[1]>own*2&&a.mass<massTarget*.25)&& (tiny||connectedWithout(p,i))){labels[i]=other[0];counts.set(p,counts.get(p)-1);counts.set(other[0],counts.get(other[0])+1);moved++;}}
    repairs+=moved;if(!moved)break;}
  const groups=new Map();labels.forEach((p,i)=>{if(!groups.has(p))groups.set(p,[]);groups.get(p).push(i);});
  const provinces=[...groups.values()].sort((a,b)=>a[0]-b[0]).map((members,i)=>({id:`preview:${String(i+1).padStart(5,'0')}`,members}));
  return {provinces,maritime,repairs};
}
function statistics(values){const a=[...values].sort((a,b)=>a-b);return {min:a[0]||0,median:a[Math.floor(a.length*.5)]||0,p90:a[Math.floor(a.length*.9)]||0,max:a.at(-1)||0};}
function simplifyShared(topology,config){
  // Mapshaper operates on one shared ArcCollection; endpoints and all exterior
  // (coast/lake) vertices are locked. Never simplify each province separately.
  const api=mapshaper.internal,arcs=new api.ArcCollection(topology.arcs),owners=topology.arcs.map(()=>new Set());
  const geometries=topology.objects.provinces.geometries;
  geometries.forEach(g=>visit(g.arcs,n=>owners[n].add(g.id)));
  const before=arcs.getPointCount(),baseline=api.findSegmentIntersections(arcs).length;
  if(config.internalRetain===1&&!config.simplificationTolerance)return {verticesBefore:before,verticesAfter:before,segmentIntersections:baseline,applied:false};
  api.simplifyPaths(arcs,{method:'weighted_visvalingam',spherical:true});
  const data=arcs.getVertexData();let offset=0;
  data.nn.forEach((n,i)=>{if(owners[i].size===1)for(let j=offset;j<offset+n;j++)data.zz[j]=Infinity;offset+=n;});
  if(config.simplificationTolerance)arcs.setRetainedInterval(config.simplificationTolerance);
  else arcs.setRetainedPct(config.internalRetain);
  const shapes=geometries.flatMap(g=>g.type==='Polygon'?[g.arcs]:g.arcs).map(rings=>rings.map(r=>mapshaper.geom.getPlanarPathArea(r,arcs)<0?r.slice().reverse().map(n=>~n):r));
  api.keepEveryPolygon(arcs,[{geometry_type:'polygon',shapes}]);
  api.postSimplifyRepair(arcs);
  let crossings=api.findSegmentIntersections(arcs),restoredArcs=new Set();
  // Near-tangent source boundaries occasionally defeat vertex-level repair.
  // Restore only arcs involved in those crossings, then scan again.
  const arcForVertex=v=>{let lo=0,hi=data.ii.length;while(lo+1<hi){const mid=(lo+hi)>>1;if(data.ii[mid]<=v)lo=mid;else hi=mid;}return lo;};
  for(let pass=0;crossings.length>baseline&&pass<config.simplifyRepairIterations;pass++){
    for(const cross of crossings)for(const segment of [cross.a,cross.b]){const id=arcForVertex(segment[0]);restoredArcs.add(id);for(let j=data.ii[id];j<data.ii[id]+data.nn[id];j++)data.zz[j]=Infinity;}
    crossings=api.findSegmentIntersections(arcs);
  }
  const intersections=crossings.length;
  // Fail conservatively back to exact union if simplification adds crossings.
  if(intersections>baseline)return {verticesBefore:before,verticesAfter:before,segmentIntersections:baseline,rejectedIntersections:intersections,applied:false};
  topology.arcs=arcs.toArray();
  return {verticesBefore:before,verticesAfter:topology.arcs.reduce((s,a)=>s+a.length,0),segmentIntersections:intersections,baselineSegmentIntersections:baseline,restoredArcs:restoredArcs.size,applied:true};
}
function produce(topology,input,result,config=DEFAULTS){
  const {atoms,owners,lengths}=input,mapping={},metadata=[],geometries=[],counts=new Map(),adjacency=new Map();
  for(const p of result.provinces)for(const i of p.members){mapping[atoms[i].id]=p.id;counts.set(i,(counts.get(i)||0)+1);}
  const qa={provinceCount:result.provinces.length,atomCount:atoms.length,unassignedAtoms:atoms.filter((_,i)=>!counts.has(i)).length,duplicateAtoms:[...counts.values()].filter(n=>n>1).length,disconnectedMainlandProvinces:[],invalidPolygons:[],holes:0,suspiciousHoles:[],tinyProvinces:[],oneAtomProvinces:[],compactnessOutliers:[],standaloneTinyIslandProvinces:[],tinyBorderSegments:0,sharedBorderErrors:[],repairs:result.repairs};
  for(const p of result.provinces){const g=mergeArcs(topology,p.members.map(i=>atoms[i].geometry));g.id=p.id;geometries.push(g);const f=feature(topology,g);let perimeter=0;visit(g.arcs,n=>{perimeter+=lengths[n];if(lengths[n]<config.tinyBorderKm)qa.tinyBorderSegments++;});
    const km2=p.members.reduce((s,i)=>s+atoms[i].areaKm2,0),population=p.members.reduce((s,i)=>s+atoms[i].population,0),compactness=perimeter?4*Math.PI*km2/perimeter**2:0;
    const byComponent=new Map();for(const i of p.members){const c=atoms[i].component;if(!byComponent.has(c))byComponent.set(c,[]);byComponent.get(c).push(i);}
    for(const members of byComponent.values()){const seen=new Set([members[0]]),queue=[members[0]];for(let k=0;k<queue.length;k++)for(const e of atoms[queue[k]].adjacency)if(mapping[atoms[e.id].id]===p.id&&!seen.has(e.id)){seen.add(e.id);queue.push(e.id);}if(seen.size!==members.length)qa.disconnectedMainlandProvinces.push(p.id);}
    for(const polygon of polygons(f.geometry)){qa.holes+=polygon.length-1;for(const ring of polygon)if(ring.length<4||ring.some(q=>q.some(v=>!Number.isFinite(v)))||ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])qa.invalidPolygons.push(p.id);if(polygon.length>1)qa.suspiciousHoles.push({id:p.id,count:polygon.length-1});}
    if(km2<config.tinyAreaKm2)qa.tinyProvinces.push(p.id);if(p.members.length===1)qa.oneAtomProvinces.push(p.id);if(compactness<config.compactnessThreshold)qa.compactnessOutliers.push(p.id);
    if(km2<config.tinyAreaKm2&&p.members.every(i=>!atoms[i].adjacency.length))qa.standaloneTinyIslandProvinces.push(p.id);
    metadata.push({id:p.id,atomCount:p.members.length,areaKm2:km2,population,density:km2?population/km2:0,compactness,landComponents:byComponent.size});adjacency.set(p.id,new Set());}
  for(const a of atoms)for(const e of a.adjacency){const p=mapping[a.id],q=mapping[atoms[e.id].id];if(p!==q)adjacency.get(p).add(q);}
  const output=remap(topology,{provinces:geometries});const finalOwners=output.arcs.map(()=>[]);output.objects.provinces.geometries.forEach(g=>visit(g.arcs,n=>{if(!finalOwners[n].includes(g.id))finalOwners[n].push(g.id);}));
  finalOwners.forEach((o,n)=>{const expected=[...new Set(owners[output.sourceArcIds[n]].map(i=>mapping[atoms[i].id]))].sort();if(JSON.stringify([...o].sort())!==JSON.stringify(expected))qa.sharedBorderErrors.push(n);});
  qa.simplification=simplifyShared(output,config);
  qa.simplifiedInvalidPolygons=[];
  for(const f of feature(output,output.objects.provinces).features)for(const p of polygons(f.geometry))for(const r of p)
    if(r.length<4||r[0][0]!==r.at(-1)[0]||r[0][1]!==r.at(-1)[1]||r.some(q=>q.some(v=>!Number.isFinite(v))))qa.simplifiedInvalidPolygons.push(f.id);
  qa.atomsPerProvince=statistics(metadata.map(p=>p.atomCount));qa.areaKm2=statistics(metadata.map(p=>p.areaKm2));qa.population=statistics(metadata.map(p=>p.population));
  return {topology:output,mapping,provinces:metadata.map(p=>({...p,adjacency:[...adjacency.get(p.id)].sort()})),qa};
}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
  const args=process.argv.slice(2);if(args.includes('--help')){console.log('SUPERSEDED atomic-union debug generator. Use scripts/generate-gameplay-map.cjs for Map v2.\nnode scripts/gameplay-provinces.cjs [--target 12000] [--config config.json] [--out directory] [--qa]\nDefault output: client/data/map-v2-legacy. --qa regenerates legacy data.');return;}
  const value=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
  const config={...DEFAULTS,...(value('--config')?JSON.parse(await fs.readFile(value('--config'),'utf8')):{})};if(value('--target'))config.target=Number(value('--target'));if(!Number.isInteger(config.target)||config.target<1)throw new Error('target must be a positive integer');
  if(!(config.internalRetain>0&&config.internalRetain<=1))throw new Error('internalRetain must be in (0, 1]');
  const source='data/processed/canonical/atomic.topo.json',pop='data/population/baselines/1700/population.json';const [bytes,pbytes]=await Promise.all([fs.readFile(source),fs.readFile(pop)]);const topology=JSON.parse(bytes),population=JSON.parse(pbytes);
  console.log('Building atomic graph…');const input=graph(topology,population,config);console.log(`Partitioning ${input.atoms.length} atoms, ${input.components.length} land components…`);const result=partition(input,config);const out=produce(topology,input,result,config);
  const baseline=JSON.parse(await fs.readFile('data/population/baselines/1700/population.meta.json','utf8'));
  if(baseline.geography.sha256!==sha(bytes))throw new Error('Population baseline does not match canonical topology');
  const certificate=JSON.parse(await fs.readFile('data/processed/canonical/invariants.json','utf8'));const verified=certificate.topologySha256===sha(bytes);
  out.qa.overlapErrors=verified&&out.qa.simplification.segmentIntersections===0?certificate.overlapFaceCount:null;out.qa.overlapValidation={method:'SHA256-matched canonical independent intersection + mosaic certificate; exact shared-arc union, fixed exterior, shared simplification with polygon preservation and independent segment intersection scan',verified};
  out.qa.provenance={source,population:pop,topologySha256:sha(bytes),populationSha256:sha(pbytes),mappingSha256:sha(JSON.stringify(out.mapping)),config};
  const dir=value('--out')||'client/data/map-v2-legacy';await fs.mkdir(dir,{recursive:true});
  for(const [name,data]of Object.entries({mapping:out.mapping,provinces:out.provinces,qa:out.qa,maritime:result.maritime,atoms:input.atoms.map(({geometry,weight,mass,...a})=>({...a,adjacency:a.adjacency.map(e=>({id:input.atoms[e.id].id,borderKm:e.borderKm}))})), 'provinces.topo':packTopology(out.topology)}))await fs.writeFile(`${dir}/${name}.json`,JSON.stringify(data));
  console.log(JSON.stringify({provinces:out.qa.provinceCount,atoms:out.qa.atomCount,unassigned:out.qa.unassignedAtoms,duplicates:out.qa.duplicateAtoms,disconnected:out.qa.disconnectedMainlandProvinces.length,invalid:out.qa.invalidPolygons.length,sharedBorderErrors:out.qa.sharedBorderErrors.length,overlapErrors:out.qa.overlapErrors,tinyIslands:out.qa.standaloneTinyIslandProvinces.length,repairs:out.qa.repairs}));
  if(out.qa.unassignedAtoms||out.qa.duplicateAtoms||out.qa.disconnectedMainlandProvinces.length||out.qa.invalidPolygons.length||out.qa.simplifiedInvalidPolygons.length||out.qa.sharedBorderErrors.length||!verified||out.qa.overlapErrors!==0)process.exitCode=1;
}
module.exports={DEFAULTS,graph,partition,produce,distance,simplifyShared};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
