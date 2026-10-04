const fs=require('node:fs/promises');
const {feature}=require('topojson-client');
const mapshaper=require('mapshaper');
const crypto=require('node:crypto');
const {bounds,area,polygons,intersection,gridIndex}=require('./adm2-spatial.cjs');
const asFeatures=collection=>collection.type==='FeatureCollection'?collection.features:collection.type==='GeometryCollection'?collection.geometries.map(geometry=>({geometry})):collection.type==='Feature'?[collection]:[{geometry:collection}];
async function verify(file='data/processed/canonical/atomic.topo.json'){
  const topology=JSON.parse(await fs.readFile(file,'utf8'));
  const features=feature(topology,topology.objects.territories).features;
  const query=gridIndex(features),overlaps=[],errors=[];
  let tested=0;
  for(const f of features)for(const other of query(f.bounds)){
    if(f.id.localeCompare(other.id,'en')>=0)continue;
    tested++;
    try{const km2=area(intersection(f.geometry,other.geometry));if(km2>.000001)overlaps.push({ids:[f.id,other.id],areaKm2:km2,significant:km2>=1});}catch(e){errors.push({ids:[f.id,other.id],error:e.message});}
  }
  console.log(`Independent intersections: ${tested} pairs, ${overlaps.length} overlaps, ${errors.length} errors`);
  // Independently count overlapping faces, including sub-epsilon ones and dateline parts.
  const mosaic=await mapshaper.applyCommands('-i atomic.topo.json -mosaic calc="coverage=count()" -filter "coverage>1" -o overlaps.geojson format=geojson',{'atomic.topo.json':JSON.stringify(topology)});
  const faces=asFeatures(JSON.parse(mosaic['overlaps.geojson']));
  const faceAreas=faces.filter(f=>f.geometry).map(f=>area(polygons(f.geometry)));
  const report={testedPairs:tested,overlaps,intersectionErrors:errors,overlapFaceCount:faces.length,overlapFaceAreaKm2:faceAreas.reduce((a,b)=>a+b,0),significantOverlapCount:overlaps.filter(o=>o.significant).length};
  await mapshaper.runCommands(`-i data/processed/canonical/input.geojson name=coverage -dissolve2 target=coverage gap-fill-area=0 sliver-control=0 -i ${file} name=atoms -dissolve2 target=atoms gap-fill-area=0 sliver-control=0 -erase atoms target=coverage -o data/processed/canonical/uncovered.geojson target=coverage format=geojson`);
  const gapParts=asFeatures(JSON.parse(await fs.readFile('data/processed/canonical/uncovered.geojson','utf8'))).filter(f=>f.geometry).flatMap(f=>polygons(f.geometry));
  const gaps=gapParts.map(p=>area([p]));
  report.coverage={uncoveredPartCount:gaps.length,uncoveredAreaKm2:gaps.reduce((a,b)=>a+b,0),maxUncoveredPartKm2:Math.max(0,...gaps),significantUncoveredParts:gaps.filter(km2=>km2>=1).length,allowlistedSubKm2Parts:gaps.filter(km2=>km2<1).length};
  report.topologySha256=crypto.createHash('sha256').update(JSON.stringify(topology)).digest('hex');
  await fs.writeFile('data/processed/canonical/coverage-exceptions.json',JSON.stringify(gapParts.map((p,i)=>({areaKm2:gaps[i],bounds:bounds({type:'Polygon',coordinates:p}),reason:'sub-km2 snap or excluded residual part',allowlisted:gaps[i]<1}))));
  await fs.writeFile('data/processed/canonical/invariants.json',JSON.stringify(report));
  console.log({significant:report.significantOverlapCount,faces:report.overlapFaceCount,faceArea:report.overlapFaceAreaKm2});
  if(errors.length||report.significantOverlapCount||report.overlapFaceCount||report.coverage.significantUncoveredParts)throw new Error('Canonical mesh has overlapping interiors, unchecked pairs or uncovered land');
  return report;
}
module.exports=verify;
if(require.main===module)verify().catch(e=>{console.error(e);process.exitCode=1;});
