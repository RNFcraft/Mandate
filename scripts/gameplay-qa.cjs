const clipping=require('polygon-clipping');
const mapshaper=require('mapshaper');
const {feature,mergeArcs}=require('topojson-client');
const {polygons,gridIndex,bounds}=require('./adm2-spatial.cjs');
const {surfaceArea:area}=require('./gameplay-area.cjs');
const {visit}=require('./gameplay-topology.cjs');
function statistics(values){const a=[...values].sort((a,b)=>a-b);return {min:a[0]||0,median:a[Math.floor(a.length*.5)]||0,p90:a[Math.floor(a.length*.9)]||0,max:a.at(-1)||0};}
function coverageDifference(source,union,log){
  const asFeatures=parts=>parts.map((p,i)=>({id:String(i),geometry:{type:'Polygon',coordinates:p}}));
  const querySource=gridIndex(asFeatures(source),20),queryUnion=gridIndex(asFeatures(union),20);
  let gapArea=0,oceanArea=0,gapComponentCount=0;
  // Non-overlapping QA tiles avoid the clipping library's global queue limit.
  // Tile cuts are diagnostic only and never become gameplay boundaries.
  for(let x=-180;x<180;x+=20)for(let y=-90;y<90;y+=20){
    const ymax=Math.min(90,y+20),box=[x,y,x+20,ymax],a=querySource(box).map(f=>f.geometry.coordinates),b=queryUnion(box).map(f=>f.geometry.coordinates);if(!a.length&&!b.length)continue;
    const square=[[[x,y],[x+20,y],[x+20,ymax],[x,ymax],[x,y]]];
    const sourceTile=a.length?clipping.intersection(a,[square]):[],unionTile=b.length?clipping.intersection(b,[square]):[];
    const gap=sourceTile.length?clipping.difference(sourceTile,unionTile):[],extra=unionTile.length?clipping.difference(unionTile,sourceTile):[];
    gapArea+=area(gap);oceanArea+=area(extra);gapComponentCount+=gap.length;
  }return {gapArea,oceanArea,gapComponentCount};
}
function auditGeometry(topology,records,sourceMask,config,log=()=>{}){
  const collection=topology.objects.provinces,features=feature(topology,collection).features;
  const union=polygons(feature(topology,mergeArcs(topology,collection.geometries)).geometry);
  log('QA: exact union versus independent source land mask');
  const coverage=coverageDifference(sourceMask,union,log);
  const query=gridIndex(features,2);let testedPairs=0,overlapArea=0;const overlaps=[],invalid=[],disconnected=[];
  const recordById=new Map(records.map(r=>[r.id,r]));
  for(let i=0;i<features.length;i++){
    const f=features[i],ps=polygons(f.geometry);let valid=ps.length>0;
    for(const p of ps)for(const r of p)if(r.length<4||r[0][0]!==r.at(-1)[0]||r[0][1]!==r.at(-1)[1]||r.some(q=>q.some(v=>!Number.isFinite(v))))valid=false;
    if(!valid||!area(ps))invalid.push(f.id);
    if(ps.length>recordById.get(f.id).componentIds.length)disconnected.push(f.id);
    for(const other of query(bounds(f.geometry)))if(f.id<other.id){testedPairs++;const km2=area(clipping.intersection(ps,polygons(other.geometry)));overlapArea+=km2;if(km2>config.qaAreaTolerance)overlaps.push({ids:[f.id,other.id],areaKm2:km2});}
  }
  const provinceOwners=topology.arcs.map(()=>[]),landArcs=new Set();collection.geometries.forEach(g=>visit(g.arcs,(n,signed)=>provinceOwners[n].push({id:g.id,signed})));topology.objects.land.geometries.forEach(g=>visit(g.arcs,n=>landArcs.add(n)));
  const sharedErrors=[];provinceOwners.forEach((owners,n)=>{if(!owners.length&&!landArcs.has(n))return;const expected=landArcs.has(n)?1:2;if(owners.length!==expected||owners.length===2&&(owners[0].signed<0)===(owners[1].signed<0))sharedErrors.push(n);});
  const intersections=mapshaper.internal.findSegmentIntersections(new mapshaper.internal.ArcCollection(topology.arcs)).length;
  const tiny=records.filter(r=>r.areaKm2<config.minProvinceArea).map(r=>r.id),skinny=records.filter(r=>r.compactness<config.compactnessThreshold||r.elongation>config.skinnyRatio).map(r=>r.id);
  const qa={provinceCount:records.length,landMaskArea:area(sourceMask),provinceUnionArea:area(union),coverageDifference:coverage.gapArea+coverage.oceanArea,...coverage,overlapArea,overlapCount:overlaps.length,overlaps,testedPairs,
    invalidProvinceCount:invalid.length,invalidProvinces:invalid,disconnectedProvinceCount:disconnected.length,disconnectedProvinces:disconnected,multiPolygonCount:features.filter(f=>polygons(f.geometry).length>1).length,
    provinceArea:statistics(records.map(r=>r.areaKm2)),provincePopulation:statistics(records.map(r=>r.population)),compactness:statistics(records.map(r=>r.compactness)),skinnyProvinceOutliers:skinny,tinyProvinceOutliers:tiny,
    tinyMainlandProvinceCount:records.filter(r=>r.areaKm2<config.minProvinceArea&&r.adjacency.length>0).length,
    microNonIslandComponentCount:features.reduce((sum,f)=>sum+polygons(f.geometry).filter(p=>area([p])<config.microComponentArea&&recordById.get(f.id).componentIds.every(id=>area([sourceMask[Number(id.split(':')[1])-1]])>=config.islandProvinceArea)).length,0),
    tinyIslandStandaloneProvinceCount:records.filter(r=>r.areaKm2<config.minProvinceArea&&!r.adjacency.length&&!r.archipelago).length,microPolygonComponentCount:records.reduce((s,r)=>s+r.microComponents,0),
    coastlineMismatchArea:coverage.gapArea+coverage.oceanArea,coastlineMismatchLength:null,coastlineValidation:'Independent source-mask symmetric difference in disjoint QA tiles plus canonical shared exterior arc ownership. Length not computed.',
    vertexCount:topology.arcs.reduce((s,a)=>s+a.length,0),sharedTopologyErrors:sharedErrors,sharedTopologyConsistency:sharedErrors.length===0,segmentIntersections:intersections,
    validation:'Independent bbox-indexed pair intersections, source-mask symmetric difference, decoded ring validity, physical component counts, shared-arc orientation/ownership and segment intersection scan.'};
  qa.structuralFailures=[];
  for(const [name,value,limit]of [['gapArea',qa.gapArea,config.qaAreaTolerance],['oceanArea',qa.oceanArea,config.qaAreaTolerance],['overlapArea',overlapArea,config.qaAreaTolerance],['invalidProvinceCount',invalid.length,0],['disconnectedProvinceCount',disconnected.length,0],['sharedTopologyErrors',sharedErrors.length,0],['segmentIntersections',intersections,0]])if(value>limit)qa.structuralFailures.push({name,value,limit});
  return qa;
}
module.exports={auditGeometry,statistics};
