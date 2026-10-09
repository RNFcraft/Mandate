// Optional deterministic enterprise controller. No generation, RNG or cash injection.
const {number,compare}=require('./settlements.cjs');
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const add=(a,b)=>number(BigInt(a)+BigInt(b)),mul=(a,b)=>number(BigInt(a)*BigInt(b));
const defaults={windowMonths:6,profitPayoutBps:10000,reserveMonths:4,inputReserveMonths:2,outputReserveMonths:1,closeMonths:24,cooldownMonths:12,growthBps:1000,entryMonths:12,entryCapacity:10,organizationCostPerBatch:16,investorReserveMonths:24,capitalGoodId:'tools',capitalPerBatch:1,capitalLifetimeMonths:120,durableLifetimeMonths:60,birthRateBps:300,deathRateBps:250,urbanizationBps:5,urbanJobsPerMigrant:1};
function fields(o,keys){if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).length!==keys.length||keys.some(k=>!Object.hasOwn(o,k)))throw Error('Autonomy: invalid fields');}
const record=e=>({enterpriseId:e.id,status:'active',plannedBatches:e.capacityBatches,baseCapacity:e.capacityBatches,salesAverage:0,salesRemainder:0,observations:0,badMonths:0,goodMonths:0,cooldown:0,pendingCapacity:0,replacementCapacity:0,capitalInUse:{quantity:0,bookValueMinor:0,remainder:0},profitTotal:0,cashFlow:0,investment:0,depreciation:0,sold:0,idleReason:'demand'});
function enable(state,overrides={}){
  if(!state.systems.economy||!state.systems.settlements)throw Error('Autonomy: procedural economy and settlements required');
  if(state.systems.economy.autonomy)throw Error('Autonomy: already enabled');
  const next=structuredClone(state),e=next.systems.economy;
  e.autonomy={version:1,rules:{...defaults,...overrides},firms:e.enterprises.map(record),wear:e.households.map(h=>({householdId:h.id,remainders:h.inUse.map(s=>({goodId:s.goodId,remainder:0}))})),events:{opened:0,closed:0,reactivated:0,expanded:0,contracted:0,investment:0,maintenance:0},goods:e.goods.map(g=>({goodId:g.id,inUseRetired:0,capitalOpening:0,capitalAdded:0,capitalRetired:0,capitalClosing:0})),shortages:e.markets.flatMap(m=>m.goods.map(g=>({marketId:m.id,goodId:g.goodId,months:0}))),urbanized:0};
  validate(e);
  // Explicit activation changes future rates, never current counts or residuals.
  for(const c of next.systems.population.cohorts){c.birthRateBps=e.autonomy.rules.birthRateBps;c.deathRateBps=e.autonomy.rules.deathRateBps;}
  return next;
}
function validate(e){
  const a=e.autonomy;if(!Object.hasOwn(e,'autonomy'))return;
  fields(a,['version','rules','firms','wear','events','goods','shortages','urbanized']);fields(a.rules,Object.keys(defaults));
  const r=a.rules;
  if(a.version!==1||!e.rules.consumerNeeds||Object.entries(r).some(([k,v])=>k==='capitalGoodId'?!e.goods.some(g=>g.id===v):!safe(v))||['windowMonths','reserveMonths','inputReserveMonths','closeMonths','cooldownMonths','entryMonths','capitalPerBatch','capitalLifetimeMonths','durableLifetimeMonths','urbanJobsPerMigrant'].some(k=>!r[k])||r.windowMonths>120||r.profitPayoutBps>10000||r.growthBps>10000||r.urbanizationBps>10000||r.birthRateBps>10000||r.deathRateBps>10000)throw Error('Autonomy: invalid rules');
  fields(a.events,['opened','closed','reactivated','expanded','contracted','investment','maintenance']);if(!safe(a.urbanized)||Object.values(a.events).some(v=>!safe(v)))throw Error('Autonomy: invalid events');
  const ids=new Set(e.enterprises.map(f=>f.id)),seen=new Set();
  for(const f of a.firms){fields(f,Object.keys(record({id:'',capacityBatches:0})));fields(f.capitalInUse,['quantity','bookValueMinor','remainder']);if(!ids.has(f.enterpriseId)||seen.has(f.enterpriseId)||!['active','dormant','pending'].includes(f.status)||!['demand','materials','money','labor','closed','none'].includes(f.idleReason)||Object.entries(f).some(([k,v])=>!['enterpriseId','status','idleReason','capitalInUse','profitTotal','cashFlow'].includes(k)&&!safe(v))||!Number.isSafeInteger(f.profitTotal)||!Number.isSafeInteger(f.cashFlow)||Object.values(f.capitalInUse).some(v=>!safe(v))||f.capitalInUse.remainder>=r.capitalLifetimeMonths||f.salesRemainder>=r.windowMonths||!f.capitalInUse.quantity&&f.capitalInUse.bookValueMinor)throw Error('Autonomy: invalid enterprise controller');seen.add(f.enterpriseId);}
  if(seen.size!==ids.size)throw Error('Autonomy: missing enterprise controller');
  const households=new Map(e.households.map(h=>[h.id,h]));seen.clear();
  for(const w of a.wear){fields(w,['householdId','remainders']);const h=households.get(w.householdId);if(!h||seen.has(w.householdId)||w.remainders.length!==h.inUse.length)throw Error('Autonomy: invalid wear');seen.add(w.householdId);const goods=new Set();for(const s of w.remainders){fields(s,['goodId','remainder']);if(goods.has(s.goodId)||!h.inUse.some(i=>i.goodId===s.goodId)||!safe(s.remainder)||s.remainder>=r.durableLifetimeMonths)throw Error('Autonomy: invalid wear remainder');goods.add(s.goodId);}}
  if(seen.size!==households.size)throw Error('Autonomy: missing wear');
  seen.clear();for(const b of a.goods){fields(b,['goodId','inUseRetired','capitalOpening','capitalAdded','capitalRetired','capitalClosing']);if(!e.goods.some(g=>g.id===b.goodId)||seen.has(b.goodId)||Object.entries(b).some(([k,v])=>k!=='goodId'&&!safe(v))||BigInt(b.capitalOpening)+BigInt(b.capitalAdded)-BigInt(b.capitalRetired)!==BigInt(b.capitalClosing))throw Error('Autonomy: invalid capital balance');seen.add(b.goodId);}
  if(seen.size!==e.goods.length)throw Error('Autonomy: missing balances');
  if(e.stats.monthsProcessed){const installed=a.firms.reduce((n,f)=>add(n,f.capitalInUse.quantity),0);if(installed!==a.goods.find(g=>g.goodId===r.capitalGoodId).capitalClosing||a.goods.some(g=>g.goodId!==r.capitalGoodId&&(g.capitalOpening||g.capitalAdded||g.capitalRetired||g.capitalClosing)))throw Error('Autonomy: inconsistent installed capital');}
  const markets=new Set(e.markets.map(m=>m.id));seen.clear();for(const s of a.shortages){fields(s,['marketId','goodId','months']);const key=s.marketId+':'+s.goodId;if(!markets.has(s.marketId)||!e.goods.some(g=>g.id===s.goodId)||seen.has(key)||!safe(s.months))throw Error('Autonomy: invalid shortage history');seen.add(key);}if(seen.size!==e.markets.length*e.goods.length)throw Error('Autonomy: missing shortage history');
}
function signedAdd(a,b){const v=BigInt(a)+BigInt(b);if(v>BigInt(Number.MAX_SAFE_INTEGER)||v<BigInt(Number.MIN_SAFE_INTEGER))throw Error('Autonomy: integer overflow');return Number(v);}
function retire(stock,quantity,take){const value=quantity?take(stock,quantity):0;return value;}
function begin(e,old,population,marketAt,balance,take){
  const a=e.autonomy;if(!a)return null;const r=a.rules;
  for(const k of Object.keys(a.events))a.events[k]=0;
  const physical=new Map(a.goods.map(b=>{Object.assign(b,{inUseRetired:0,capitalOpening:0,capitalAdded:0,capitalRetired:0,capitalClosing:0});return [b.goodId,b];}));
  const houses=new Map(e.households.map(h=>[h.id,h]));
  for(const w of a.wear)for(const rem of w.remainders){const s=houses.get(w.householdId).inUse.find(s=>s.goodId===rem.goodId),n=BigInt(s.quantity)+BigInt(rem.remainder),q=Math.min(s.quantity,number(n/BigInt(r.durableLifetimeMonths)));rem.remainder=Number(n%BigInt(r.durableLifetimeMonths));retire(s,q,take);physical.get(s.goodId).inUseRetired=add(physical.get(s.goodId).inUseRetired,q);}
  const firms=new Map(a.firms.map(f=>[f.enterpriseId,f])),recipes=new Map(e.recipes.map(v=>[v.id,v]));
  const capacities=new Map(),recipeCapacity=new Map(),people=new Map();for(const c of population.cohorts)people.set(c.territoryId,add(people.get(c.territoryId)||0,c.count));
  for(const enterprise of e.enterprises){const f=firms.get(enterprise.id),recipe=recipes.get(enterprise.recipeId),key=marketAt.get(enterprise.provinceId).id+':'+recipe.output.goodId;capacities.set(key,add(capacities.get(key)||0,mul(enterprise.capacityBatches,recipe.output.quantity)));const rk=marketAt.get(enterprise.provinceId).id+':'+recipe.id;recipeCapacity.set(rk,add(recipeCapacity.get(rk)||0,enterprise.capacityBatches));}
  // Forecast final affordable needs, then propagate recipe requirements over the DAG.
  // This forecasts orders; it neither transfers nor creates physical inputs.
  const priceReserves=new Map(),forecast=new Map(),byOutput=new Map();for(const recipe of e.recipes){if(!byOutput.has(recipe.output.goodId))byOutput.set(recipe.output.goodId,[]);byOutput.get(recipe.output.goodId).push(recipe);}
  for(const h of e.households){let budget=add(h.cashMinor,add(h.stats.wages,h.stats.payout));const targets=new Map();for(const n of e.rules.consumerNeeds){const target=number(BigInt(people.get(h.provinceId)||0)*BigInt(n.perPersonNumerator)/BigInt(n.perPersonDenominator)),held=h.inUse.find(s=>s.goodId===n.goodId)?.quantity||0,need=n.usage==='durable'?Math.max(0,target-Math.max(held,targets.get(n.goodId)||0)):target;if(n.usage==='durable')targets.set(n.goodId,Math.max(targets.get(n.goodId)||0,target));const m=marketAt.get(h.provinceId),price=m.goods.find(g=>g.goodId===n.goodId).priceMinor,q=Math.min(need,Math.floor(budget/price));budget-=q*price;const key=m.id+':'+n.goodId;forecast.set(key,add(forecast.get(key)||0,q));}}
  const outgoing=new Map(e.goods.map(g=>[g.id,new Set()])),indegree=new Map(e.goods.map(g=>[g.id,0]));for(const recipe of e.recipes)for(const input of recipe.inputs)if(!outgoing.get(recipe.output.goodId).has(input.goodId)){outgoing.get(recipe.output.goodId).add(input.goodId);indegree.set(input.goodId,indegree.get(input.goodId)+1);}
  const queue=[...indegree].filter(([,n])=>!n).map(([id])=>id).sort(compare),order=[];while(queue.length){const id=queue.shift();order.push(id);for(const input of outgoing.get(id)){indegree.set(input,indegree.get(input)-1);if(!indegree.get(input))queue.push(input);}}
  // Cyclic recipes retain observed demand; forecasts never recurse forever.
  for(const m of e.markets){for(const g of m.goods){const key=m.id+':'+g.goodId;if(!order.includes(g.goodId)||g.goodId===r.capitalGoodId)forecast.set(key,Math.max(forecast.get(key)||0,g.stats.inputDemand));}for(const goodId of order){const alternatives=byOutput.get(goodId)||[],key=m.id+':'+goodId,demand=forecast.get(key)||0,total=capacities.get(key)||0;for(const recipe of alternatives){const capacity=recipeCapacity.get(m.id+':'+recipe.id)||0;if(!capacity||!total)continue;const batches=Math.min(capacity,number((BigInt(demand)*BigInt(capacity)+BigInt(total)-1n)/BigInt(total)));for(const input of recipe.inputs){const k=m.id+':'+input.goodId;forecast.set(k,add(forecast.get(k)||0,mul(batches,input.quantity)));}}}}
  for(const enterprise of e.enterprises){const f=firms.get(enterprise.id),recipe=recipes.get(enterprise.recipeId),m=marketAt.get(enterprise.provinceId),key=m.id+':'+recipe.output.goodId,total=capacities.get(key)||1,demand=forecast.get(key)||0,share=number((BigInt(demand)*BigInt(enterprise.capacityBatches)*BigInt(recipe.output.quantity)+BigInt(total)-1n)/BigInt(total)),out=enterprise.inventories.find(s=>s.goodId===recipe.output.goodId);
    const p=physical.get(r.capitalGoodId);p.capitalOpening=add(p.capitalOpening,f.capitalInUse.quantity);const n=BigInt(f.capitalInUse.quantity)+BigInt(f.capitalInUse.remainder),retired=Math.min(f.capitalInUse.quantity,number(n/BigInt(r.capitalLifetimeMonths)));f.capitalInUse.remainder=Number(n%BigInt(r.capitalLifetimeMonths));f.depreciation=retire(f.capitalInUse,retired,take);p.capitalRetired=add(p.capitalRetired,retired);const supported=add(f.baseCapacity,Math.floor(f.capitalInUse.quantity/r.capitalPerBatch));if(enterprise.capacityBatches>supported){const lost=enterprise.capacityBatches-supported;enterprise.capacityBatches=supported;f.pendingCapacity=add(f.pendingCapacity,lost);f.replacementCapacity=add(f.replacementCapacity,lost);a.events.contracted++;}
    f.investment=0;f.sold=0;f.cashFlow=-enterprise.cashMinor;f.cooldown=Math.max(0,f.cooldown-1);
    if(f.status==='dormant'&&f.badMonths===0&&demand&&out.quantity<share*r.outputReserveMonths+recipe.output.quantity&&enterprise.cashMinor>=recipe.workersPerBatch*enterprise.wagePerWorkerMinor){f.status='active';f.badMonths=0;a.events.reactivated++;}
    const desired=Math.max(share,f.salesAverage);priceReserves.set(key,add(priceReserves.get(key)||0,mul(Math.min(desired,mul(enterprise.capacityBatches,recipe.output.quantity)),r.outputReserveMonths)));const target=mul(desired,r.outputReserveMonths+1),batches=Math.max(0,Math.ceil((target-out.quantity)/recipe.output.quantity));
    f.plannedBatches=f.status==='active'?Math.min(enterprise.capacityBatches,batches):0;f.idleReason=f.status==='dormant'?'closed':f.plannedBatches?'none':'demand';
  }
  return {firms,physical,forecast,priceReserves};
}
function investmentOrders(e,context,marketAt,stocks,orders){
  const a=e.autonomy,r=a.rules,reserved=new Map();for(const o of orders)if(o.kind){const price=marketAt.get(o.buyer.provinceId).goods.find(g=>g.goodId===o.goodId).priceMinor;reserved.set(o.buyer.id,add(reserved.get(o.buyer.id)||0,mul(o.quantity,price)));}
  for(const enterprise of e.enterprises){const f=context.firms.get(enterprise.id);if(f.status==='dormant')continue;const recipe=e.recipes.find(v=>v.id===enterprise.recipeId),m=marketAt.get(enterprise.provinceId),capital=stocks.get(enterprise.id).get(r.capitalGoodId),desired=mul(f.pendingCapacity,r.capitalPerBatch),price=m.goods.find(g=>g.goodId===r.capitalGoodId).priceMinor,reserve=mul(mul(enterprise.capacityBatches,recipe.workersPerBatch*enterprise.wagePerWorkerMinor),r.reserveMonths),quantity=Math.min(Math.max(0,desired-capital.quantity),Math.floor(Math.max(0,enterprise.cashMinor-reserve-(reserved.get(enterprise.id)||0))/price));if(quantity){const g=m.goods.find(g=>g.goodId===r.capitalGoodId);g.stats.inputDemand=add(g.stats.inputDemand,quantity);orders.push({marketId:m.id,goodId:r.capitalGoodId,kind:2,buyer:enterprise,quantity});}}
}
function finish(e,context,marketAt,stocks,labor,houseAt,take,transfer,balance){
  const a=e.autonomy,r=a.rules;
  for(const enterprise of e.enterprises){const f=context.firms.get(enterprise.id),recipe=e.recipes.find(v=>v.id===enterprise.recipeId),m=marketAt.get(enterprise.provinceId),g=m.goods.find(v=>v.goodId===recipe.output.goodId),s=enterprise.stats;
    const numerator=BigInt(f.salesAverage)*BigInt(r.windowMonths-1)+BigInt(f.sold)+BigInt(f.salesRemainder);f.salesAverage=number(numerator/BigInt(r.windowMonths));f.salesRemainder=Number(numerator%BigInt(r.windowMonths));f.observations=add(f.observations,1);f.profitTotal=signedAdd(f.profitTotal,signedAdd(s.profit,-f.depreciation));
    const costs=add(mul(recipe.workersPerBatch,enterprise.wagePerWorkerMinor),recipe.inputs.reduce((n,i)=>add(n,mul(i.quantity,m.goods.find(g=>g.goodId===i.goodId).priceMinor)),0)),margin=BigInt(g.priceMinor)*BigInt(recipe.output.quantity)>BigInt(costs);
    const bad=(!f.sold&&!g.stats.affordableDemand&&!g.stats.inputDemand)||(!s.batches&&f.idleReason==='money')||(!margin&&f.observations>=r.windowMonths);f.badMonths=bad?add(f.badMonths,1):0;f.goodMonths=margin&&s.profit>0&&f.sold>=s.batches*recipe.output.quantity&&g.stats.shortage>0?add(f.goodMonths,1):0;
    if(f.status==='active'&&f.badMonths>=r.closeMonths){f.status='dormant';f.plannedBatches=0;a.events.closed++;}
    if(!f.cooldown&&!f.pendingCapacity&&f.goodMonths>=r.windowMonths){f.pendingCapacity=Math.max(1,number(BigInt(enterprise.capacityBatches)*BigInt(r.growthBps)/10000n));}
    if(f.pendingCapacity){const q=mul(f.pendingCapacity,r.capitalPerBatch),stock=stocks.get(enterprise.id).get(r.capitalGoodId),cost=mul(f.pendingCapacity,r.organizationCostPerBatch),workers=mul(f.pendingCapacity,recipe.workersPerBatch),reserve=mul(mul(enterprise.capacityBatches,recipe.workersPerBatch*enterprise.wagePerWorkerMinor),r.reserveMonths);
      if(stock.quantity>=q&&enterprise.cashMinor>=add(cost,reserve)&&labor.get(enterprise.provinceId)>=workers){const value=take(stock,q);f.capitalInUse.quantity=add(f.capitalInUse.quantity,q);f.capitalInUse.bookValueMinor=add(f.capitalInUse.bookValueMinor,add(value,cost));context.physical.get(r.capitalGoodId).capitalAdded=add(context.physical.get(r.capitalGoodId).capitalAdded,q);transfer(enterprise,houseAt.get(enterprise.provinceId),cost);houseAt.get(enterprise.provinceId).stats.wages=add(houseAt.get(enterprise.provinceId).stats.wages,cost);labor.set(enterprise.provinceId,labor.get(enterprise.provinceId)-workers);enterprise.capacityBatches=add(enterprise.capacityBatches,f.pendingCapacity);f.investment=add(f.investment,add(value,cost));a.events.investment=add(a.events.investment,f.investment);if(f.replacementCapacity)a.events.maintenance=add(a.events.maintenance,f.investment);if(f.pendingCapacity>f.replacementCapacity)a.events.expanded++;f.replacementCapacity=0;f.pendingCapacity=0;f.cooldown=r.cooldownMonths;f.status='active';}
    }
    // Existing capacity is legacy organizational capital; installed additions wear out.
    f.cashFlow=signedAdd(f.cashFlow,enterprise.cashMinor);const p=context.physical.get(r.capitalGoodId);p.capitalClosing=add(p.capitalClosing,f.capitalInUse.quantity);
  }
  for(const b of balance.values())b.closing=0;
  const marketGoods=new Map(e.markets.flatMap(m=>m.goods.map(g=>[m.id+':'+g.goodId,g])));for(const s of a.shortages){const g=marketGoods.get(s.marketId+':'+s.goodId);s.months=g.stats.shortage>0?add(s.months,1):0;}
}
function develop(e,population,settlementState,hierarchy){
  const a=e.autonomy;if(!a)return settlementState;
  const r=a.rules,next=structuredClone(settlementState),profiles=require('./world-economy-rules.cjs').placement;
  const firms=new Map(e.enterprises.map(f=>[f.id,f])),controllers=new Map(a.firms.map(f=>[f.enterpriseId,f])),recipes=new Map(e.recipes.map(v=>[v.id,v])),people=new Map(),used=new Map(),jobs=new Map(),houseAt=new Map(e.households.map(h=>[h.provinceId,h]));
  for(const c of population.cohorts)people.set(c.territoryId,add(people.get(c.territoryId)||0,c.count));
  for(const f of e.enterprises)used.set(f.provinceId,add(used.get(f.provinceId)||0,f.stats.workers));
  for(const p of next.placements){const f=firms.get(p.enterpriseId);if(p.kind==='settlement'&&f.stats.revenue>0)jobs.set(f.provinceId,add(jobs.get(f.provinceId)||0,f.stats.workers));}
  // Entry is a funded pending workshop. Capital must be bought and installed before
  // its first batch. No stocks or equipment are initialized at entry.
  const rowsAt=new Map();for(const row of next.rows){if(!rowsAt.has(row.provinceId))rowsAt.set(row.provinceId,[]);rowsAt.get(row.provinceId).push(row);}
  const marketById=new Map(e.markets.map(m=>[m.id,m]));
  for(const shortage of a.shortages){
    if(shortage.months<r.entryMonths||e.stats.monthsProcessed%r.cooldownMonths)continue;
    const market=marketById.get(shortage.marketId),candidates=e.recipes.filter(v=>v.output.goodId===shortage.goodId);
    if(e.enterprises.some(f=>market.provinceIds.includes(f.provinceId)&&recipes.get(f.recipeId).output.goodId===shortage.goodId&&controllers.get(f.id).status==='pending'))continue;
    for(const recipe of candidates){const profile=profiles[recipe.id];if(!profile)continue;
      const capitalSupply=e.enterprises.some(f=>market.provinceIds.includes(f.provinceId)&&recipes.get(f.recipeId).output.goodId===r.capitalGoodId&&f.inventories.find(s=>s.goodId===r.capitalGoodId).quantity>=r.entryCapacity*r.capitalPerBatch);
      if(!capitalSupply)continue;
      const row=market.provinceIds.flatMap(id=>rowsAt.get(id)||[]).filter(s=>s.specializations.includes(profile.specialization)&&Math.floor((people.get(s.provinceId)||0)*e.rules.laborParticipationBps/10000)-(used.get(s.provinceId)||0)>=r.entryCapacity*recipe.workersPerBatch).sort((a,b)=>compare(a.id,b.id))[0];if(!row)continue;
      const h=houseAt.get(row.provinceId),prices=new Map(market.goods.map(g=>[g.goodId,g.priceMinor])),batchCost=recipe.inputs.reduce((n,i)=>add(n,mul(i.quantity,prices.get(i.goodId))),recipe.workersPerBatch*8),funding=add(mul(r.entryCapacity,batchCost*r.reserveMonths+r.organizationCostPerBatch),mul(r.entryCapacity*r.capitalPerBatch,prices.get(r.capitalGoodId))),reserve=number(BigInt(people.get(row.provinceId)||0)*BigInt(prices.get(e.rules.foodGoodId))*BigInt(r.investorReserveMonths)/100n);
      if(h.cashMinor<add(funding,reserve))continue;
      const id=`auto-${e.stats.monthsProcessed}-${market.id.slice(7)}-${recipe.id}`;if(firms.has(id))continue;
      const enterprise={id,provinceId:row.provinceId,ownerRef:{kind:'household',id:h.id},recipeId:recipe.id,capacityBatches:0,wagePerWorkerMinor:8,cashMinor:funding,inventories:e.goods.map(g=>({goodId:g.id,quantity:0,bookValueMinor:0})),stats:Object.fromEntries(['batches','workers','wages','inputsConsumedValue','productionCost','inputPurchases','revenue','cogs','profit','payout'].map(k=>[k,0]))};
      h.cashMinor-=funding;e.enterprises.push(enterprise);const controller=record(enterprise);controller.status='pending';controller.pendingCapacity=r.entryCapacity;a.firms.push(controller);firms.set(id,enterprise);controllers.set(id,controller);next.placements.push({enterpriseId:id,settlementId:row.id,kind:profile.external?'external':'settlement'});a.events.opened++;break;
    }
  }
  // Province-local rural -> urban transfer, capped by actual paid processor jobs
  // and food deliveries. Preserve demographic attributes and rate remainders.
  const urbanCounts=new Map();for(const c of population.cohorts)if(c.settlement==='urban')urbanCounts.set(c.territoryId,add(urbanCounts.get(c.territoryId)||0,c.count));
  const urbanByTuple=new Map();const tuple=c=>JSON.stringify([c.territoryId,c.cultureId,c.religionId,c.stratumId,c.literacyBps,c.birthRateBps,c.deathRateBps]);
  for(const c of population.cohorts)if(c.settlement==='urban')urbanByTuple.set(tuple(c),c);
  let movedTotal=0;
  for(const c of [...population.cohorts].sort((a,b)=>compare(a.id,b.id))){if(c.settlement!=='rural'||!c.count)continue;const h=houseAt.get(c.territoryId);if(!h)continue;
    const foodNeeds=h.consumerState.filter(s=>e.rules.consumerNeeds.find(n=>n.id===s.needId).priority==='essential');if(foodNeeds.some(s=>s.stats.purchased*100<s.stats.need*95))continue;
    const occupied=urbanCounts.get(c.territoryId)||0,slots=Math.max(0,(jobs.get(c.territoryId)||0)*r.urbanJobsPerMigrant-occupied),quantity=Math.min(slots,number(BigInt(c.count)*BigInt(r.urbanizationBps)/10000n));if(!quantity)continue;
    const key=tuple(c);let urban=urbanByTuple.get(key);if(!urban){urban={...c,id:`urban-${c.id}`,settlement:'urban',count:0,birthRemainder:0,deathRemainder:0};if(population.cohorts.some(v=>v.id===urban.id))throw Error('Autonomy: cohort ID collision');population.cohorts.push(urban);urbanByTuple.set(key,urban);}
    const previousUrbanCount=urban.count;urban.count=add(urban.count,quantity);
    for(const field of ['birthRemainder','deathRemainder']){const part=number(BigInt(c[field])*BigInt(quantity)/BigInt(c.count));c[field]-=part;urban[field]+=part;if(urban[field]>=120000){const units=Math.floor(urban[field]/120000);urban[field]%=120000;urban.count=field==='birthRemainder'?add(urban.count,units):number(BigInt(urban.count)-BigInt(units));population.stats[field==='birthRemainder'?'births':'deaths']=add(population.stats[field==='birthRemainder'?'births':'deaths'],units);}}
    c.count-=quantity;movedTotal=add(movedTotal,quantity);urbanCounts.set(c.territoryId,number(BigInt(urbanCounts.get(c.territoryId)||0)+BigInt(urban.count)-BigInt(previousUrbanCount)));
    if(!(rowsAt.get(c.territoryId)||[]).some(s=>s.classification==='urban')){const id=`settlement-${c.territoryId.slice(9)}-u01`;const row={id,provinceId:c.territoryId,type:'town',name:'Synthetic town '+c.territoryId.slice(9),classification:'urban',population:0,weight:1,position:null,capitalOf:[],specializations:['food-processing','textiles']};next.rows.push(row);rowsAt.get(c.territoryId).push(row);}
  }
  a.urbanized=add(a.urbanized,movedTotal);population.cohorts.sort((a,b)=>compare(a.id,b.id));require('./population.cjs').validatePopulationState(population,hierarchy);
  return require('./settlements.cjs').canonicalizeSettlements(next);
}
function report(state){
  const e=state.systems.economy,p=state.systems.population,s=state.systems.settlements,a=e.autonomy,types={},industries={},reasons={},goods={},totals={urban:0,rural:0},recipes=new Map(e.recipes.map(r=>[r.id,r]));
  for(const c of p.cohorts)totals[c.settlement]=add(totals[c.settlement],c.count);
  let wages=0,revenue=0,profit=0,depreciation=0,cashFlow=0,capacity=0,batches=0,employment=0,payout=0,inventoryValue=0;
  for(const f of e.enterprises){const industry=recipes.get(f.recipeId).output.goodId;if(!industries[industry])industries[industry]={capacity:0,batches:0,produced:0};const row=industries[industry];row.capacity=add(row.capacity,f.capacityBatches);row.batches=add(row.batches,f.stats.batches);row.produced=add(row.produced,mul(f.stats.batches,recipes.get(f.recipeId).output.quantity));capacity=add(capacity,f.capacityBatches);batches=add(batches,f.stats.batches);wages=add(wages,f.stats.wages);revenue=add(revenue,f.stats.revenue);profit=signedAdd(profit,f.stats.profit);employment=add(employment,f.stats.workers);payout=add(payout,f.stats.payout);for(const stock of f.inventories)inventoryValue=add(inventoryValue,stock.bookValueMinor);}
  for(const f of a?.firms||[]){reasons[f.idleReason]=(reasons[f.idleReason]||0)+1;depreciation=add(depreciation,f.depreciation);cashFlow=signedAdd(cashFlow,f.cashFlow);}
  for(const row of s.rows)types[row.type]=(types[row.type]||0)+1;
  const needs=new Map(e.rules.consumerNeeds.map(n=>[n.id,n]));for(const b of e.stats.goods)goods[b.goodId]={...b,...(a?.goods.find(g=>g.goodId===b.goodId)||{}),need:0,householdPurchased:0,unaffordable:0,traded:0,shortage:0,surplus:0,priceMin:Number.MAX_SAFE_INTEGER,priceMax:0};
  for(const h of e.households)for(const n of h.consumerState){const g=goods[needs.get(n.needId).goodId];g.need=add(g.need,n.stats.need);g.householdPurchased=add(g.householdPurchased,n.stats.purchased);g.unaffordable=add(g.unaffordable,n.stats.unaffordableNeed);}
  for(const m of e.markets)for(const v of m.goods){const g=goods[v.goodId];g.traded=add(g.traded,v.stats.purchased);g.shortage=add(g.shortage,v.stats.shortage);g.surplus=add(g.surplus,v.stats.surplus);g.priceMin=Math.min(g.priceMin,v.priceMinor);g.priceMax=Math.max(g.priceMax,v.priceMinor);}
  const householdCash=e.households.reduce((n,h)=>add(n,h.cashMinor),0),enterpriseCash=e.enterprises.reduce((n,f)=>add(n,f.cashMinor),0);
  return {date:{...state.clock.date},population:add(totals.urban,totals.rural),...totals,births:p.stats.births,deaths:p.stats.deaths,urbanizationBps:number(BigInt(totals.urban)*10000n/BigInt(Math.max(1,totals.urban+totals.rural))),settlementTypes:types,largestCities:[...s.rows].filter(r=>r.classification==='urban').sort((a,b)=>b.population-a.population||compare(a.id,b.id)).slice(0,5).map(r=>({id:r.id,population:r.population})),enterprises:e.enterprises.length,active:e.enterprises.filter(f=>f.stats.batches>0).length,dormant:a?.firms.filter(f=>f.status==='dormant').length||0,pending:a?.firms.filter(f=>f.status==='pending').length||0,capacity,batches,employment,availableLabor:number(BigInt(totals.urban+totals.rural)*BigInt(e.rules.laborParticipationBps)/10000n),wages,investmentLabor:e.households.reduce((n,h)=>add(n,h.stats.wages),0)-wages,revenue,profit,operatingProfit:signedAdd(profit,-depreciation),depreciation,cashFlow,payout,inventoryValue,householdCash,enterpriseCash,cash:add(householdCash,enterpriseCash),capitalQuantity:(a?.firms||[]).reduce((n,f)=>add(n,f.capitalInUse.quantity),0),capitalValue:(a?.firms||[]).reduce((n,f)=>add(n,f.capitalInUse.bookValueMinor),0),urbanized:a?.urbanized||0,events:{...a?.events},idleReasons:reasons,industries,goods};
}
module.exports={defaults,enable,validate,begin,investmentOrders,finish,develop,report,record,number,add,mul,signedAdd};
