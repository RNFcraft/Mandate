// Synthetic world CLI; legacy analysis helpers remain available to callers.
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
if(require.main===module)require('./autonomous-runner.cjs').main(process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={overview,monthRows,...require('./autonomous-runner.cjs')};
