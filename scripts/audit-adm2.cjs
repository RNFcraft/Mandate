const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {feature}=require('topojson-client');
const {polygons,bounds,area,gridIndex,intersection,countryOf}=require('./adm2-spatial.cjs');
const ROOT=path.resolve(__dirname,'..');
const WORK=path.join(ROOT,'data/processed/adm2');
const read=async file=>JSON.parse(await fs.readFile(path.join(ROOT,file),'utf8'));
const round=n=>Number(n.toFixed(6));
const category=r=>r.match==='fallback'?'fallback':!r.adm1Id?'unmatched':r.confidence<1?'ambiguous':'confident';
async function audit(){
  const [matching,hierarchy,topology,base,report]=await Promise.all(['data/processed/adm2/matching.json','client/data/adm2/hierarchy.json','data/processed/adm2/detail.topo.json','client/data/world.topo.json','data/processed/adm2/report.json'].map(read));
  const baselineFile=path.join(WORK,'baseline.json');
  let baseline;
  try{baseline=JSON.parse(await fs.readFile(baselineFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;baseline=await read('data/map/adm2-baseline-links.json');baseline.scenarioHashes={};for(const id of ['1700','modern'])for(const name of ['scenario','countries','ownership']){const file=`scenarios/${id}/${name}.json`;baseline.scenarioHashes[file]=crypto.createHash('sha256').update(await fs.readFile(path.join(ROOT,file))).digest('hex');}await fs.writeFile(baselineFile,JSON.stringify(baseline));}
  if(baseline.sourceSha256!==report.sourceSha256)throw new Error('Baseline belongs to a different source');
  const adm1Meta=new Map(hierarchy.adm1.map(r=>[r.id,r]));
  const adm1=feature(base,base.objects.regions).features;
  const candidatesFor=gridIndex(adm1);
  const geometries=feature(topology,topology.objects.territories).features;
  const geometryById=new Map(geometries.map(f=>[f.id,f]));
  const old=new Map(baseline.territories.map(r=>[r.id,r]));
  const metadata=new Map(matching.map(r=>[r.id,r]));
  const children=new Map();for(const r of matching)if(r.adm1Id&&r.kind==='adm2')children.set(r.adm1Id,(children.get(r.adm1Id)||0)+1);
  const records=[], corrections=[],errors=[],numericalMatchingRetries=[];
  const rounded=new Map();
  const snap=(g,digits)=>{let levels=rounded.get(g);if(!levels){levels=new Map();rounded.set(g,levels);}if(!levels.has(digits)){
    const roundCoords=a=>Array.isArray(a)?a.map(roundCoords):Math.round(a*10**digits)/10**digits;
    levels.set(digits,{...g,coordinates:roundCoords(g.coordinates)});
  }return levels.get(digits);};
  const matchingIntersection=(g,f,id)=>{
    try{return intersection(g,f.geometry);}catch(original){
      // Diagnostics only: near-collinear source/canonical intersections can fail
      // floating point predicates. Retry on explicit decimal lattices; never
      // alter atom geometry or treat a retried match as confident.
      for(const digits of [7,6,5])try{
        const result=intersection(snap(g,digits),snap(f.geometry,digits));
        numericalMatchingRetries.push({id,candidate:f.id,snapDegrees:10**-digits,resolved:true});return result;
      }catch{}
      throw original;
    }
  };
  const knownCountries=new Set(hierarchy.adm1.map(r=>r.adm0Id));
  let count=0;
  for(const r of [...matching].sort((a,b)=>a.id.localeCompare(b.id,'en'))){
    const g=geometryById.get(r.id)?.geometry;
    if(!g){errors.push({id:r.id,error:'missing-geometry'});continue;}
    const b=bounds(g),totalArea=area(polygons(g));
    // Dateline-spanning planar polygons need manual review, never automatic correction.
    const dateline=b[2]-b[0]>180;
    const source=r.sourceAdm0Id||r.adm0Id,country=countryOf(source);
    const candidates=[];
    for(const f of candidatesFor(b)){
      if(adm1Meta.get(f.id).adm0Id!==country)continue;
      try{const overlap=area(matchingIntersection(g,f,r.id));if(overlap>1e-8)candidates.push({id:f.id,name:adm1Meta.get(f.id).name,adm0Id:country,areaKm2:round(overlap),share:round(Math.min(1,totalArea?overlap/totalArea:0))});}
      catch(e){errors.push({id:r.id,candidate:f.id,error:e.message});}
    }
    candidates.sort((a,b)=>b.share-a.share||a.id.localeCompare(b.id,'en'));
    const foreignCandidates=[];
    if(!r.adm1Id||!knownCountries.has(country))for(const f of candidatesFor(b)){
      const owner=adm1Meta.get(f.id).adm0Id;if(owner===country)continue;
      try{const km2=area(matchingIntersection(g,f,r.id));if(km2>1e-8)foreignCandidates.push({id:f.id,name:adm1Meta.get(f.id).name,adm0Id:owner,share:round(Math.min(1,totalArea?km2/totalArea:0))});}catch(e){errors.push({id:r.id,candidate:f.id,error:e.message});}
    }
    foreignCandidates.sort((a,b)=>b.share-a.share||a.id.localeCompare(b.id,'en'));
    const top=candidates[0],second=candidates[1];
    const margin=round(Math.max(0,(top?.share||0)-(second?.share||0)));
    const isFallback=r.match==='fallback',isResidual=r.kind==='residual';
    const retried=numericalMatchingRetries.some(e=>e.id===r.id);
    const hasError=retried||errors.some(e=>e.id===r.id);
    const strong=!dateline&&!hasError&&knownCountries.has(country)&&top?.share>=.995&&(second?.share||0)<=.001&&margin>=.994;
    const current=candidates.find(c=>c.id===r.adm1Id);
    let status=isResidual?'residual':isFallback?'fallback':!r.adm1Id?'unmatched':strong&&top.id===r.adm1Id?'confident':'ambiguous';
    let reason=isFallback?(children.has(r.adm1Id)?'retained-for-ownership-compatibility':'adm1-without-assigned-adm2'):
      dateline?'dateline-planar-uncertainty':hasError?'geometry-operation-failed':!knownCountries.has(country)?'source-adm0-not-in-natural-earth':!top?'no-same-country-geometric-candidate':!r.adm1Id?'unassigned-despite-geometric-candidate':candidates.length>1&&(second?.share||0)>.01?'crosses-natural-earth-adm1-boundaries':(top.share<.995?'partial-source-coverage':top.id!==r.adm1Id?'sampling-and-area-disagree':'dominant-area-candidate');
    if(isResidual)reason='uncovered-source-land';
    else if(retried)reason='numerical-source-matching-retry';
    if(!isResidual&&!r.adm1Id&&!dateline&&knownCountries.has(country)&&(foreignCandidates[0]?.share||0)>.5)reason='source-country-partition-differs';
    if(!isFallback&&!isResidual&&r.adm1Id&&top?.id===r.adm1Id&&top.share>=.995&&!strong&&!dateline&&!hasError)reason='competitor-above-conservative-threshold';
    // Never add children to a reserve-only ADM1 automatically: doing so would require
    // retiring its base ID and migrating authors' ownership. Keep the suggestion explicit.
    const before=old.get(r.id);
    const suggestion=!isFallback&&!isResidual&&top?.share>.5&&top.id!==r.adm1Id?{adm1Id:top.id,share:top.share,margin,automatic:strong&&children.has(top.id)&&r.adm0Id===country}:null;
    if(suggestion?.automatic)corrections.push({id:r.id,fromAdm1Id:r.adm1Id,toAdm1Id:top.id,adm0Id:country,share:top.share,margin});
    records.push({id:r.id,name:r.name,sourceAdm0Id:source,canonicalSourceAdm0Id:country,adm0Id:r.adm0Id,adm1Id:r.adm1Id,category:status,reason,confidence:isFallback||isResidual?null:round(Math.min(current?.share||0,margin)),sourceGeometryConfidence:r.confidence,legacyConfidence:before?.confidence??r.confidence,candidates,foreignCandidates,margin,areaKm2:round(totalArea),componentCount:polygons(g).length,bounds:r.bounds,representative:r.representative,chunkId:r.chunkId,suggestion,...(isFallback?{assignedRealChildren:children.get(r.adm1Id)||0}:{})});
    if(++count%5000===0)console.log(`Audit ${count}/${matching.length}`);
  }
  const overlaps=[];
  // Check all base pairs including source/source and reserve/reserve; 5° spatial grid
  // prunes disjoint bboxes. Report even insignificant slivers, separately from conflicts.
  const allCandidates=gridIndex(geometries);
  const ordered=[...geometries].sort((a,b)=>a.id.localeCompare(b.id,'en'));
  const areaCache=new Map(records.map(r=>[r.id,r.areaKm2]));
  let pairCount=0;
  for(const f of ordered){
    const a=metadata.get(f.id);
    if(!f.geometry)continue;
    for(const other of allCandidates(f.bounds)){
      if(f.id.localeCompare(other.id,'en')>=0)continue;
      const b=metadata.get(other.id);
      pairCount++;
      try{
        const km2=area(intersection(f.geometry,other.geometry));if(km2<.000001)continue;
        const smaller=Math.min(areaCache.get(f.id)||0,areaCache.get(other.id)||0);
        const fraction=smaller?km2/smaller:0;
        overlaps.push({ids:[f.id,other.id],type:a.kind==='residual'&&b.kind==='residual'?'residual-residual':a.kind==='residual'||b.kind==='residual'?'residual-adm2':'adm2-adm2',areaKm2:round(km2),smallerShare:round(fraction),significant:km2>=1,crossCountry:a.adm0Id!==b.adm0Id});
      }catch(e){errors.push({ids:[f.id,other.id],error:e.message});}
    }
  }
  const counts={confident:0,ambiguous:0,unmatched:0,fallback:0,residual:0},countries={},reasons={},histogram={'0':0,'(0,.5)':0,'[.5,.9)':0,'[.9,.995)':0,'[.995,1]':0};
  for(const r of records){counts[r.category]++;reasons[r.reason]=(reasons[r.reason]||0)+1;const c=countries[r.sourceAdm0Id]??={confident:0,ambiguous:0,unmatched:0,fallback:0,residual:0};c[r.category]++;if(r.confidence!==null)histogram[r.confidence===0?'0':r.confidence<.5?'(0,.5)':r.confidence<.9?'[.5,.9)':r.confidence<.995?'[.9,.995)':'[.995,1]']++;}
  const beforeCounts={confident:0,ambiguous:0,unmatched:0,fallback:0,residual:0};for(const r of baseline.territories)beforeCounts[category(r)]++;
  const changed=records.filter(r=>old.has(r.id)&&old.get(r.id).adm1Id!==r.adm1Id).map(r=>({id:r.id,before:old.get(r.id).adm1Id,after:r.adm1Id,confidence:r.confidence}));
  const byType={};for(const o of overlaps){const c=byType[o.type]??={total:0,significant:0};c.total++;if(o.significant)c.significant++;}
  const byId=new Map(records.map(r=>[r.id,r]));
  for(const o of overlaps)if(o.significant)for(const id of o.ids){const r=byId.get(id);(r.significantOverlaps??=[]).push({id:o.ids.find(other=>other!==id),areaKm2:o.areaKm2,smallerShare:o.smallerShare,type:o.type});}
  for(const error of errors)for(const id of error.ids||[error.id]){const r=byId.get(id);if(r)(r.geometryWarnings??=[]).push(error);}
  for(const retry of numericalMatchingRetries){const r=byId.get(retry.id);if(r)(r.geometryWarnings??=[]).push(retry);}
  const fallbackRecords=records.filter(r=>r.category==='fallback');
  const overlapCoverage=new Set(overlaps.filter(o=>o.type==='fallback-adm2').flatMap(o=>o.ids.filter(id=>id.startsWith('fallback:'))));
  for(const r of fallbackRecords)r.fallbackDiagnosis=r.significantOverlaps?.length?'significant-adm2-coverage-assigned-to-other-or-no-parent':overlapCoverage.has(r.id)?'only-small-geometric-overlaps':'no-real-adm2-overlap-detected';
  const summary={version:2,sourceSha256:report.sourceSha256,geometry:'canonical atomic mesh; Natural Earth ADM1 matching diagnostics only',thresholds:{confidentShare:.995,maxCompetitorShare:.001,significantOverlapKm2:1,significantOverlapSmallerShare:.01},total:records.length,sourceCount:records.filter(r=>r.id.startsWith('gb:')).length,counts,confidenceHistogram:histogram,reasons,countries,mostProblematic:Object.entries(countries).map(([id,c])=>({id,...c,problems:c.ambiguous+c.unmatched+c.fallback})).sort((a,b)=>b.problems-a.problems||a.id.localeCompare(b.id,'en')),overlap:{testedPairs:pairCount,total:overlaps.length,significant:overlaps.filter(o=>o.significant).length,byType},errors,before:{counts:beforeCounts},comparison:{changedParents:changed.length,highConfidenceChanges:changed.filter(r=>r.confidence>=.994).length,removedIds:baseline.territories.filter(r=>!metadata.has(r.id)).map(r=>r.id),addedIds:matching.filter(r=>!old.has(r.id)).map(r=>r.id)},changedParents:changed,correctionSuggestions:corrections.length};
  await fs.mkdir(path.join(WORK,'audit'),{recursive:true});
  summary.atomic=await read('data/processed/canonical/invariants.json');
  summary.residual={count:records.filter(r=>r.category==='residual').length,areaKm2:round(records.filter(r=>r.category==='residual').reduce((n,r)=>n+r.areaKm2,0))};
  summary.migration=hierarchy.migration;
  summary.coverage=summary.atomic.coverage;
  summary.geometryConflicts=summary.atomic.intersectionErrors;
  summary.numericalMatchingRetries=numericalMatchingRetries;
  summary.aliases={XKX:'KOS',SSD:'SDS'};
  summary.fallbackAssessment={withoutAssignedRealChildren:fallbackRecords.filter(r=>r.assignedRealChildren===0).length,withSignificantRealOverlap:fallbackRecords.filter(r=>r.significantOverlaps?.length).length,withAnyRealOverlap:fallbackRecords.filter(r=>overlapCoverage.has(r.id)).length};
  summary.unverifiedDatelineIds=records.filter(r=>r.reason==='dateline-planar-uncertainty').map(r=>r.id);
  summary.legacyCountryUnresolved=records.filter(r=>r.adm1Id&&r.canonicalSourceAdm0Id!==r.adm0Id).map(r=>r.id);
  for(const [name,data]of Object.entries({summary,records,overlaps,corrections}))await fs.writeFile(path.join(WORK,'audit',`${name}.json`),JSON.stringify(data));
  console.log(JSON.stringify({counts,overlap:summary.overlap,corrections:corrections.length,errors:errors.length},null,2));
  return summary;
}
module.exports=audit;
if(require.main===module)audit().catch(e=>{console.error(e);process.exitCode=1;});
