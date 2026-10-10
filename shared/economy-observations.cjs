const {add,mul,number}=require('./autonomous-economy.cjs');
function summarize(e,provinceIds=null){
  const houses=e.households.filter(h=>!provinceIds||provinceIds.has(h.provinceId)),ids=new Set(houses.map(h=>h.id)),rows=(e.householdEconomy?.rows||[]).filter(r=>ids.has(r.householdId)),firms=e.enterprises.filter(f=>!provinceIds||provinceIds.has(f.provinceId)),controllers=new Map((e.autonomy?.firms||[]).map(c=>[c.enterpriseId,c])),recipes=new Map(e.recipes.map(r=>[r.id,r]));
  const result={naturalFoodProduced:0,naturalFoodConsumed:0,marketFoodConsumed:0,householdWorkers:0,householdSalesIncome:0,householdIncome:0,ownerIncome:0,noIncomeHouseholds:0,transportWorkers:e.trade?.routing?Object.entries(e.trade.routing.month.byProvince).filter(([id])=>!provinceIds||provinceIds.has(id)).reduce((n,[,r])=>add(n,r.workers),0):provinceIds?0:e.trade?.month.workers||0,cargoQuantity:0,transportEscrow:0,investmentsPlanned:0,investmentsCompletedValue:0};
  const actors=new Map([...e.households,...e.enterprises].map(a=>[a.id,a]));
  const income=new Map(houses.map(h=>[h.id,add(h.stats.wages,h.stats.payout)]));
  for(const row of rows){const food=row.ledger.find(b=>b.goodId===e.rules.foodGoodId);result.naturalFoodProduced=add(result.naturalFoodProduced,food.produced);result.naturalFoodConsumed=add(result.naturalFoodConsumed,food.consumed);result.householdWorkers=add(result.householdWorkers,row.workers);result.householdSalesIncome=add(result.householdSalesIncome,row.revenue);income.set(row.householdId,add(income.get(row.householdId),row.revenue));}
  const foodNeeds=new Set(e.rules.consumerNeeds?.filter(n=>n.goodId===e.rules.foodGoodId&&n.usage==='consumable').map(n=>n.id)||[]);
  for(const h of houses){result.ownerIncome=add(result.ownerIncome,h.stats.payout);result.householdIncome=add(result.householdIncome,income.get(h.id));if(!income.get(h.id))result.noIncomeHouseholds++;if(!e.rules.consumerNeeds)result.marketFoodConsumed=add(result.marketFoodConsumed,h.stats.purchased);for(const n of h.consumerState||[])if(foodNeeds.has(n.needId))result.marketFoodConsumed=add(result.marketFoodConsumed,n.stats.purchased);}
  result.marketFoodConsumed-=result.naturalFoodConsumed;
  for(const c of e.trade?.routing?.cargo||[]){const actor=actors.get(c.ownerId);if(!provinceIds||provinceIds.has(actor.provinceId)){result.cargoQuantity=add(result.cargoQuantity,c.quantity);result.transportEscrow=add(result.transportEscrow,c.escrowMinor);}}
  for(const f of firms){const c=controllers.get(f.id);if(c){result.investmentsPlanned=add(result.investmentsPlanned,c.pendingCapacity);result.investmentsCompletedValue=add(result.investmentsCompletedValue,number(BigInt(c.investment)>0n?BigInt(c.investment):0n));}}
  return result;
}
module.exports={summarize};
