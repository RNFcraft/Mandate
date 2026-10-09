const economy=require('./economy.cjs');
const compare=(a,b)=>a<b?-1:a>b?1:0;
const sum=(a,b)=>{const n=BigInt(a)+BigInt(b);if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Economy: integer overflow');return Number(n);};
function partitionMarkets(state,count){
  const coverage=new Map(state.markets.flatMap(m=>m.provinceIds.map(id=>[id,m.id]))),weights=new Map(state.markets.map(m=>[m.id,m.provinceIds.length*4+m.goods.length*2]));
  for(const e of state.enterprises)weights.set(coverage.get(e.provinceId),weights.get(coverage.get(e.provinceId))+16+e.inventories.length+(state.autonomy?16:0));
  const groups=Array.from({length:Math.min(count,state.markets.length)},()=>({ids:[],weight:0}));
  for(const [id,weight]of [...weights].sort((a,b)=>b[1]-a[1]||compare(a[0],b[0]))){let target=groups[0];for(const group of groups)if(group.weight<target.weight)target=group;target.ids.push(id);target.weight+=weight;}
  return groups.map(g=>g.ids.sort(compare));
}
function project(state,ids){
  const selected=new Set(ids),markets=state.markets.filter(m=>selected.has(m.id)),provinces=new Set(markets.flatMap(m=>m.provinceIds)),enterprises=state.enterprises.filter(e=>provinces.has(e.provinceId)),households=state.households.filter(h=>provinces.has(h.provinceId)),firms=new Set(enterprises.map(e=>e.id)),houses=new Set(households.map(h=>h.id));
  return {...state,markets,enterprises,households,...(state.autonomy?{autonomy:{...state.autonomy,firms:state.autonomy.firms.filter(f=>firms.has(f.enterpriseId)),wear:state.autonomy.wear.filter(w=>houses.has(w.householdId)),shortages:state.autonomy.shortages.filter(s=>selected.has(s.marketId))}}:{})};
}
function merge(opening,parts,hierarchy,period){
  const next={...opening,markets:parts.flatMap(p=>p.markets),households:parts.flatMap(p=>p.households),enterprises:parts.flatMap(p=>p.enterprises),stats:{monthsProcessed:sum(opening.stats.monthsProcessed,1),lastCompletedPeriod:{...period},cashBefore:0,cashAfter:0,goods:opening.stats.goods.map(g=>Object.fromEntries(Object.keys(g).map(k=>[k,k==='goodId'?g.goodId:0])))}};
  for(const p of parts){for(const k of ['cashBefore','cashAfter'])next.stats[k]=sum(next.stats[k],p.stats[k]);const goods=new Map(p.stats.goods.map(g=>[g.goodId,g]));for(const g of next.stats.goods)for(const k of Object.keys(g))if(k!=='goodId')g[k]=sum(g[k],goods.get(g.goodId)[k]);}
  if(opening.autonomy){const a=opening.autonomy;next.autonomy={...a,firms:parts.flatMap(p=>p.autonomy.firms),wear:parts.flatMap(p=>p.autonomy.wear),shortages:parts.flatMap(p=>p.autonomy.shortages),events:Object.fromEntries(Object.keys(a.events).map(k=>[k,parts.reduce((n,p)=>sum(n,p.autonomy.events[k]),0)])),goods:a.goods.map(g=>Object.fromEntries(Object.keys(g).map(k=>[k,k==='goodId'?g.goodId:parts.reduce((n,p)=>sum(n,p.autonomy.goods.find(b=>b.goodId===g.goodId)[k]),0)])))};}
  // Static registries are shared read-only by all preparations; canonicalization
  // must not sort the authoritative opening arrays before the global commit.
  next.goods=[...next.goods];next.recipes=next.recipes.map(r=>({...r,inputs:[...r.inputs]}));next.rules={...next.rules,...(next.rules.consumerNeeds?{consumerNeeds:[...next.rules.consumerNeeds]}:{})};
  economy.canonicalize(next);economy.validateEconomyState(next,hierarchy);return {state:next,update:{monthsProcessed:next.stats.monthsProcessed,period:{...period}}};
}
function createPartitionEndpoint(send){
  let state,hierarchy;
  return request=>{
    const id=request.id;
    try{
      const {type,payload}=request;
      if(type==='Initialize'){state=payload.state;hierarchy=payload.hierarchy;send({id,result:true});return;}
      if(type!=='Prepare'||!state)throw Error('Partition not initialized');
      if(payload.period.year*12+payload.period.month!==payload.expectedPeriod)throw Error('Invalid partition period');
      if(payload.cash)for(const row of state.households)if(Object.hasOwn(payload.cash,row.id))row.cashMinor=payload.cash[row.id];
      if(payload.enterprises)state.enterprises.push(...payload.enterprises);
      if(payload.firms)state.autonomy.firms.push(...payload.firms);
      const start=performance.now(),result=economy.prepareValidatedMonth(state,{cohorts:payload.cohorts},hierarchy,payload.period);
      state=result.state;send({id,result:{state,metrics:{prepareMs:performance.now()-start,heapUsedBytes:typeof process!=='undefined'?process.memoryUsage().heapUsed:null}}});
    }catch(error){send({id,error:error.message});}
  };
}
module.exports={partitionMarkets,project,merge,createPartitionEndpoint};
