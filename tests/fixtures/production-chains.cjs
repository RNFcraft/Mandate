// Synthetic local economy only: no historical enterprises or calibrated prices.
const base=require('./economy.cjs');
const registry=require('../../shared/production-registry.cjs');
function createScenario(){
  const scenario=structuredClone(base.scenario),economy=scenario.economy;
  scenario.scenario.id='synthetic-production-chains';
  scenario.population.cohorts[0].count=1000;
  economy.goods=structuredClone(registry.goods);economy.recipes=structuredClone(registry.recipes);
  // Enough working capital for twelve months without final textile/tool buyers.
  economy.rules={...economy.rules,foodPerPersonNumerator:1,foodPerPersonDenominator:100,maxPriceAdjustmentBps:1000,profitPayoutBps:0};
  economy.households[0].cashMinor=100000;
  economy.markets[0].goods=economy.goods.map(g=>({goodId:g.id,priceMinor:10}));
  economy.enterprises=economy.recipes.map(r=>({id:'enterprise-'+r.id,provinceId:'province:00001',ownerRef:{kind:'household',id:'household-local'},recipeId:r.id,capacityBatches:10,wagePerWorkerMinor:2,cashMinor:100000,inventories:economy.goods.map(g=>({goodId:g.id,quantity:0,bookValueMinor:0}))}));
  return scenario;
}
module.exports={hierarchy:base.hierarchy,createScenario};
