const clipping=require('polygon-clipping');
const {area,polygons,bounds,intersection}=require('./adm2-spatial.cjs');
const {spatialIndex}=require('./population-baseline.cjs');
const {validatePopulationScenario}=require('../shared/population.cjs');
const {compare,RELATIONS,validatePolities,validateRelations,validateOverrides,validatePoliticalGeography}=require('../shared/political-geography.cjs');
const fail=message=>{throw Error(`Political import: ${message}`);};
function validateSimpleRing(ring){
  const segments=ring.slice(1).map((p,i)=>({i,a:ring[i],b:p,minX:Math.min(ring[i][0],p[0]),maxX:Math.max(ring[i][0],p[0]),minY:Math.min(ring[i][1],p[1]),maxY:Math.max(ring[i][1],p[1])})).sort((a,b)=>a.minX-b.minX||a.i-b.i);
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  let active=[];
  for(const s of segments){
    if(s.a[0]===s.b[0]&&s.a[1]===s.b[1])fail('source ring has duplicate consecutive vertices');
    active=active.filter(t=>t.maxX>=s.minX);
    for(const t of active){
      if(Math.abs(s.i-t.i)===1||Math.abs(s.i-t.i)===segments.length-1||s.maxY<t.minY||s.minY>t.maxY)continue;
      const a=cross(s.a,s.b,t.a),b=cross(s.a,s.b,t.b),c=cross(t.a,t.b,s.a),d=cross(t.a,t.b,s.b);
      if((a===0||b===0||Math.sign(a)!==Math.sign(b))&&(c===0||d===0||Math.sign(c)!==Math.sign(d)))fail('self-intersecting source ring');
    }
    active.push(s);
  }
}
function geometryOf(g){
  if(!g||!['Polygon','MultiPolygon'].includes(g.type)||!Array.isArray(g.coordinates))fail('source requires Polygon/MultiPolygon geometry');
  const parts=polygons(g);if(!parts.length)fail('empty source geometry');
  for(const part of parts){
    if(!Array.isArray(part)||!part.length)fail('empty polygon');
    for(const ring of part){
      if(!Array.isArray(ring)||ring.length<4||ring.some(p=>!Array.isArray(p)||p.length<2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90))fail('malformed source coordinates');
      if(ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])fail('source rings must be closed');
      if(new Set(ring.map(p=>JSON.stringify(p.slice(0,2)))).size<3||area([[ring]])<=0)fail('degenerate source ring');
      validateSimpleRing(ring);
    }
    if(bounds({type:'Polygon',coordinates:part})[2]-bounds({type:'Polygon',coordinates:part})[0]>180)fail('source must be split at the antimeridian');
    if(!(area([part])>0))fail('invalid source polygon area');
    if(part.length>1){
      const shell=[part[0]],holes=part.slice(1).map(r=>[r]);
      for(const hole of holes)if(clipping.difference([hole],[shell]).length)fail('source hole lies outside polygon shell');
      for(let i=0;i<holes.length;i++)for(let j=0;j<i;j++)if(area(clipping.intersection([holes[i]],[holes[j]]))>0)fail('overlapping source holes');
    }
  }
  return {type:g.type,coordinates:g.type==='Polygon'?g.coordinates.map(r=>r.map(p=>p.slice(0,2))):g.coordinates.map(p=>p.map(r=>r.map(c=>c.slice(0,2))))};
}
function sourcePolygons(sources,polities,polityField='polityId'){
  const ids=validatePolities(polities),groups=new Map();
  if(typeof polityField!=='string'||!polityField||['__proto__','constructor','prototype'].includes(polityField))fail('invalid polity field');
  for(const source of sources){
    if(source?.type!=='FeatureCollection'||!Array.isArray(source.features))fail('source must be a GeoJSON FeatureCollection');
    for(const f of source.features){
      if(f?.type!=='Feature'||!f.properties||!Object.hasOwn(f.properties,polityField)||!ids.has(f.properties[polityField]))fail('unknown/missing explicit source polity ID');
      const polity=f.properties[polityField],geometry=geometryOf(f.geometry);
      if(!groups.has(polity))groups.set(polity,[]);groups.get(polity).push(geometry);
    }
  }
  // Union same-polity features before indexing so overlapping source patches do
  // not count twice. Deterministic input order also fixes clipping/float order.
  return [...groups].sort((a,b)=>compare(a[0],b[0])).map(([id,geometries])=>{
    geometries.sort((a,b)=>compare(JSON.stringify(a),JSON.stringify(b)));
    let coordinates=[];
    for(const geometry of geometries)coordinates=coordinates.length?clipping.union(coordinates,polygons(geometry)):polygons(geometry);
    if(!coordinates.length||!Number.isFinite(area(coordinates))||area(coordinates)<=0)fail(`invalid merged source geometry ${id}`);
    return {id,geometry:{type:'MultiPolygon',coordinates}};
  });
}
function assignPoliticalGeography({features,hierarchy,baseline,polities,relations,overrides,sources=[],polityField='polityId',provenance={},thresholds={}}){
  const limits={high:0.9,medium:0.6,runnerAmbiguity:0.1,...thresholds};
  if(Object.keys(limits).some(k=>!['high','medium','runnerAmbiguity'].includes(k))||Object.values(limits).some(v=>!Number.isFinite(v)||v<=0||v>1)||limits.high<=limits.medium)fail('invalid confidence thresholds');
  const expected=new Set(hierarchy.territories.map(t=>t.id)),actual=new Set(features.map(f=>f.id));
  if(actual.size!==features.length||expected.size!==hierarchy.territories.length||actual.size!==expected.size||[...expected].some(id=>!actual.has(id)))fail('canonical territory IDs/count mismatch');
  validatePopulationScenario(baseline,hierarchy);const normalizedRelations=validateRelations(relations,polities),manual=validateOverrides(overrides,polities,hierarchy);
  const historical=sourcePolygons(sources,polities,polityField),query=spatialIndex(historical),rows=[],owners={},controllers={};
  const populationById=new Map();
  for(const c of baseline.cohorts){if(!populationById.has(c.territoryId))populationById.set(c.territoryId,{population:0,urban:0,rural:0});const row=populationById.get(c.territoryId);row.population+=c.count;row[c.settlement]+=c.count;}
  for(const f of features.slice().sort((a,b)=>compare(a.id,b.id))){
    const areaKm2=area(polygons(f.geometry));if(!Number.isFinite(areaKm2)||areaKm2<=0)fail(`invalid canonical area ${f.id}`);
    const overlaps=new Map();
    for(const part of query(bounds(f.geometry))){const overlap=area(intersection(f.geometry,part.geometry));if(!Number.isFinite(overlap)||overlap<0)fail(`invalid overlap area ${f.id}`);if(overlap>0)overlaps.set(part.id,(overlaps.get(part.id)||0)+overlap);}
    const ranked=[...overlaps].sort((a,b)=>b[1]-a[1]||compare(a[0],b[0]));
    if(ranked.some(([,value])=>value>areaKm2*(1+1e-7)+1e-6))fail(`overlap exceeds canonical area ${f.id}`);
    const winner=ranked[0],runner=ranked[1],share=winner?Math.min(1,winner[1]/areaKm2):0,secondShare=runner?Math.min(1,runner[1]/areaKm2):0;
    const owner=winner?.[0]??null;if(owner!==null)owners[f.id]=owner;
    rows.push({territoryId:f.id,areaKm2,...(populationById.get(f.id)||{population:0,urban:0,rural:0}),winningPolityId:owner,winningOverlapPct:100*share,secondPolityId:runner?.[0]??null,secondOverlapPct:100*secondShare,confidence:!winner?'UNASSIGNED':share>=limits.high?'HIGH':share>=limits.medium?'MEDIUM':'LOW',ambiguous:!!winner&&(share<limits.medium||secondShare>=limits.runnerAmbiguity),ownerPolityId:owner,controllerPolityId:owner,overridden:false});
  }
  const byId=new Map(rows.map(r=>[r.territoryId,r])),manualAudit=[];
  for(const row of manual){
    const target=byId.get(row.territoryId),previousOwnerPolityId=target.ownerPolityId,controller=Object.hasOwn(row,'controllerPolityId')?row.controllerPolityId:row.ownerPolityId;
    if(row.ownerPolityId===null)delete owners[row.territoryId];else owners[row.territoryId]=row.ownerPolityId;
    if(controller!==row.ownerPolityId)controllers[row.territoryId]=controller;
    Object.assign(target,{ownerPolityId:row.ownerPolityId,controllerPolityId:controller,overridden:true});
    manualAudit.push({...row,controllerPolityId:controller,previousOwnerPolityId});
  }
  const sorted=map=>Object.fromEntries(Object.entries(map).sort((a,b)=>compare(a[0],b[0])));
  const asset={version:1,year:1700,geography:hierarchy.id,status:'ready',owners:sorted(owners),controllers:sorted(controllers),provenance:{...provenance,method:'largest exact canonical intersection area; same-polity source union; ASCII polity ID ties',thresholds:limits,manualOverrides:manual.map(row=>({...row}))}};
  validatePoliticalGeography(asset,polities,{version:1,relations:normalizedRelations},hierarchy);
  const polityRows=new Map([...polities].sort((a,b)=>compare(a.id,b.id)).map(p=>[p.id,{polityId:p.id,territories:0,areaKm2:0,population:0,urban:0,rural:0}]));
  polityRows.set(null,{polityId:null,territories:0,areaKm2:0,population:0,urban:0,rural:0});
  const confidenceBuckets={HIGH:0,MEDIUM:0,LOW:0,UNASSIGNED:0};
  for(const row of rows){const total=polityRows.get(row.ownerPolityId);total.territories++;for(const key of ['areaKm2','population','urban','rural'])total[key]+=row[key];confidenceBuckets[row.confidence]++;}
  const unassigned=polityRows.get(null),assignedRows=[...polityRows.values()].filter(r=>r.polityId!==null);
  const aggregate=key=>assignedRows.reduce((n,row)=>n+row[key],0);
  const summary={canonicalTerritories:features.length,assignedTerritories:features.length-unassigned.territories,unassignedTerritories:unassigned.territories,assignedAreaKm2:aggregate('areaKm2'),unassignedAreaKm2:unassigned.areaKm2,assignedPopulation:aggregate('population'),unassignedPopulation:unassigned.population,polityCount:polities.length,relationshipCounts:Object.fromEntries(RELATIONS.slice().sort(compare).map(type=>[type,normalizedRelations.filter(r=>r.type===type).length])),overlapConfidenceBuckets:confidenceBuckets,ambiguousTerritories:rows.filter(r=>r.ambiguous).length,overrideCount:manual.length,provenance:asset.provenance};
  return {asset,relations:{version:1,relations:normalizedRelations},audit:{summary,politySummary:[...polityRows.values()],ambiguousTerritories:rows.filter(r=>r.ambiguous),unassignedTerritories:rows.filter(r=>r.ownerPolityId===null),manualOverrides:manualAudit,territoryAssignments:rows}};
}
module.exports={assignPoliticalGeography,sourcePolygons,geometryOf};
