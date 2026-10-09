// Read-only diagnostics over the authoritative portable economy monthly transition.
// All input is opt-in synthetic test data; no scenario files or saves are written.
const {performance}=require('node:perf_hooks');
const {initializeEconomy,prepareEconomyMonth}=require('../shared/economy.cjs');
const fixture=require('../tests/fixtures/economy-demand.cjs');
const chains=require('../tests/fixtures/production-chains.cjs');
const stock=(firm,goodId)=>firm.inventories.find(s=>s.goodId===goodId);
const integerDivide=(a,b)=>Number(BigInt(a)/BigInt(b));
function monthReport(opening,state,population){
  const {year,month}=state.stats.lastCompletedPeriod;
  console.log(`\n${year}-${String(month).padStart(2,'0')} — синтетическая экономика; деньги ${state.stats.cashBefore} → ${state.stats.cashAfter}`);
  const recipeAt=new Map(state.recipes.map(r=>[r.id,r])),needs=new Map(state.rules.consumerNeeds.map(n=>[n.id,n]));
  const rows=[];
  for(const market of state.markets){
    const firms=state.enterprises.filter(f=>market.provinceIds.includes(f.provinceId)),houses=state.households.filter(h=>market.provinceIds.includes(h.provinceId));
    const oldMarket=opening.markets.find(m=>m.id===market.id);
    for(const g of market.goods){
      const requests=houses.flatMap(h=>h.consumerState.filter(s=>needs.get(s.needId).goodId===g.goodId)),previous=oldMarket.goods.find(s=>s.goodId===g.goodId).priceMinor;
      rows.push({рынок:market.id,товар:g.goodId,выпуск:firms.reduce((n,f)=>n+(recipeAt.get(f.recipeId).output.goodId===g.goodId?f.stats.batches*recipeAt.get(f.recipeId).output.quantity:0),0),покупки:g.stats.purchased,население:requests.reduce((n,s)=>n+s.stats.purchased,0),потребность:requests.reduce((n,s)=>n+s.stats.need,0),неоплачиваемо:requests.reduce((n,s)=>n+s.stats.unaffordableNeed,0),недопоставка:requests.reduce((n,s)=>n+s.stats.rationedDemand,0),заказыПредприятий:g.stats.inputDemand,склады:firms.reduce((n,f)=>n+stock(f,g.goodId).quantity,0),вИспользовании:houses.reduce((n,h)=>n+(h.inUse.find(s=>s.goodId===g.goodId)?.quantity||0),0),цена:g.priceMinor,изменение:g.priceMinor-previous});
    }
  }
  console.table(rows);
  const labor=new Map(state.households.map(h=>[h.provinceId,Number(population.cohorts.filter(c=>c.territoryId===h.provinceId).reduce((n,c)=>n+BigInt(c.count),0n)*BigInt(state.rules.laborParticipationBps)/10000n)]));
  const enterpriseRows=[];
  for(const firm of state.enterprises){
    const previous=opening.enterprises.find(f=>f.id===firm.id),r=recipeAt.get(firm.recipeId),bounds=[['мощность',firm.capacityBatches],['работники',integerDivide(labor.get(firm.provinceId),r.workersPerBatch)]];
    const batchWage=r.workersPerBatch*firm.wagePerWorkerMinor;if(batchWage)bounds.push(['деньги на зарплату',integerDivide(previous.cashMinor,batchWage)]);
    for(const i of r.inputs)bounds.push(['материал '+i.goodId,integerDivide(stock(previous,i.goodId).quantity,i.quantity)]);
    const limiting=bounds.filter(([,value])=>value===firm.stats.batches).map(([name])=>name).join(', ');
    labor.set(firm.provinceId,labor.get(firm.provinceId)-firm.stats.workers);
    enterpriseRows.push({предприятие:firm.id,партии:firm.stats.batches,выручка:firm.stats.revenue,зарплата:firm.stats.wages,закупки:firm.stats.inputPurchases,себестоимостьПродаж:firm.stats.cogs,прибыль:firm.stats.profit,деньги:firm.cashMinor,ограничение:limiting});
  }
  console.table(enterpriseRows);
  console.table(state.households.map(h=>({домохозяйство:h.id,деньги:h.cashMinor,зарплата:h.stats.wages,расходы:h.stats.spending,неоплачиваемо:h.stats.unaffordableNeed,недопоставка:h.stats.rationedDemand})));
}
function createBenchmark(){
  const source=chains.createScenario(),hierarchy=structuredClone(chains.hierarchy),scenario=structuredClone(source),e=scenario.economy;
  e.rules.consumerNeeds=structuredClone(fixture.createScenario().economy.rules.consumerNeeds);
  e.markets=[];e.households=[];e.enterprises=[];scenario.population.cohorts=[];
  hierarchy.territories=[];scenario.ownership={};
  for(let m=0;m<10;m++){
    const provinceId='province:'+String(m+1).padStart(5,'0'),houseId='household-'+m;
    hierarchy.territories.push({...chains.hierarchy.territories[0],id:provinceId});scenario.ownership[provinceId]=m===0?'A':null;
    e.markets.push({...structuredClone(source.economy.markets[0]),id:'market-'+m,provinceIds:[provinceId]});
    e.households.push({id:houseId,provinceId,cashMinor:10000000});
    scenario.population.cohorts.push({...structuredClone(source.population.cohorts[0]),id:'pop-'+m,territoryId:provinceId,count:100000});
    for(let group=0;group<10;group++)for(const template of source.economy.enterprises){
      const firm=structuredClone(template);Object.assign(firm,{id:`enterprise-${m}-${group}-${template.recipeId}`,provinceId,ownerRef:{kind:'household',id:houseId}});e.enterprises.push(firm);
    }
  }
  return {scenario,hierarchy};
}
function runBenchmark(){
  const {scenario,hierarchy}=createBenchmark();let state=initializeEconomy(scenario.economy,hierarchy);const samples=[];
  for(let month=1;month<=12;month++){
    const start=performance.now();state=prepareEconomyMonth(state,scenario.population,hierarchy,{year:1700,month}).state;samples.push(performance.now()-start);
  }
  const sorted=[...samples].sort((a,b)=>a-b);
  console.log(JSON.stringify({synthetic:true,markets:state.markets.length,households:state.households.length,enterprises:state.enterprises.length,goods:state.goods.length,needs:state.rules.consumerNeeds.length,months:12,totalMs:Number(samples.reduce((a,b)=>a+b,0).toFixed(2)),medianMonthMs:Number(((sorted[5]+sorted[6])/2).toFixed(2)),maxMonthMs:Number(Math.max(...samples).toFixed(2)),cashBefore:state.stats.cashBefore,cashAfter:state.stats.cashAfter},null,2));
}
function main(args){
  if(args.length===1&&args[0]==='--benchmark'){runBenchmark();return;}
  if(args.length===1&&args[0]==='--constraints'){
    const scenario=fixture.createScenario(),e=scenario.economy;
    scenario.population.cohorts[0].count=20;
    for(const f of e.enterprises.filter(f=>f.provinceId==='province:00001'))f.capacityBatches=0;
    Object.assign(e.enterprises.find(f=>f.recipeId==='grow-fiber'),{capacityBatches:10,cashMinor:4});
    e.enterprises.find(f=>f.recipeId==='grow-grain').capacityBatches=10;
    e.enterprises.find(f=>f.recipeId==='make-charcoal').capacityBatches=5;
    const opening=initializeEconomy(e,fixture.hierarchy),state=prepareEconomyMonth(opening,scenario.population,fixture.hierarchy,{year:1700,month:1}).state;
    console.log('Синтетическая проверка ограничений: волокно — зарплата, зерно — оставшиеся работники, уголь — древесина.');
    monthReport(opening,state,scenario.population);return;
  }
  const months=args.length===0?12:Number(args[0]);
  if(args.length>1||!Number.isInteger(months)||months<1||months>120)throw Error('Usage: node scripts/economy-demand-demo.cjs [1..120 | --benchmark | --constraints]');
  const scenario=fixture.createScenario();let state=initializeEconomy(scenario.economy,fixture.hierarchy);
  console.log('Синтетические рынки: производство, сделки и stock in use. Инструменты без конечного потребителя; инвестиционного AI нет.');
  for(let index=0;index<months;index++){const opening=state;state=prepareEconomyMonth(state,scenario.population,fixture.hierarchy,{year:1700+Math.floor(index/12),month:index%12+1}).state;monthReport(opening,state,scenario.population);}
}
if(require.main===module)main(process.argv.slice(2));
module.exports={createBenchmark,monthReport};
