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
function project(state,ids,openingOpportunities){
  const selected=new Set(ids),markets=state.markets.filter(m=>selected.has(m.id)),provinces=new Set(markets.flatMap(m=>m.provinceIds)),enterprises=state.enterprises.filter(e=>provinces.has(e.provinceId)),households=state.households.filter(h=>provinces.has(h.provinceId)),firms=new Set(enterprises.map(e=>e.id)),houses=new Set(households.map(h=>h.id));
  const trade=state.trade?{trade:{...state.trade,...(state.trade.routing?{routing:{...state.trade.routing,cargo:[],planning:{incoming:state.trade.routing.cargo.filter(c=>firms.has(c.ownerId)||houses.has(c.ownerId)).map(c=>({ownerId:c.ownerId,goodId:c.goodId,quantity:c.quantity})),opportunities:(openingOpportunities??require('./economy-routes.cjs').opportunities(state)).filter(o=>selected.has(o.marketId))},month:require('./economy-routes.cjs').empty()}}:{}),edges:[],flows:[],performance:state.trade.performance.filter(s=>firms.has(s.enterpriseId)),month:{quantity:0,goodsPayments:0,freight:0,workers:0},householdStocks:state.trade.householdStocks.filter(s=>houses.has(s.householdId)),labor:state.trade.labor.filter(s=>provinces.has(s.provinceId))}}:{};
  return {...state,markets,enterprises,households,...(state.agriculture?{agriculture:{...state.agriculture,rows:state.agriculture.rows.filter(r=>provinces.has(r.provinceId))}}:{}),...(state.householdEconomy?{householdEconomy:{...state.householdEconomy,profitClaims:state.householdEconomy.profitClaims.filter(c=>firms.has(c.enterpriseId)),rows:state.householdEconomy.rows.filter(r=>houses.has(r.householdId))}}:{}),...trade,...(state.autonomy?{autonomy:{...state.autonomy,firms:state.autonomy.firms.filter(f=>firms.has(f.enterpriseId)),wear:state.autonomy.wear.filter(w=>houses.has(w.householdId)),shortages:state.autonomy.shortages.filter(s=>selected.has(s.marketId)),...(state.autonomy.foodSecurity?{foodSecurity:{...state.autonomy.foodSecurity,households:state.autonomy.foodSecurity.households.filter(h=>houses.has(h.householdId))}}:{})}}:{})};
}
function merge(opening,parts,hierarchy,period){
  const next={...opening,markets:parts.flatMap(p=>p.markets),households:parts.flatMap(p=>p.households),enterprises:parts.flatMap(p=>p.enterprises),stats:{monthsProcessed:sum(opening.stats.monthsProcessed,1),lastCompletedPeriod:{...period},cashBefore:0,cashAfter:0,goods:opening.stats.goods.map(g=>Object.fromEntries(Object.keys(g).map(k=>[k,k==='goodId'?g.goodId:0])))}};
  for(const p of parts){for(const k of ['cashBefore','cashAfter'])next.stats[k]=sum(next.stats[k],p.stats[k]);const goods=new Map(p.stats.goods.map(g=>[g.goodId,g]));for(const g of next.stats.goods)for(const k of Object.keys(g))if(k!=='goodId')g[k]=sum(g[k],goods.get(g.goodId)[k]);}
  if(opening.autonomy){const a=opening.autonomy;next.autonomy={...a,firms:parts.flatMap(p=>p.autonomy.firms),wear:parts.flatMap(p=>p.autonomy.wear),shortages:parts.flatMap(p=>p.autonomy.shortages),...(a.foodSecurity?{foodSecurity:{...a.foodSecurity,households:parts.flatMap(p=>p.autonomy.foodSecurity.households)}}:{}),events:Object.fromEntries(Object.keys(a.events).map(k=>[k,parts.reduce((n,p)=>sum(n,p.autonomy.events[k]),0)])),goods:a.goods.map(g=>Object.fromEntries(Object.keys(g).map(k=>[k,k==='goodId'?g.goodId:parts.reduce((n,p)=>sum(n,p.autonomy.goods.find(b=>b.goodId===g.goodId)[k]),0)])))};}
  if(opening.agriculture)next.agriculture={...opening.agriculture,methods:[...opening.agriculture.methods],rows:parts.flatMap(p=>p.agriculture.rows)};
  if(opening.householdEconomy)next.householdEconomy={...opening.householdEconomy,profitClaims:parts.flatMap(p=>p.householdEconomy.profitClaims),rows:parts.flatMap(p=>p.householdEconomy.rows)};
  if(opening.trade)next.trade={...opening.trade,edges:[...opening.trade.edges],performance:opening.trade.performance.map(p=>({...p})),householdStocks:parts.flatMap(p=>p.trade.householdStocks),householdOpening:parts.reduce((n,p)=>sum(n,p.trade.householdOpening),0),consumedImports:parts.reduce((n,p)=>sum(n,p.trade.consumedImports),0),labor:parts.flatMap(p=>p.trade.labor),flows:[],month:{quantity:0,goodsPayments:0,freight:0,workers:0}};
  if(opening.trade?.routing){next.trade.routing=structuredClone(opening.trade.routing);next.trade.routing.month=require('./economy-routes.cjs').empty();for(const c of next.trade.routing.cargo){for(const k of ['opening','closing']){const b=next.stats.goods.find(g=>g.goodId===c.goodId);b[k]=sum(b[k],c.quantity);}next.stats.cashBefore=sum(next.stats.cashBefore,c.escrowMinor);next.stats.cashAfter=sum(next.stats.cashAfter,c.escrowMinor);}}
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
