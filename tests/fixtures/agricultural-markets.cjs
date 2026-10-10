// Small authored synthetic state. No published world/scenario assets.
const base=require('./household-integration.cjs'),{Simulation,ordinal}=require('../../shared/simulation.cjs'),{generateSettlements}=require('../../shared/settlements.cjs');
function create({trade=true,mixed=false,cash=10000,stockGood='food',stockQuantity=120,formal=[]}={}){
  const data=base.createScenario({trade,buyer:true}),{scenario,hierarchy,adjacency}=data;
  scenario.economy.enterprises=[];scenario.economy.households.forEach(h=>h.cashMinor=h.id==='household-local'?cash:trade&&h.id==='household-neighbor'?0:cash);
  for(const t of hierarchy.territories)t.areaKm2=100;
  const source=scenario.population.cohorts.find(c=>c.territoryId==='province:00001');source.settlement='rural';
  if(mixed){source.count=100;scenario.population.cohorts.push({...source,id:'source-city',settlement:'urban',count:900});}
  for(const market of scenario.economy.markets)for(const g of market.goods)g.priceMinor=market.id==='market-far'?20:3;
  for(const [index,definition]of formal.entries()){const provinceId=definition.provinceId|| (trade?'province:00003':'province:00002'),owner=scenario.economy.households.find(h=>h.provinceId===provinceId);scenario.economy.enterprises.push({id:'synthetic-firm-'+index,provinceId,ownerRef:{kind:'household',id:owner.id},recipeId:definition.recipeId,capacityBatches:definition.capacityBatches??4,wagePerWorkerMinor:definition.wage??1,cashMinor:definition.cash??1000,inventories:scenario.economy.goods.map(g=>({goodId:g.id,quantity:definition.stocks?.[g.id]||0,bookValueMinor:0}))});}
  scenario.settlements=generateSettlements(scenario.population,hierarchy,scenario.countries,1700);for(const f of scenario.economy.enterprises)scenario.settlements.placements.push({enterpriseId:f.id,settlementId:scenario.settlements.rows.find(r=>r.provinceId===f.provinceId).id,kind:'settlement'});
  const s=new Simulation(scenario,hierarchy,{seed:1700,...(trade?{landAdjacency:adjacency}:{})});s.enableAutonomy({birthRateBps:0,deathRateBps:0,foodFeedback:false});
  const state=s.snapshot(),row=state.systems.economy.householdEconomy.rows.find(r=>r.householdId==='household-local'),stock=row.inventories.find(v=>v.goodId===stockGood),ledger=row.ledger.find(v=>v.goodId===stockGood);stock.quantity=stockQuantity;stock.bookValueMinor=stockQuantity*2;ledger.opening=ledger.closing=stockQuantity;s.load(state);
  return {s,...data};
}
function days(s){const d=s.clock.date;return ordinal({year:d.year+(d.month===12?1:0),month:d.month===12?1:d.month+1,day:1})-ordinal(d);}
function month(s){s.step(days(s));return s.economySummary();}
const farmer=e=>e.householdEconomy.rows.find(r=>r.householdId==='household-local');
const stock=(row,good)=>row.inventories.find(s=>s.goodId===good);
function edit(s,mutate){const v=s.snapshot();mutate(v.systems.economy,v);s.load(v);}
module.exports={create,month,days,farmer,stock,edit};
