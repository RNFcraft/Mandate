const fs=require('node:fs/promises'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const {Simulation,ordinal,validateGameState}=require('../shared/simulation.cjs');
const {generateWorld}=require('../shared/world-economy.cjs');
const {makeSave,validateSave}=require('../shared/save.cjs');
const {loadWorldData}=require('./world-economy-data.cjs');
function options(args){
  const result={seed:1700,months:12,province:null,benchmark:false,save:null,load:null};
  for(let i=0;i<args.length;i++){
    const key=args[i];if(key==='--benchmark'){result.benchmark=true;continue;}
    if(!['--seed','--months','--province','--save','--load'].includes(key)||!args[i+1])throw Error('Unknown/missing option: '+key);
    result[key.slice(2)]=['--seed','--months'].includes(key)?Number(args[++i]):args[++i];
  }
  if(!Number.isInteger(result.seed)||result.seed<0||result.seed>0xffffffff||!Number.isInteger(result.months)||result.months<0||result.months>120)throw Error('Invalid seed/months');
  if(result.province&&!/^province:\d{5}$/.test(result.province))throw Error('Invalid province');return result;
}
function overview(state){
  const p=state.systems.population,e=state.systems.economy,s=state.systems.settlements,types={},recipes={},totals={urban:0,rural:0};
  for(const c of p.cohorts)totals[c.settlement]+=c.count;
  for(const r of s.rows)types[r.type]=(types[r.type]||0)+1;
  for(const f of e.enterprises)recipes[f.recipeId]=(recipes[f.recipeId]||0)+1;
  const marked=new Set(s.rows.flatMap(r=>r.capitalOf));
  return {population:totals.urban+totals.rural,...totals,settlements:s.rows.length,settlementTypes:types,markets:e.markets.length,enterprises:e.enterprises.length,industries:recipes,capitalsWithoutUrbanCenter:state.countries.filter(c=>c.capitalRegionId&&!marked.has(c.id)).map(c=>c.id),cash:[...e.households,...e.enterprises].reduce((n,a)=>n+a.cashMinor,0)};
}
function monthRows(opening,state){
  const e=state.systems.economy,recipes=new Map(e.recipes.map(r=>[r.id,r])),needs=new Map(e.rules.consumerNeeds.map(n=>[n.id,n]));
  const result=e.goods.map(g=>{
    const b=e.stats.goods.find(b=>b.goodId===g.id),d=e.households.flatMap(h=>h.consumerState.filter(s=>needs.get(s.needId).goodId===g.id));
    const market=e.markets.map(m=>m.goods.find(s=>s.goodId===g.id));
    return {товар:g.id,выпуск:b.produced,покупки:market.reduce((n,g)=>n+g.stats.purchased,0),потребность:d.reduce((n,s)=>n+s.stats.need,0),купленоНаселением:d.reduce((n,s)=>n+s.stats.purchased,0),неоплачиваемо:d.reduce((n,s)=>n+s.stats.unaffordableNeed,0),недопоставка:d.reduce((n,s)=>n+s.stats.rationedDemand,0),склады:b.closing,вИспользовании:b.inUseClosing,ценаМин:Math.min(...market.map(g=>g.priceMinor)),ценаМакс:Math.max(...market.map(g=>g.priceMinor))};
  });
  const before=new Map(opening.systems.economy.enterprises.map(f=>[f.id,f])),causes={materials:0,payroll:0,labor:0},usedAt=new Map();
  const people=new Map();for(const c of opening.systems.population.cohorts)people.set(c.territoryId,(people.get(c.territoryId)||0)+c.count);
  for(const f of e.enterprises){
    if(!f.stats.batches){
      const r=recipes.get(f.recipeId),old=before.get(f.id);
      if(r.inputs.some(i=>old.inventories.find(s=>s.goodId===i.goodId).quantity<i.quantity))causes.materials++;
      if(old.cashMinor<r.workersPerBatch*f.wagePerWorkerMinor)causes.payroll++;
      if(Math.floor((people.get(f.provinceId)||0)*e.rules.laborParticipationBps/10000)-(usedAt.get(f.provinceId)||0)<r.workersPerBatch)causes.labor++;
    }
    usedAt.set(f.provinceId,(usedAt.get(f.provinceId)||0)+f.stats.workers);
  }
  return {goods:result,active:e.enterprises.filter(f=>f.stats.batches).length,idle:e.enterprises.filter(f=>!f.stats.batches).length,idleCauses:causes,cashBefore:e.stats.cashBefore,cashAfter:e.stats.cashAfter};
}
async function main(args){
  const settings=options(args),{scenario,hierarchy,adjacency}=await loadWorldData(),times={};let start=performance.now();
  if(settings.province&&!hierarchy.territories.some(t=>t.id===settings.province))throw Error('Unknown province');
  let s;
  if(settings.load){s=new Simulation(scenario,hierarchy);const save=JSON.parse(await fs.readFile(settings.load,'utf8'));validateSave(save,hierarchy);s.load(save.state);}
  else{
    const generated=generateWorld(scenario,hierarchy,adjacency,settings.seed);times.generationMs=performance.now()-start;start=performance.now();
    s=new Simulation({...scenario,...generated},hierarchy,{seed:settings.seed});times.initializationMs=performance.now()-start;
  }
  const baseline=s.snapshot();if(!baseline.systems.settlements||!baseline.systems.economy)throw Error('This save has no procedural world');
  console.log('СИНТЕТИЧЕСКИЙ МИР 1700 — не реконструкция исторических предприятий; координаты поселений не подтверждены.');
  console.log(JSON.stringify({seed:baseline.systems.settlements.seed,...overview(baseline),...times},null,2));
  if(settings.province){
    console.table(s.settlementSummary(settings.province));const e=baseline.systems.economy;
    console.table(e.enterprises.filter(f=>f.provinceId===settings.province).map(f=>({id:f.id,recipe:f.recipeId,capacity:f.capacityBatches,cash:f.cashMinor})));
    console.log('Market:',JSON.stringify(e.markets.find(m=>m.provinceIds.includes(settings.province))||null));
  }
  const samples=[],history=[];
  for(let i=0;i<settings.months;i++){
    const opening=s.snapshot(),d=s.clock.date,next={year:d.year+(d.month===12?1:0),month:d.month===12?1:d.month+1,day:1};start=performance.now();s.step(ordinal(next)-ordinal(d));const ms=performance.now()-start;samples.push(ms);
    const state=s.snapshot(),report=monthRows(opening,state);history.push({period:state.systems.economy.stats.lastCompletedPeriod,ms,active:report.active,idle:report.idle,...report.idleCauses,cash:report.cashAfter,foodProduced:report.goods.find(g=>g.товар==='food').выпуск,foodPurchased:report.goods.find(g=>g.товар==='food').купленоНаселением,foodNeed:report.goods.find(g=>g.товар==='food').потребность,clothingPurchased:report.goods.find(g=>g.товар==='clothing').купленоНаселением});
    if(!settings.benchmark){console.log(`\nМесяц ${JSON.stringify(state.systems.economy.stats.lastCompletedPeriod)}, ${ms.toFixed(1)} мс`,JSON.stringify({...report,goods:undefined}));console.table(report.goods);}
  }
  start=performance.now();const serialized=s.serialize();times.serializeMs=performance.now()-start;const state=JSON.parse(serialized);
  start=performance.now();validateGameState(state,hierarchy);times.validationMs=performance.now()-start;
  start=performance.now();s.load(state);times.loadMs=performance.now()-start;
  times.gameStateBytes=Buffer.byteLength(serialized);times.heapUsedBytes=process.memoryUsage().heapUsed;
  times.monthMedianMs=samples.length?[...samples].sort((a,b)=>a-b)[Math.floor(samples.length/2)]:0;times.monthMaxMs=Math.max(0,...samples);
  console.table(history);console.log('Benchmark:',JSON.stringify(times,null,2));
  if(settings.save){const target=path.resolve(settings.save),scenarioRoot=path.resolve(__dirname,'../scenarios'),mapRoot=path.resolve(__dirname,'../client/data');if([scenarioRoot,mapRoot].some(root=>target.toLowerCase()===root.toLowerCase()||target.toLowerCase().startsWith((root+path.sep).toLowerCase())))throw Error('Refusing to write campaign into source assets');await fs.writeFile(target,JSON.stringify(makeSave(state)),{flag:'wx'});console.log('Save:',target);}
}
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={overview,monthRows,options};
