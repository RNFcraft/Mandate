const mapshaper=require('mapshaper');
const {feature,mergeArcs}=require('topojson-client');
const {polygons,bounds}=require('./adm2-spatial.cjs');
const {surfaceArea:area}=require('./gameplay-area.cjs');
const {distance}=require('./gameplay-provinces.cjs');
const {PointIndex,planarCentroid}=require('./gameplay-partition.cjs');
const {remap}=require('../shared/topology-arcs.cjs');
function visit(arcs,fn){for(const a of arcs)if(Array.isArray(a))visit(a,fn);else fn(a<0?~a:a,a);}
async function sharedTopology(parts,mask,config){
  const features=parts.map(p=>({type:'Feature',id:p.id,properties:{id:p.id,kind:'parts'},geometry:p.geometry}));
  features.push({type:'Feature',id:'land',properties:{id:'land',kind:'land'},geometry:{type:'MultiPolygon',coordinates:mask}});
  const output=await mapshaper.applyCommands(`-i combined.geojson snap-interval=${config.snapTolerance} -clean allow-overlaps gap-fill-area=0 sliver-control=0 snap-interval=${config.snapTolerance} -split kind -o shared.topo.json format=topojson no-quantization id-field=id`,{'combined.geojson':JSON.stringify({type:'FeatureCollection',features})});
  return JSON.parse(output['shared.topo.json']);
}
function regroup(topology,parts,components,config){
  const geometries=topology.objects.parts.geometries,byId=new Map(parts.map(p=>[p.id,p])),owners=topology.arcs.map(()=>[]),neighbors=new Map(geometries.map(g=>[g.id,new Map()]));
  geometries.forEach(g=>visit(g.arcs,n=>{if(!owners[n].includes(g.id))owners[n].push(g.id);}));
  const lengths=topology.arcs.map(a=>{let sum=0;for(let i=1;i<a.length;i++)sum+=distance(a[i-1],a[i]);return sum;});
  owners.forEach((ids,n)=>{if(ids.length!==2||!lengths[n])return;const [a,b]=ids;neighbors.get(a).set(b,(neighbors.get(a).get(b)||0)+lengths[n]);neighbors.get(b).set(a,(neighbors.get(b).get(a)||0)+lengths[n]);});
  const labels=new Map(geometries.map(g=>[g.id,g.id])),sizes=new Map(geometries.map(g=>[g.id,area(polygons(feature(topology,g).geometry))]));
  let repairedFragments=0,tinyMerges=0,skinnyMerges=0;
  const find=id=>{let label=labels.get(id);while(labels.get(label)!==label)label=labels.get(label);return label;};
  const candidates=[...geometries].sort((a,b)=>sizes.get(a.id)-sizes.get(b.id)||(a.id<b.id?-1:1));
  for(const g of candidates){const p=byId.get(g.id),label=find(g.id);if(!p.fragment&&sizes.get(label)>=config.minProvinceArea)continue;
    const scores=new Map();for(const [id,length]of neighbors.get(g.id)){if(byId.get(id).componentId!==p.componentId)continue;const other=find(id);if(other!==label)scores.set(other,(scores.get(other)||0)+length);}
    const best=[...scores].sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:1))[0];if(!best)continue;
    labels.set(label,best[0]);sizes.set(best[0],sizes.get(best[0])+sizes.get(label));if(p.fragment)repairedFragments++;else tinyMerges++;
  }
  // Repair small coastal/skinny groups only across existing positive-length
  // land arcs. Merging reuses arcs, so neither coastline nor coverage moves.
  for(let pass=0;pass<config.skinnyRepairPasses;pass++){
    const current=new Map();for(const g of geometries){const id=find(g.id);if(!current.has(id))current.set(id,[]);current.get(id).push(g);}
    const perimeter=new Map(),adjacent=new Map(),shapes=new Map();
    for(const [id,gs]of current){perimeter.set(id,0);adjacent.set(id,new Map());const ps=polygons(feature(topology,mergeArcs(topology,gs)).geometry),largest=ps.reduce((a,b)=>area([a])>area([b])?a:b),b=bounds({type:'Polygon',coordinates:largest}),width=(b[2]-b[0])*Math.cos((b[1]+b[3])/2*Math.PI/180),height=b[3]-b[1];shapes.set(id,{elongation:Math.max(width,height)/Math.max(1e-12,Math.min(width,height))});}
    owners.forEach((ids,n)=>{const ls=[...new Set(ids.map(find))];if(ls.length===1&&ids.length===1)perimeter.set(ls[0],perimeter.get(ls[0])+lengths[n]);if(ls.length===2){for(const id of ls){perimeter.set(id,perimeter.get(id)+lengths[n]);const other=ls.find(a=>a!==id);adjacent.get(id).set(other,(adjacent.get(id).get(other)||0)+lengths[n]);}}});
    const used=new Set();let changes=0;
    for(const id of [...current.keys()].sort((a,b)=>sizes.get(a)-sizes.get(b)||(a<b?-1:1))){
      if(used.has(id)||sizes.get(id)>config.skinnyRepairArea)continue;
      const compactness=4*Math.PI*sizes.get(id)/perimeter.get(id)**2;
      if(compactness>=config.skinnyRepairCompactness&&shapes.get(id).elongation<=config.skinnyRatio)continue;
      const choices=[];for(const [other,length]of adjacent.get(id)){if(used.has(other)||byId.get(other).componentId!==byId.get(id).componentId)continue;const combined=sizes.get(id)+sizes.get(other),p=perimeter.get(id)+perimeter.get(other)-2*length,c=4*Math.PI*combined/p**2;
        if(c>compactness*1.25&&c>config.compactnessThreshold)choices.push({other,c,length});}
      choices.sort((a,b)=>b.c-a.c||b.length-a.length||(a.other<b.other?-1:1));if(!choices.length)continue;
      const other=choices[0].other;labels.set(id,other);sizes.set(other,sizes.get(other)+sizes.get(id));used.add(id);used.add(other);changes++;skinnyMerges++;
    }if(!changes)break;
  }
  // Spatial maritime membership only; no artificial geometry or land edges.
  const componentById=new Map(components.map(c=>[c.id,c]));
  const groups=new Map();for(const g of geometries){const label=find(g.id);if(!groups.has(label))groups.set(label,[]);groups.get(label).push(g);}
  const major=[...groups].filter(([id])=>componentById.get(byId.get(id).componentId).budget>0);
  const anchors=major.map(([id,gs])=>({id,point:byId.get(id).seed,area:gs.reduce((s,g)=>s+area(polygons(feature(topology,g).geometry)),0)}));
  const copies=anchors.flatMap((a,i)=>[-360,0,360].map(offset=>({point:[a.point[0]+offset,a.point[1]],id:i}))),index=new PointIndex(copies.map(a=>a.point)),maritime=[],islandLabels=new Map(),remote=[];
  const small=[...groups].filter(([id])=>!componentById.get(byId.get(id).componentId).budget).sort((a,b)=>sizes.get(b[0])-sizes.get(a[0])||(a[0]<b[0]?-1:1));
  for(const [id]of small){const p=byId.get(id),point=planarCentroid(componentById.get(p.componentId).polygon),near=index.nearest(point,24).map(n=>anchors[copies[n.id].id]);let best=near.reduce((a,b)=>distance(point,b.point)<distance(point,a.point)?b:a),d=distance(point,best.point);
    for(const r of remote){const rd=distance(point,r.point);if(rd<d){best=r;d=rd;}}
    const radius=sizes.get(id)<config.minProvinceArea?config.tinyIslandGroupingDistanceKm:config.archipelagoDistanceKm;
    if(d<=radius){islandLabels.set(id,best.id);maritime.push({componentId:p.componentId,anchorPartId:best.id,distanceKm:d,groupingRadiusKm:radius});}
    else remote.push({id,point});
  }
  const final=new Map();for(const [id,gs]of groups){const label=islandLabels.get(id)||id;if(!final.has(label))final.set(label,[]);final.get(label).push(...gs);}
  const metadata=[],merged=[];let i=0;
  for(const [anchor,gs]of [...final].sort((a,b)=>a[0]<b[0]?-1:1)){
    const id=`preview:${String(++i).padStart(5,'0')}`,g=mergeArcs(topology,gs);g.id=id;merged.push(g);
    const componentIds=[...new Set(gs.map(g=>byId.get(g.id).componentId))].sort();
    metadata.push({id,seedId:byId.get(anchor).seedId,seed:byId.get(anchor).seed,componentId:byId.get(anchor).componentId,componentIds,archipelago:componentIds.length>1});
    for(const r of maritime)if(r.anchorPartId===anchor)r.provinceId=id;
  }
  return {topology:remap(topology,{provinces:merged,land:topology.objects.land.geometries}),metadata,maritime,cleanup:{repairedFragments,tinyMerges,skinnyMerges,remoteIslandGroups:remote.length}};
}
function topologyMetadata(topology,metadata,config){
  const geometries=topology.objects.provinces.geometries,owners=topology.arcs.map(()=>[]),records=new Map(metadata.map(m=>[m.id,{...m,adjacency:[]}]));
  const lengths=topology.arcs.map(a=>{let n=0;for(let i=1;i<a.length;i++)n+=distance(a[i-1],a[i]);return n;});
  for(const g of geometries){let perimeter=0;visit(g.arcs,n=>{perimeter+=lengths[n];if(!owners[n].includes(g.id))owners[n].push(g.id);});const ps=polygons(feature(topology,g).geometry),km2=area(ps),r=records.get(g.id);r.areaKm2=km2;r.compactness=perimeter?4*Math.PI*km2/perimeter**2:0;r.geometryComponents=ps.length;r.landComponents=r.componentIds.length;r.microComponents=ps.filter(p=>area([p])<config.microComponentArea).length;
    const largest=ps.reduce((a,b)=>area([a])>area([b])?a:b),b=bounds({type:'Polygon',coordinates:largest}),width=(b[2]-b[0])*Math.cos((b[1]+b[3])/2*Math.PI/180),height=b[3]-b[1];r.elongation=Math.max(width,height)/Math.max(1e-12,Math.min(width,height));}
  owners.forEach((ids,n)=>{if(ids.length!==2||!lengths[n])return;for(const a of ids)for(const b of ids)if(a!==b&&!records.get(a).adjacency.includes(b))records.get(a).adjacency.push(b);});
  return {records:[...records.values()].map(r=>({...r,adjacency:r.adjacency.sort()})),owners};
}
module.exports={sharedTopology,regroup,topologyMetadata,visit};
