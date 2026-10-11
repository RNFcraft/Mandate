// Small synthetic markets only. No production scenario assets are loaded.
const base=require('./household-integration.cjs'),{generateSettlements}=require('../../shared/settlements.cjs');
function createScenario({distance=2,local=false,mixed=false,quantity=100,price=3,consumerGood='clothing'}={}){
  const data=base.createScenario({trade:true}),s=data.scenario,e=s.economy;
  s.scenario.id='synthetic-economy-v33';e.rules.consumerNeeds[0].perPersonNumerator=0;
  e.rules.consumerNeeds.push({id:'clothing',goodId:consumerGood,priority:'ordinary',perPersonNumerator:1,perPersonDenominator:100,usage:'durable'});
  const seller=e.enterprises[0];seller.recipeId=e.recipes.find(r=>r.output.goodId===consumerGood).id;
  for(const stock of seller.inventories){stock.quantity=stock.goodId===consumerGood?quantity:0;stock.bookValueMinor=stock.quantity*price;}
  for(const h of e.households)h.cashMinor=0;
  const buyerId=local?'household-local':distance===1?'household-neighbor':'household-far';e.households.find(h=>h.id===buyerId).cashMinor=10000;
  for(const m of e.markets)m.goods.find(g=>g.goodId===consumerGood).priceMinor=m.provinceIds.includes(seller.provinceId)?price:20;
  if(mixed){const cohort=s.population.cohorts.find(c=>c.territoryId==='province:00001');cohort.count=500;cohort.settlement='rural';s.population.cohorts.push({...cohort,id:'local-urban',settlement:'urban',count:500});}
  s.settlements=generateSettlements(s.population,data.hierarchy,s.countries,1700);
  for(const f of e.enterprises)s.settlements.placements.push({enterpriseId:f.id,settlementId:s.settlements.rows.find(r=>r.provinceId===f.provinceId).id,kind:'settlement'});
  return {...data,buyerId};
}
function setCash(h,rural,urban){h.cashMinor=rural+urban;if(h.accounts){h.accounts.rural.cashMinor=rural;h.accounts.urban.cashMinor=urban;}}
function legacyCash(h,value){delete h.accounts;h.cashMinor=value;}
module.exports={createScenario,setCash,legacyCash};
