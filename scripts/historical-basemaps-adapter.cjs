// Source-specific draft adapter. No ownership inference and no publication.
const {createHash}=require('node:crypto');
const clipping=require('polygon-clipping');
const {parseStrictJson}=require('./strict-json.cjs');
const {geometryOf}=require('./political-geography-assignment.cjs');
const {validatePolities,compare}=require('../shared/political-geography.cjs');
const {area,polygons,bounds,intersection}=require('./adm2-spatial.cjs');
const {spatialIndex}=require('./population-baseline.cjs');
const SOURCE='https://github.com/aourednik/historical-basemaps';
const FILE='geojson/world_1700.geojson';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sorted=values=>[...new Set(values)].sort((a,b)=>compare(JSON.stringify(a),JSON.stringify(b)));
const named=value=>typeof value==='string'&&value.trim().length>0;
function parseSource(bytes){
  const data=parseStrictJson(bytes);
  if(data?.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('Historical basemaps requires FeatureCollection');
  for(const f of data.features)if(f?.type!=='Feature'||!f.properties||Array.isArray(f.properties)||typeof f.properties!=='object')throw Error('Malformed historical basemaps feature/properties');
  return data;
}
function proposedId(name){
  if(!named(name))throw Error('Cannot propose polity ID for unnamed feature');
  const slug=name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,40)||'entity';
  return `hb_${slug}_${sha(name).slice(0,10)}`;
}
function proposeMapping(source,sourceSha256){
  return {version:1,source:`${SOURCE}/${FILE}`,sourceSha256,reviewStatus:'draft',mappings:Object.fromEntries(sorted(source.features.map(f=>f.properties.NAME).filter(named)).sort(compare).map(name=>[name,proposedId(name)]))};
}
function validateMapping(mapping,source,sourceSha256){
  if(mapping?.version!==1||mapping.source!==`${SOURCE}/${FILE}`||mapping.sourceSha256!==sourceSha256||!['draft','reviewed'].includes(mapping.reviewStatus)||!mapping.mappings||Object.getPrototypeOf(mapping.mappings)!==Object.prototype)throw Error('Invalid/stale explicit historical basemaps mapping');
  const names=sorted(source.features.map(f=>f.properties.NAME).filter(named)).sort(compare),missing=names.filter(name=>!Object.hasOwn(mapping.mappings,name));
  if(missing.length)throw Error(`Unmapped historical source NAMEs: ${missing.join(', ')}`);
  if(Object.keys(mapping.mappings).some(name=>!names.includes(name)))throw Error('Mapping references unknown source NAME');
  const ids=new Set();
  for(const [name,id]of Object.entries(mapping.mappings)){
    validatePolities([{id,name,shortName:name,type:'source_entity_unreviewed',color:'#778899'}]);
    if(ids.has(id))throw Error('Draft mapping must not silently merge distinct source entities');ids.add(id);
  }
  return names;
}
function featureRows(source){
  const counts=new Map();
  return source.features.map(f=>({feature:f,key:sha(JSON.stringify(f))})).sort((a,b)=>compare(a.key,b.key)).map(({feature,key})=>{
    const ordinal=counts.get(key)||0;counts.set(key,ordinal+1);
    let geometry,error=null;try{geometry=geometryOf(feature.geometry);}catch(e){error=e.message;}
    let rawAreaKm2=null;try{const n=area(polygons(feature.geometry));if(Number.isFinite(n))rawAreaKm2=n;}catch{}
    return {featureId:`${key}:${ordinal}`,feature,geometry,error,rawAreaKm2};
  });
}
function distribution(values){return sorted(values).map(value=>({value,count:values.filter(v=>JSON.stringify(v)===JSON.stringify(value)).length}));}
function inspectSource(source,{detectOverlaps=true}={}){
  const rows=featureRows(source),groups=new Map();
  for(const row of rows){const name=row.feature.properties.NAME;if(!named(name))continue;if(!groups.has(name))groups.set(name,[]);groups.get(name).push(row);}
  const inventory=[...groups].sort((a,b)=>compare(a[0],b[0])).map(([sourceName,features])=>{
    let coordinates=[];
    for(const row of features.filter(r=>!r.error))coordinates=coordinates.length?clipping.union(coordinates,polygons(row.geometry)):polygons(row.geometry);
    return {sourceName,proposedPolityId:proposedId(sourceName),SUBJECTO:sorted(features.map(r=>r.feature.properties.SUBJECTO??null)),PARTOF:sorted(features.map(r=>r.feature.properties.PARTOF??null)),BORDERPRECISION:sorted(features.map(r=>r.feature.properties.BORDERPRECISION??null)),areaKm2:area(coordinates),rawFeatureAreaKm2:features.reduce((n,r)=>n+(r.rawAreaKm2||0),0),featureCount:features.length,validFeatureCount:features.filter(r=>!r.error).length,areaMethod:'canonical area of union of validated source features; invalid features excluded'};
  });
  const candidates=new Map();
  for(const row of rows){const p=row.feature.properties;if(!named(p.NAME))continue;
    for(const field of ['SUBJECTO','PARTOF'])if(named(p[field])&&p[field]!==p.NAME){const key=JSON.stringify([p.NAME,field,p[field]]);if(!candidates.has(key))candidates.set(key,{sourceName:p.NAME,sourceField:field,targetSourceName:p[field],targetPresentAsNAME:groups.has(p[field]),relationshipType:null,reviewStatus:'unreviewed',featureCount:0});candidates.get(key).featureCount++;}
  }
  const overlaps=[],overlapErrors=[];
  if(detectOverlaps){
    const valid=rows.filter(r=>!r.error).map(r=>({id:r.featureId,geometry:r.geometry,row:r})),query=spatialIndex(valid,5),byId=new Map(valid.map(f=>[f.id,f]));
    for(const f of valid){
      const ids=sorted(query(bounds(f.geometry)).map(part=>part.id));
      for(const id of ids){if(compare(f.id,id)>=0)continue;const g=byId.get(id);
        try{const areaKm2=area(intersection(f.geometry,g.geometry));if(!Number.isFinite(areaKm2))throw Error('Nonfinite overlap');if(areaKm2>1e-8)overlaps.push({featureA:f.id,featureB:id,nameA:f.row.feature.properties.NAME??null,nameB:g.row.feature.properties.NAME??null,areaKm2});}
        catch(e){overlapErrors.push({featureA:f.id,featureB:id,error:e.message.replace(/segment #\d+/g,'segment #<internal-id>')});}
      }
    }
  }
  const properties=sorted(rows.flatMap(r=>Object.keys(r.feature.properties))).sort(compare);
  const report={featureCount:rows.length,geometryTypes:distribution(rows.map(r=>r.feature.geometry?.type??null)),propertyNames:properties,propertySchema:Object.fromEntries(properties.map(key=>[key,distribution(rows.map(r=>!Object.hasOwn(r.feature.properties,key)?'missing':r.feature.properties[key]===null?'null':typeof r.feature.properties[key]))])),uniqueNAME:sorted(rows.map(r=>r.feature.properties.NAME??null)),uniqueSUBJECTO:sorted(rows.map(r=>r.feature.properties.SUBJECTO??null)),uniquePARTOF:sorted(rows.map(r=>r.feature.properties.PARTOF??null)),namedEntityCount:groups.size,unnamedFeatures:rows.filter(r=>!named(r.feature.properties.NAME)).length,borderPrecisionDistribution:distribution(rows.map(r=>r.feature.properties.BORDERPRECISION??null)),invalidGeometries:rows.filter(r=>r.error).map(r=>({featureId:r.featureId,sourceName:r.feature.properties.NAME??null,error:r.error,rawAreaKm2:r.rawAreaKm2})),nullGeometries:rows.filter(r=>!r.feature.geometry).length,duplicateNames:inventory.filter(r=>r.featureCount>1).map(r=>({name:r.sourceName,count:r.featureCount})),overlappingPairs:overlaps.length,overlapErrors,overlapDetection:detectOverlaps?'exact intersections of validated feature geometries, including unnamed features; invalid geometries not tested':'not requested'};
  return {report,inventory,relationshipCandidates:[...candidates].sort((a,b)=>compare(a[0],b[0])).map(([,v])=>v),overlaps,rows};
}
function adaptSource(source,mapping,sourceSha256,inspection=inspectSource(source,{detectOverlaps:false}),{excludeInvalid=false}={}){
  const names=validateMapping(mapping,source,sourceSha256),features=[],excluded=[];
  for(const row of inspection.rows){
    const p=row.feature.properties;
    if(!named(p.NAME)){excluded.push({featureId:row.featureId,sourceName:p.NAME??null,reason:'unnamed source feature',geometryError:row.error});continue;}
    if(row.error){if(!excludeInvalid)throw Error(`Invalid source geometry ${p.NAME}: ${row.error}`);excluded.push({featureId:row.featureId,sourceName:p.NAME,reason:'invalid source geometry excluded from preview',geometryError:row.error});continue;}
    features.push({type:'Feature',properties:{...p,polityId:mapping.mappings[p.NAME],sourceFeatureId:row.featureId},geometry:structuredClone(row.geometry)});
  }
  const registry=names.map(name=>({id:mapping.mappings[name],name,shortName:name,type:'source_entity_unreviewed',color:'#'+sha(mapping.mappings[name]).slice(0,6)})).sort((a,b)=>compare(a.id,b.id));
  validatePolities(registry);
  return {source:{type:'FeatureCollection',features},registry,excluded,mappingSummary:{namedEntities:names.length,mappedNames:names.length,unmappedNames:0,registrySize:registry.length,includedFeatures:features.length,excludedFeatures:excluded.length,reviewStatus:mapping.reviewStatus},precisionAudit:{sourceHistoricalBorderPrecision:inspection.report.borderPrecisionDistribution,includedFeaturePrecision:distribution(features.map(f=>f.properties.BORDERPRECISION??null)),byPolity:inspection.inventory.map(row=>({polityId:mapping.mappings[row.sourceName],sourceName:row.sourceName,sourceBorderPrecisionValues:row.BORDERPRECISION})),note:'BORDERPRECISION is an upstream ordinal claim, not atomic-overlap confidence or independently verified historical accuracy.'}};
}
module.exports={SOURCE,FILE,sha,parseSource,proposedId,proposeMapping,validateMapping,inspectSource,adaptSource};
