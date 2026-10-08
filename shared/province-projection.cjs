// Offline deterministic atomic data projection. Never a runtime ownership layer.
const compare=(a,b)=>a<b?-1:a>b?1:0;
function allocate(total,intersections){
  if(!Number.isSafeInteger(total)||total<0||!intersections.length)throw Error('Invalid population allocation');
  const rows=intersections.map(r=>({provinceId:r.provinceId,fraction:r.allocationFraction})).sort((a,b)=>compare(a.provinceId,b.provinceId));
  const mass=rows.reduce((s,r)=>s+r.fraction,0);if(!Number.isFinite(mass)||mass<=0||rows.some(r=>!Number.isFinite(r.fraction)||r.fraction<0))throw Error('Invalid allocation fractions');
  let assigned=0;for(const r of rows){const exact=total*r.fraction/mass;r.count=Math.floor(exact);r.remainder=exact-r.count;assigned+=r.count;}
  const order=[...rows].sort((a,b)=>b.remainder-a.remainder||compare(a.provinceId,b.provinceId));
  for(let i=0;i<total-assigned;i++)order[i%order.length].count++;
  if(rows.reduce((s,r)=>s+r.count,0)!==total)throw Error('Cohort population was not conserved');
  return rows.map(({provinceId,count})=>({provinceId,count}));
}
function projectPopulation(source,mapping){
  const merged=new Map();let checkedCohorts=0;const totals={input:0,output:0,urban:0,rural:0};
  for(const cohort of source.cohorts.slice().sort((a,b)=>compare(a.id,b.id))){
    const row=mapping[cohort.territoryId];if(!row)throw Error(`No mapping for cohort ${cohort.id}`);
    const identity=Object.fromEntries(Object.keys(cohort).filter(k=>!['id','territoryId','count'].includes(k)).sort(compare).map(k=>[k,cohort[k]]));
    for(const allocation of allocate(cohort.count,row.intersections)){
      if(!allocation.count)continue;
      const key=JSON.stringify([allocation.provinceId,identity]);if(!merged.has(key))merged.set(key,{territoryId:allocation.provinceId,...identity,count:0});
      merged.get(key).count+=allocation.count;totals.output+=allocation.count;
    }totals.input+=cohort.count;totals[cohort.settlement]+=cohort.count;checkedCohorts++;
  }
  const cohorts=[...merged].sort(([a],[b])=>compare(a,b)).map(([,c],i)=>({id:`gp-${String(i+1).padStart(7,'0')}`,...c}));
  return {population:{...source,cohorts},qa:{sourceCohortCount:source.cohorts.length,outputCohortCount:cohorts.length,checkedCohorts,cohortConservationFailures:0,...totals,difference:totals.output-totals.input}};
}
function projectAssignments(owners,controllers,mapping,provinceIds){
  const scores=new Map(provinceIds.map(id=>[id,{owners:new Map(),controllers:new Map()}]));
  for(const atomId of Object.keys(mapping).sort(compare)){
    if(!Object.hasOwn(owners,atomId))throw Error(`Incomplete atomic ownership: ${atomId}`);
    const owner=owners[atomId],controller=Object.hasOwn(controllers||{},atomId)?controllers[atomId]:owner;
    for(const r of mapping[atomId].intersections){if(r.overlapAreaKm2<=0)continue;const s=scores.get(r.provinceId);if(!s)throw Error('Unknown mapped province');
      for(const [key,value]of [['owners',owner],['controllers',controller]])s[key].set(value,(s[key].get(value)||0)+r.overlapAreaKm2);
    }
  }
  const ownership={},control={},ambiguous=[],fallback=[];
  const winner=(id,key)=>{const rows=[...scores.get(id)[key]].sort((a,b)=>b[1]-a[1]||compare(a[0]??'',b[0]??''));if(!rows.length){fallback.push({provinceId:id,layer:key,policy:'no-positive-overlap-neutral'});return null;}
    if(rows.length>1)ambiguous.push({provinceId:id,layer:key,winner:rows[0][0],winnerAreaKm2:rows[0][1],runner:rows[1][0],runnerAreaKm2:rows[1][1],tie:Math.abs(rows[0][1]-rows[1][1])<1e-12});return rows[0][0];};
  for(const id of provinceIds){ownership[id]=winner(id,'owners');const controller=winner(id,'controllers');if(controller!==ownership[id])control[id]=controller;}
  return {ownership,controllers:control,qa:{provinceCount:provinceIds.length,assigned:provinceIds.filter(id=>ownership[id]!==null).length,ambiguous,fallback}};
}
function projectScenario(data,mapping,hierarchy){
  const result=projectAssignments(data.ownership,data.controllers,mapping,hierarchy.territories.map(t=>t.id)),capitals=[];
  const countries=data.countries.map(c=>{if(c.capitalRegionId===null)return {...c};const previous=c.capitalRegionId;
    const choices=(mapping[previous]?.intersections||[]).filter(r=>r.overlapAreaKm2>0&&result.ownership[r.provinceId]===c.id).sort((a,b)=>b.overlapAreaKm2-a.overlapAreaKm2||compare(a.provinceId,b.provinceId));
    const capital=choices[0]?.provinceId??null;capitals.push({countryId:c.id,sourceCapital:previous,provinceId:capital,policy:capital?'maximum-owned-positive-overlap':'no-owned-capital-overlap-cleared'});
    const {legacyCapitalRegionId,capitalMigration,...rest}=c;return {...rest,capitalRegionId:capital};});
  const {territoryMigration,...scenario}=data.scenario;
  return {data:{...data,scenario:{...scenario,version:4,geography:hierarchy.id},countries,ownership:result.ownership,controllers:result.controllers},qa:{...result.qa,capitals}};
}
function projectPoliticalAsset(asset,mapping,hierarchy){
  const owners=Object.fromEntries(Object.keys(mapping).map(id=>[id,asset.owners[id]??null]));
  const result=projectAssignments(owners,asset.controllers,mapping,hierarchy.territories.map(t=>t.id));
  return {asset:{...asset,geography:hierarchy.id,owners:Object.fromEntries(Object.entries(result.ownership).filter(([,owner])=>owner!==null)),controllers:result.controllers,provenance:{...asset.provenance,authoringGeography:asset.geography,projectionMethod:'positive-overlap-area-ascii-v1'}},qa:result.qa};
}
module.exports={allocate,projectPopulation,projectAssignments,projectScenario,projectPoliticalAsset};
