// Explicitly synthetic. Reuses the opt-in production-chain fixture, never 1700 assets.
const chains=require('./production-chains.cjs');
function createScenario(){
  const scenario=chains.createScenario(),e=scenario.economy;
  scenario.scenario.id='synthetic-multi-good-demand';
  e.rules.consumerNeeds=[
    {id:'basic-food',goodId:'food',priority:'essential',perPersonNumerator:1,perPersonDenominator:100,usage:'consumable'},
    {id:'basic-clothing',goodId:'clothing',priority:'ordinary',perPersonNumerator:1,perPersonDenominator:20,usage:'durable'}
  ];
  e.markets[0].id='market-workshops';
  e.markets[0].goods.find(g=>g.goodId==='clothing').priceMinor=20;
  const provinceId='province:00002';
  e.markets.push({id:'market-poor',provinceIds:[provinceId],accountingUnitId:'synthetic-unit',goods:e.goods.map(g=>({goodId:g.id,priceMinor:g.id==='clothing'?30:20}))});
  e.households.push({id:'household-poor',provinceId,cashMinor:15});
  scenario.population.cohorts.push({...structuredClone(scenario.population.cohorts[0]),id:'pop-poor',territoryId:provinceId});
  for(const recipeId of ['grow-grain','mill-flour','prepare-food']){
    const firm=structuredClone(e.enterprises.find(f=>f.recipeId===recipeId));
    Object.assign(firm,{id:'poor-'+recipeId,provinceId,ownerRef:{kind:'household',id:'household-poor'},capacityBatches:2,wagePerWorkerMinor:1,cashMinor:1000});e.enterprises.push(firm);
  }
  return scenario;
}
module.exports={hierarchy:chains.hierarchy,createScenario};
