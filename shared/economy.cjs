// Economy v1: portable JSON state, local clearing and exact inventory accounting.
const autonomy=require('./autonomous-economy.cjs');
const {TAG}=require('./scenario.cjs');
const compare=(a,b)=>a<b?-1:a>b?1:0;
const fail=message=>{throw Error(`Economy: ${message}`);};
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const signed=n=>Number.isSafeInteger(n);
const bps=n=>Number.isInteger(n)&&n>=0&&n<=10000;
function number(n){if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))fail('integer overflow');return Number(n);}
const divide=(a,b)=>Number(BigInt(a)/BigInt(b));
const add=(a,b)=>number(BigInt(a)+BigInt(b));
const mul=(a,b)=>number(BigInt(a)*BigInt(b));
const subtract=(a,b)=>number(BigInt(a)-BigInt(b));
function fields(o,keys){
  if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).length!==keys.length||keys.some(k=>!Object.hasOwn(o,k)))fail('invalid fields');
  if(Object.keys(o).some(k=>['__proto__','prototype','constructor'].includes(k)))fail('unsafe key');
}
function tag(id){if(typeof id!=='string'||!TAG.test(id)||['__proto__','prototype','constructor'].includes(id))fail('invalid ID');}
function registry(rows,key='id'){
  if(!Array.isArray(rows))fail('expected array');const out=new Map();
  for(const row of rows){tag(row?.[key]);if(out.has(row[key]))fail('duplicate ID');out.set(row[key],row);}return out;
}
function quantities(row,keys){fields(row,keys);if(keys.some(k=>!safe(row[k])))fail('invalid quantity or cash');}
const enterpriseKeys=['batches','workers','wages','inputsConsumedValue','productionCost','inputPurchases','revenue','cogs','profit','payout'];
const householdKeys=['essentialNeed','affordableDemand','purchased','unmetNeed','unaffordableNeed','rationedDemand','wages','spending','payout'];
const marketKeys=['supply','essentialNeed','affordableDemand','inputDemand','purchased','shortage','surplus'];
const needKeys=['need','affordableDemand','purchased','unmetNeed','unaffordableNeed','rationedDemand','spending'];
const priorities={essential:0,ordinary:1,luxury:2};
const zero=keys=>Object.fromEntries(keys.map(k=>[k,0]));
function checkDemand(s,need){
  if(s.affordableDemand>s[need]||s.purchased>s.affordableDemand||s.unmetNeed!==s[need]-s.purchased||s.unaffordableNeed!==s[need]-s.affordableDemand||s.rationedDemand!==s.affordableDemand-s.purchased)fail('inconsistent household statistics');
}
function durableGoods(needs){return [...new Set(needs.filter(n=>n.usage==='durable').map(n=>n.goodId))].sort(compare);}
function validate(data,hierarchy,runtime){
  fields(data,['version','rules','goods','recipes','markets','households','enterprises',...(runtime?['stats']:[]),...(Object.hasOwn(data,'autonomy')?['autonomy']:[]),...(Object.hasOwn(data,'trade')?['trade']:[])]);
  if(data.version!==1||hierarchy.id!=='mandate-provinces-v1')fail('unsupported version/geography');
  if((Object.hasOwn(data,'autonomy')||Object.hasOwn(data,'trade'))&&!runtime)fail('autonomy is runtime-only; enable it explicitly');
  const rules=data.rules,multi=Object.hasOwn(rules||{},'consumerNeeds');fields(rules,['foodGoodId','foodPerPersonNumerator','foodPerPersonDenominator','laborParticipationBps','maxPriceAdjustmentBps','profitPayoutBps',...(multi?['consumerNeeds']:[])]);
  if(!safe(rules.foodPerPersonNumerator)||!safe(rules.foodPerPersonDenominator)||rules.foodPerPersonDenominator===0||!bps(rules.laborParticipationBps)||!bps(rules.maxPriceAdjustmentBps)||!bps(rules.profitPayoutBps))fail('invalid rules');
  const goods=registry(data.goods),recipes=registry(data.recipes),markets=registry(data.markets),houses=registry(data.households),enterprises=registry(data.enterprises);
  if(!goods.has(rules.foodGoodId))fail('unknown food good');
  const needs=multi?registry(rules.consumerNeeds):new Map(),usage=new Map();
  for(const n of needs.values()){
    fields(n,['id','goodId','priority','perPersonNumerator','perPersonDenominator','usage']);
    if(!goods.has(n.goodId)||typeof n.priority!=='string'||!Object.hasOwn(priorities,n.priority)||!safe(n.perPersonNumerator)||!safe(n.perPersonDenominator)||n.perPersonDenominator===0||!['consumable','durable'].includes(n.usage))fail('invalid consumer need');
    if(usage.has(n.goodId)&&usage.get(n.goodId)!==n.usage)fail('conflicting good usage');usage.set(n.goodId,n.usage);
  }
  const durable=multi?durableGoods(rules.consumerNeeds):[];
  for(const g of goods.values()){
    fields(g,['id','name','quantityUnit','minPriceMinor','maxPriceMinor']);
    if(typeof g.name!=='string'||!g.name.trim()||g.name.length>160||typeof g.quantityUnit!=='string'||!g.quantityUnit.trim()||g.quantityUnit.length>32||!safe(g.minPriceMinor)||g.minPriceMinor===0||!safe(g.maxPriceMinor)||g.maxPriceMinor<g.minPriceMinor)fail('invalid good');
  }
  const checkItem=item=>{fields(item,['goodId','quantity']);if(!goods.has(item.goodId)||!safe(item.quantity)||item.quantity===0)fail('invalid recipe quantity');};
  for(const r of recipes.values()){
    fields(r,['id','inputs','output','workersPerBatch']);registry(r.inputs,'goodId');r.inputs.forEach(checkItem);checkItem(r.output);
    if(!safe(r.workersPerBatch)||r.workersPerBatch===0)fail('invalid required labor');
  }
  const territories=new Set(hierarchy.territories.map(t=>t.id)),coverage=new Map();
  for(const m of markets.values()){
    fields(m,['id','provinceIds','accountingUnitId','goods']);tag(m.accountingUnitId);
    if(!Array.isArray(m.provinceIds)||!m.provinceIds.length)fail('empty coverage');
    for(const id of m.provinceIds){if(!territories.has(id)||!/^province:\d{5}$/.test(id)||coverage.has(id))fail('invalid/duplicate market coverage');coverage.set(id,m.id);}
    const states=registry(m.goods,'goodId');if(states.size!==goods.size)fail('missing market good');
    for(const s of states.values()){
      fields(s,['goodId','priceMinor',...(runtime?['priceRemainder','stats']:[])]);const g=goods.get(s.goodId);
      if(!g||!safe(s.priceMinor)||s.priceMinor<g.minPriceMinor||s.priceMinor>g.maxPriceMinor)fail('invalid market price');
      if(runtime){if(!signed(s.priceRemainder)||Math.abs(s.priceRemainder)>=10000)fail('invalid price remainder');quantities(s.stats,marketKeys);if(s.stats.purchased>s.stats.supply||s.stats.purchased>add(s.stats.affordableDemand,s.stats.inputDemand)||s.stats.shortage!==Math.max(0,add(s.stats.affordableDemand,s.stats.inputDemand)-s.stats.supply)||s.stats.surplus!==Math.max(0,s.stats.supply-add(s.stats.affordableDemand,s.stats.inputDemand)))fail('inconsistent market statistics');}
    }
  }
  const byProvince=new Map();let cash=0n;
  for(const h of houses.values()){
    fields(h,['id','provinceId','cashMinor',...(runtime?['consumptionRemainder','stats']:[]),...(multi&&(runtime||Object.hasOwn(h,'inUse'))?['inUse']:[]),...(multi&&runtime?['consumerState']:[])]);
    if(!coverage.has(h.provinceId)||byProvince.has(h.provinceId)||!safe(h.cashMinor))fail('invalid household');byProvince.set(h.provinceId,h);cash+=BigInt(h.cashMinor);
    if(multi&&Object.hasOwn(h,'inUse')){
      const held=registry(h.inUse,'goodId');if(held.size!==durable.length)fail('missing in-use good');
      for(const s of held.values()){fields(s,['goodId','quantity','bookValueMinor']);if(!durable.includes(s.goodId)||!safe(s.quantity)||!safe(s.bookValueMinor)||s.quantity===0&&s.bookValueMinor!==0)fail('invalid in-use stock');}
    }
    if(runtime){
      if(!safe(h.consumptionRemainder)||h.consumptionRemainder>=rules.foodPerPersonDenominator||multi&&h.consumptionRemainder!==0)fail('invalid consumption remainder');
      quantities(h.stats,householdKeys);checkDemand(h.stats,'essentialNeed');
      if(multi){
        const states=registry(h.consumerState,'needId');if(states.size!==needs.size)fail('missing consumer state');
        const totals=zero(needKeys);
        for(const s of states.values()){
          fields(s,['needId','remainder','stats']);const n=needs.get(s.needId);
          if(!n||!safe(s.remainder)||s.remainder>=n.perPersonDenominator||n.usage==='durable'&&s.remainder!==0)fail('invalid need remainder');
          quantities(s.stats,needKeys);checkDemand(s.stats,'need');
          for(const key of needKeys)totals[key]=add(totals[key],s.stats[key]);
        }
        for(const key of needKeys)if(totals[key]!==h.stats[key==='need'?'essentialNeed':key])fail('inconsistent consumer totals');
      }
    }
  }
  if(byProvince.size!==coverage.size)fail('coverage needs one household per province');
  for(const e of enterprises.values()){
    fields(e,['id','provinceId','ownerRef','recipeId','capacityBatches','wagePerWorkerMinor','cashMinor','inventories',...(runtime?['stats']:[])]);
    fields(e.ownerRef,['kind','id']);const owner=houses.get(e.ownerRef.id);
    if(e.ownerRef.kind!=='household'||!owner||!coverage.has(e.provinceId)||coverage.get(owner.provinceId)!==coverage.get(e.provinceId)||!recipes.has(e.recipeId)||!safe(e.capacityBatches)||!safe(e.wagePerWorkerMinor)||!safe(e.cashMinor))fail('invalid enterprise');cash+=BigInt(e.cashMinor);
    const stocks=registry(e.inventories,'goodId');if(stocks.size!==goods.size)fail('missing enterprise inventory');
    for(const stock of stocks.values()){fields(stock,['goodId','quantity','bookValueMinor']);if(!goods.has(stock.goodId)||!safe(stock.quantity)||!safe(stock.bookValueMinor)||stock.quantity===0&&stock.bookValueMinor!==0)fail('invalid owned inventory');}
    if(runtime){fields(e.stats,enterpriseKeys);if(enterpriseKeys.some(k=>k==='profit'?!signed(e.stats[k]):!safe(e.stats[k])))fail('invalid accounting');if(e.stats.profit!==e.stats.revenue-e.stats.cogs||e.stats.productionCost!==add(e.stats.wages,e.stats.inputsConsumedValue)||e.stats.payout>Math.max(0,e.stats.profit))fail('inconsistent accounting');}
  }
  number(cash);
  if(runtime){
    fields(data.stats,['monthsProcessed','lastCompletedPeriod','cashBefore','cashAfter','goods']);
    if(!safe(data.stats.monthsProcessed)||!safe(data.stats.cashBefore)||!safe(data.stats.cashAfter)||data.stats.cashBefore!==data.stats.cashAfter)fail('invalid monthly statistics');
    const p=data.stats.lastCompletedPeriod;
    if(data.stats.monthsProcessed===0?p!==null:!p||Object.getPrototypeOf(p)!==Object.prototype)fail('invalid completed period');
    if(p){fields(p,['year','month']);if(!Number.isInteger(p.year)||p.year<1700||p.year>9999||!Number.isInteger(p.month)||p.month<1||p.month>12)fail('invalid completed period');}
    const balances=registry(data.stats.goods,'goodId');if(balances.size!==goods.size)fail('missing goods balance');
    for(const b of balances.values()){
      const keys=['opening','produced','inputsConsumed','householdConsumed','closing',...(multi?['inUseOpening','inUseAdded','inUseClosing']:[])];fields(b,['goodId',...keys]);
      if(!goods.has(b.goodId)||keys.some(k=>!safe(b[k]))||BigInt(b.opening)+BigInt(b.produced)-BigInt(b.inputsConsumed)-BigInt(b.householdConsumed)-BigInt(multi?b.inUseAdded:0)-BigInt(data.autonomy?.goods.find(g=>g.goodId===b.goodId).capitalAdded||0)!==BigInt(b.closing))fail('invalid goods balance');
      if(multi){
        if(BigInt(b.inUseOpening)+BigInt(b.inUseAdded)-BigInt(data.autonomy?.goods.find(g=>g.goodId===b.goodId).inUseRetired||0)!==BigInt(b.inUseClosing))fail('invalid in-use balance');
        if(data.stats.monthsProcessed){
          const held=[...houses.values()].reduce((sum,h)=>sum+BigInt(h.inUse.find(s=>s.goodId===b.goodId)?.quantity||0),0n);
          const closing=[...enterprises.values()].reduce((sum,e)=>sum+BigInt(e.inventories.find(s=>s.goodId===b.goodId).quantity),0n)+(data.trade&&b.goodId===rules.foodGoodId?data.trade.householdStocks.reduce((n,s)=>n+BigInt(s.quantity),0n):0n);
          let consumed=0n,stocked=0n;
          for(const h of houses.values())for(const s of h.consumerState){const n=needs.get(s.needId);if(n.goodId===b.goodId){if(n.usage==='durable')stocked+=BigInt(s.stats.purchased);else consumed+=BigInt(s.stats.purchased);}}
          if(held!==BigInt(b.inUseClosing)||closing!==BigInt(b.closing)||consumed!==BigInt(b.householdConsumed)||stocked!==BigInt(b.inUseAdded))fail('inconsistent physical holdings');
        }
      }
    }
  }
  if(data.trade&&data.stats.monthsProcessed){const b=data.stats.goods.find(g=>g.goodId===rules.foodGoodId),held=data.trade.householdStocks.reduce((n,s)=>add(n,s.quantity),0);if(b.closing<held)fail('invalid imported inventory');}
  autonomy.validate(data);require('./economy-trade.cjs').validate(data);return data;
}
const validateEconomyScenario=(data,hierarchy)=>validate(data,hierarchy,false);
const validateEconomyState=(data,hierarchy)=>validate(data,hierarchy,true);
function canonicalize(data){
  for(const k of ['goods','recipes','markets','households','enterprises'])data[k].sort((a,b)=>compare(a.id,b.id));
  for(const r of data.recipes)r.inputs.sort((a,b)=>compare(a.goodId,b.goodId));
  for(const m of data.markets){m.provinceIds.sort(compare);m.goods.sort((a,b)=>compare(a.goodId,b.goodId));}
  for(const e of data.enterprises)e.inventories.sort((a,b)=>compare(a.goodId,b.goodId));
  if(data.rules.consumerNeeds){
    data.rules.consumerNeeds.sort((a,b)=>priorities[a.priority]-priorities[b.priority]||compare(a.id,b.id));
    for(const h of data.households){h.inUse?.sort((a,b)=>compare(a.goodId,b.goodId));h.consumerState?.sort((a,b)=>compare(a.needId,b.needId));}
  }
  if(data.autonomy){if(data.autonomy.foodSecurity)data.autonomy.foodSecurity.households.sort((a,b)=>compare(a.householdId,b.householdId));data.autonomy.firms.sort((a,b)=>compare(a.enterpriseId,b.enterpriseId));data.autonomy.wear.sort((a,b)=>compare(a.householdId,b.householdId));data.autonomy.goods.sort((a,b)=>compare(a.goodId,b.goodId));data.autonomy.shortages.sort((a,b)=>compare(a.marketId,b.marketId)||compare(a.goodId,b.goodId));}
  if(data.trade){data.trade.householdStocks.sort((a,b)=>compare(a.householdId,b.householdId));data.trade.labor.sort((a,b)=>compare(a.provinceId,b.provinceId));data.trade.performance.sort((a,b)=>compare(a.enterpriseId,b.enterpriseId));data.trade.edges.sort((a,b)=>compare(a.a,b.a)||compare(a.b,b.b));}
  if(data.stats)data.stats.goods.sort((a,b)=>compare(a.goodId,b.goodId));return data;
}
function initializeEconomy(data,hierarchy){
  validateEconomyScenario(data,hierarchy);const next=canonicalize(structuredClone(data));
  for(const m of next.markets)for(const g of m.goods){g.priceRemainder=0;g.stats=zero(marketKeys);}
  for(const h of next.households){
    h.consumptionRemainder=0;h.stats=zero(householdKeys);
    if(next.rules.consumerNeeds){
      h.inUse??=durableGoods(next.rules.consumerNeeds).map(goodId=>({goodId,quantity:0,bookValueMinor:0}));
      h.consumerState=next.rules.consumerNeeds.map(n=>({needId:n.id,remainder:0,stats:zero(needKeys)})).sort((a,b)=>compare(a.needId,b.needId));
    }
  }
  for(const e of next.enterprises)e.stats=zero(enterpriseKeys);
  next.stats={monthsProcessed:0,lastCompletedPeriod:null,cashBefore:0,cashAfter:0,goods:next.goods.map(g=>({goodId:g.id,opening:0,produced:0,inputsConsumed:0,householdConsumed:0,closing:0,...(next.rules.consumerNeeds?{inUseOpening:0,inUseAdded:0,inUseClosing:0}:{})}))};
  validateEconomyState(next,hierarchy);return next;
}
function take(stock,quantity){
  if(quantity>stock.quantity)fail('insufficient owned inventory');
  const value=quantity===stock.quantity?stock.bookValueMinor:number(BigInt(stock.bookValueMinor)*BigInt(quantity)/BigInt(stock.quantity));
  stock.quantity=subtract(stock.quantity,quantity);stock.bookValueMinor=subtract(stock.bookValueMinor,value);return value;
}
function transfer(from,to,amount){from.cashMinor=subtract(from.cashMinor,amount);to.cashMinor=add(to.cashMinor,amount);}
function prepareEconomyMonth(state,population,hierarchy,period){
  validateEconomyState(state,hierarchy);
  return prepareValidatedMonth(state,population,hierarchy,period);
}
// Internal partition entry: the coordinator validates the complete opening world.
// Each local result and the merged world still undergo full closing validation.
function prepareValidatedMonth(state,population,hierarchy,period){
  if(state.stats.lastCompletedPeriod&&(period.year*12+period.month!==state.stats.lastCompletedPeriod.year*12+state.stats.lastCompletedPeriod.month+1))fail('nonconsecutive economic period');
  const next=canonicalize(structuredClone(state)),rules=next.rules,recipes=new Map(next.recipes.map(r=>[r.id,r])),houses=new Map(next.households.map(h=>[h.id,h])),houseAt=new Map(next.households.map(h=>[h.provinceId,h])),marketAt=new Map(next.markets.flatMap(m=>m.provinceIds.map(id=>[id,m])));
  const stocks=new Map(next.enterprises.map(e=>[e.id,new Map(e.inventories.map(s=>[s.goodId,s]))]));
  const mass=new Map();for(const c of population?.cohorts||[])mass.set(c.territoryId,add(mass.get(c.territoryId)||0,c.count));
  const labor=new Map(next.households.map(h=>[h.provinceId,number(BigInt(mass.get(h.provinceId)||0)*BigInt(rules.laborParticipationBps)/10000n)]));
  const totalCash=()=>number([...next.households,...next.enterprises].reduce((n,a)=>n+BigInt(a.cashMinor),0n));
  const multi=Object.hasOwn(rules,'consumerNeeds');
  const balance=new Map(next.goods.map(g=>[g.id,{goodId:g.id,opening:0,produced:0,inputsConsumed:0,householdConsumed:0,closing:0,...(multi?{inUseOpening:0,inUseAdded:0,inUseClosing:0}:{})}]));
  for(const e of next.enterprises)for(const s of e.inventories){const b=balance.get(s.goodId);b.opening=add(b.opening,s.quantity);}
  if(multi)for(const h of next.households)for(const s of h.inUse){const b=balance.get(s.goodId);b.inUseOpening=add(b.inUseOpening,s.quantity);}
  if(next.trade)for(const s of next.trade.householdStocks)balance.get(rules.foodGoodId).opening=add(balance.get(rules.foodGoodId).opening,s.quantity);
  const cashBefore=totalCash();
  if(next.trade){next.trade.householdOpening=next.trade.householdStocks.reduce((n,s)=>add(n,s.quantity),0);next.trade.consumedImports=0;next.trade.flows=[];next.trade.month={quantity:0,goodsPayments:0,freight:0,workers:0};}
  const management=autonomy.begin(next,state,population,marketAt,balance,take);
  for(const h of next.households)h.stats=zero(householdKeys);
  for(const m of next.markets)for(const g of m.goods)g.stats=zero(marketKeys);
  // Production uses only opening inputs. Later purchases cannot trigger another pass.
  for(const e of next.enterprises){
    e.stats=zero(enterpriseKeys);const r=recipes.get(e.recipeId),inv=stocks.get(e.id),house=houseAt.get(e.provinceId);
    const controller=management?.firms.get(e.id);let batches=Math.min(controller?controller.plannedBatches:e.capacityBatches,divide(labor.get(e.provinceId),r.workersPerBatch));if(controller&&batches<controller.plannedBatches)controller.idleReason='labor';
    const batchWage=mul(r.workersPerBatch,e.wagePerWorkerMinor);
    if(batchWage){const affordable=divide(e.cashMinor,batchWage);if(controller&&affordable<batches)controller.idleReason='money';batches=Math.min(batches,affordable);}
    for(const input of r.inputs){const available=divide(inv.get(input.goodId).quantity,input.quantity);if(controller&&available<batches)controller.idleReason='materials';batches=Math.min(batches,available);}
    const workers=mul(batches,r.workersPerBatch),wages=mul(workers,e.wagePerWorkerMinor);labor.set(e.provinceId,labor.get(e.provinceId)-workers);transfer(e,house,wages);house.stats.wages=add(house.stats.wages,wages);
    let inputsValue=0;
    for(const input of r.inputs){const quantity=mul(batches,input.quantity);if(quantity)inputsValue=add(inputsValue,take(inv.get(input.goodId),quantity));const b=balance.get(input.goodId);b.inputsConsumed=add(b.inputsConsumed,quantity);}
    const quantity=mul(batches,r.output.quantity),cost=add(wages,inputsValue),out=inv.get(r.output.goodId);out.quantity=add(out.quantity,quantity);out.bookValueMinor=add(out.bookValueMinor,cost);balance.get(r.output.goodId).produced=add(balance.get(r.output.goodId).produced,quantity);
    Object.assign(e.stats,{batches,workers,wages,inputsConsumedValue:inputsValue,productionCost:cost});
  }
  const importedAt=new Map((next.trade?.householdStocks||[]).map(s=>[s.householdId,s]));
  const orders=[];
  for(const h of next.households){
    if(multi){
      let budget=h.cashMinor;const targets=new Map(),states=new Map(h.consumerState.map(s=>[s.needId,s])),held=new Map(h.inUse.map(s=>[s.goodId,s]));
      for(const n of rules.consumerNeeds){
        const s=states.get(n.id),numerator=BigInt(mass.get(h.provinceId)||0)*BigInt(n.perPersonNumerator)+BigInt(n.usage==='consumable'?s.remainder:0);
        const target=number(numerator/BigInt(n.perPersonDenominator));s.remainder=n.usage==='consumable'?Number(numerator%BigInt(n.perPersonDenominator)):0;
        // Multiple durable needs raise one shared target, not additive stocks.
        const need=n.usage==='durable'?Math.max(0,target-Math.max(held.get(n.goodId).quantity,targets.get(n.goodId)||0)):target;
        if(n.usage==='durable')targets.set(n.goodId,Math.max(targets.get(n.goodId)||0,target));
        const m=marketAt.get(h.provinceId),g=m.goods.find(g=>g.goodId===n.goodId),arrival=next.trade&&n.goodId===rules.foodGoodId&&n.usage==='consumable'?importedAt.get(h.id):null,delivered=arrival?Math.min(need,arrival.quantity):0,affordable=Math.min(need-delivered,divide(budget,g.priceMinor));if(delivered){next.trade.consumedImports=add(next.trade.consumedImports,delivered);require('./economy-trade.cjs').take(arrival,delivered);balance.get(n.goodId).householdConsumed=add(balance.get(n.goodId).householdConsumed,delivered);}
        // Unfilled orders retain their reservation until next month's fresh budget.
        budget=subtract(budget,mul(affordable,g.priceMinor));
        s.stats={need,affordableDemand:add(affordable,delivered),purchased:delivered,unmetNeed:need-delivered,unaffordableNeed:need-delivered-affordable,rationedDemand:affordable,spending:0};
        for(const key of needKeys)h.stats[key==='need'?'essentialNeed':key]=add(h.stats[key==='need'?'essentialNeed':key],s.stats[key]);
        if(n.priority==='essential')g.stats.essentialNeed=add(g.stats.essentialNeed,need);g.stats.affordableDemand=add(g.stats.affordableDemand,affordable);
        orders.push({marketId:m.id,goodId:n.goodId,kind:0,buyer:h,quantity:affordable,needState:s,usage:n.usage,priority:priorities[n.priority]});
      }
      continue;
    }
    const numerator=BigInt(mass.get(h.provinceId)||0)*BigInt(rules.foodPerPersonNumerator)+BigInt(h.consumptionRemainder),need=number(numerator/BigInt(rules.foodPerPersonDenominator));h.consumptionRemainder=Number(numerator%BigInt(rules.foodPerPersonDenominator));
    const m=marketAt.get(h.provinceId),g=m.goods.find(g=>g.goodId===rules.foodGoodId),affordable=Math.min(need,divide(h.cashMinor,g.priceMinor));
    Object.assign(h.stats,{essentialNeed:need,affordableDemand:affordable,unmetNeed:need,unaffordableNeed:need-affordable,rationedDemand:affordable});g.stats.essentialNeed=add(g.stats.essentialNeed,need);g.stats.affordableDemand=add(g.stats.affordableDemand,affordable);
    orders.push({marketId:m.id,goodId:g.goodId,kind:0,buyer:h,quantity:affordable});
  }
  for(const e of next.enterprises){
    const r=recipes.get(e.recipeId),m=marketAt.get(e.provinceId);let budget=e.cashMinor;
    // Material purchases must not spend next month's entire payroll. Scale the
    // earmark to the current plan, not unused installed capacity.
    if(management)budget=Math.max(0,budget-mul(mul(management.firms.get(e.id).plannedBatches,r.workersPerBatch),e.wagePerWorkerMinor));
    for(const input of r.inputs){const g=m.goods.find(g=>g.goodId===input.goodId),target=mul(management?mul(management.firms.get(e.id).plannedBatches,next.autonomy.rules.inputReserveMonths):e.capacityBatches,input.quantity),quantity=Math.min(Math.max(0,target-stocks.get(e.id).get(input.goodId).quantity),divide(budget,g.priceMinor));budget=subtract(budget,mul(quantity,g.priceMinor));g.stats.inputDemand=add(g.stats.inputDemand,quantity);orders.push({marketId:m.id,goodId:input.goodId,kind:1,buyer:e,quantity});}
  }
  if(management)autonomy.investmentOrders(next,management,marketAt,stocks,orders);
  const offers=next.enterprises.map(e=>({seller:e,marketId:marketAt.get(e.provinceId).id,goodId:recipes.get(e.recipeId).output.goodId,stock:stocks.get(e.id).get(recipes.get(e.recipeId).output.goodId),remaining:stocks.get(e.id).get(recipes.get(e.recipeId).output.goodId).quantity}));
  const offersByMarket=new Map();
  for(const o of offers){
    let goods=offersByMarket.get(o.marketId);if(!goods)offersByMarket.set(o.marketId,goods=new Map());
    let bucket=goods.get(o.goodId);if(!bucket)goods.set(o.goodId,bucket={offers:[],start:0});
    bucket.offers.push(o);
    const g=marketAt.get(o.seller.provinceId).goods.find(g=>g.goodId===o.goodId);g.stats.supply=add(g.stats.supply,o.stock.quantity);
  }
  if(management)for(const goods of offersByMarket.values())for(const bucket of goods.values()){const offset=state.stats.monthsProcessed%bucket.offers.length;bucket.offers=[...bucket.offers.slice(offset),...bucket.offers.slice(0,offset)];}
  orders.sort((a,b)=>compare(a.marketId,b.marketId)||compare(a.goodId,b.goodId)||a.kind-b.kind||(a.priority??0)-(b.priority??0)||compare(a.buyer.id,b.buyer.id)||compare(a.needState?.needId||'',b.needState?.needId||''));
  for(const order of orders){
    const market=marketAt.get(order.buyer.provinceId),g=market.goods.find(g=>g.goodId===order.goodId);let remaining=order.quantity;
    const bucket=offersByMarket.get(order.marketId)?.get(order.goodId);if(!bucket)continue;
    while(bucket.start<bucket.offers.length&&!bucket.offers[bucket.start].remaining)bucket.start++;
    for(let offerIndex=bucket.start;offerIndex<bucket.offers.length&&remaining;offerIndex++){
      const o=bucket.offers[offerIndex];
      if(o.seller===order.buyer)continue;
      const quantity=Math.min(remaining,o.remaining,o.stock.quantity);if(!quantity)continue;
      const amount=mul(quantity,g.priceMinor),book=take(o.stock,quantity);transfer(order.buyer,o.seller,amount);remaining-=quantity;o.remaining-=quantity;g.stats.purchased=add(g.stats.purchased,quantity);o.seller.stats.revenue=add(o.seller.stats.revenue,amount);o.seller.stats.cogs=add(o.seller.stats.cogs,book);if(management){const f=management.firms.get(o.seller.id);f.sold=add(f.sold,quantity);}
      if(order.kind===0){
        const h=order.buyer;h.stats.purchased=add(h.stats.purchased,quantity);h.stats.spending=add(h.stats.spending,amount);h.stats.unmetNeed-=quantity;h.stats.rationedDemand-=quantity;
        if(order.needState){const s=order.needState.stats;s.purchased=add(s.purchased,quantity);s.spending=add(s.spending,amount);s.unmetNeed-=quantity;s.rationedDemand-=quantity;}
        const b=balance.get(order.goodId);
        if(order.usage==='durable'){const held=h.inUse.find(s=>s.goodId===order.goodId);held.quantity=add(held.quantity,quantity);held.bookValueMinor=add(held.bookValueMinor,amount);b.inUseAdded=add(b.inUseAdded,quantity);}
        else b.householdConsumed=add(b.householdConsumed,quantity);
      }
      else{const e=order.buyer,s=stocks.get(e.id).get(order.goodId);s.quantity=add(s.quantity,quantity);s.bookValueMinor=add(s.bookValueMinor,amount);e.stats.inputPurchases=add(e.stats.inputPurchases,amount);}
    }
  }
  for(const e of next.enterprises)e.stats.profit=e.stats.revenue-e.stats.cogs;
  for(const m of next.markets)for(const g of m.goods){
    const demand=add(g.stats.affordableDemand,g.stats.inputDemand),supply=g.stats.supply;g.stats.shortage=Math.max(0,demand-supply);g.stats.surplus=Math.max(0,supply-demand);
    // Every offered unit participates in price discovery. A planning reserve is
    // not a withheld warehouse and cannot manufacture a paid-order shortage.
    const pressure=BigInt(demand-supply)*10000n/BigInt(Math.max(demand,supply,1)),adjustment=pressure*BigInt(rules.maxPriceAdjustmentBps)/10000n,n=BigInt(g.priceMinor)*adjustment+BigInt(g.priceRemainder),delta=n/10000n,definition=next.goods.find(row=>row.id===g.goodId),raw=BigInt(g.priceMinor)+delta;
    const bounded=raw<BigInt(definition.minPriceMinor)?BigInt(definition.minPriceMinor):raw>BigInt(definition.maxPriceMinor)?BigInt(definition.maxPriceMinor):raw;g.priceMinor=number(bounded);g.priceRemainder=bounded!==raw?0:Number(n%10000n);
  }
  for(const e of next.enterprises){
    const r=recipes.get(e.recipeId),reserve=management?autonomy.workingReserve(next,e,r,marketAt.get(e.provinceId),management.firms.get(e.id)):mul(mul(e.capacityBatches,r.workersPerBatch),e.wagePerWorkerMinor),desired=number(BigInt(Math.max(0,e.stats.profit))*BigInt(next.autonomy?.rules.profitPayoutBps??rules.profitPayoutBps)/10000n),payout=Math.min(desired,Math.max(0,e.cashMinor-reserve)),owner=houses.get(e.ownerRef.id);transfer(e,owner,payout);e.stats.payout=payout;owner.stats.payout=add(owner.stats.payout,payout);
  }
  if(management)autonomy.finish(next,management,marketAt,stocks,labor,houseAt,take,transfer,balance);
  if(next.trade)next.trade.labor=[...labor].map(([provinceId,remaining])=>({provinceId,remaining}));
  for(const e of next.enterprises)for(const s of e.inventories){const b=balance.get(s.goodId);b.closing=add(b.closing,s.quantity);}
  if(multi)for(const h of next.households)for(const s of h.inUse){const b=balance.get(s.goodId);b.inUseClosing=add(b.inUseClosing,s.quantity);}
  if(next.trade)for(const s of next.trade.householdStocks)balance.get(rules.foodGoodId).closing=add(balance.get(rules.foodGoodId).closing,s.quantity);
  next.stats={monthsProcessed:add(state.stats.monthsProcessed,1),lastCompletedPeriod:{year:period.year,month:period.month},cashBefore,cashAfter:totalCash(),goods:[...balance.values()]};
  validateEconomyState(next,hierarchy);
  return {state:next,update:{monthsProcessed:next.stats.monthsProcessed,period:Object.freeze({...period})}};
}
function summarizeEconomy(state){return state?structuredClone(state):null;}
module.exports={prepareValidatedMonth,validateEconomyScenario,validateEconomyState,initializeEconomy,prepareEconomyMonth,summarizeEconomy,canonicalize};
