const base=require('./population.cjs');
const hierarchy=structuredClone(base.hierarchy);
const population=structuredClone(base.population);
population.cohorts=[{...population.cohorts[0],count:100,birthRateBps:0,deathRateBps:0}];
const economy={version:1,
  rules:{foodGoodId:'food',foodPerPersonNumerator:1,foodPerPersonDenominator:1,laborParticipationBps:5000,maxPriceAdjustmentBps:1000,profitPayoutBps:10000},
  goods:[{id:'food',name:'Food',quantityUnit:'kg',minPriceMinor:1,maxPriceMinor:1000}],
  recipes:[{id:'farm',inputs:[],output:{goodId:'food',quantity:5},workersPerBatch:1}],
  markets:[{id:'market-local',provinceIds:['province:00001'],accountingUnitId:'synthetic-unit',goods:[{goodId:'food',priceMinor:10}]}],
  households:[{id:'household-local',provinceId:'province:00001',cashMinor:1000}],
  enterprises:[{id:'farm-local',provinceId:'province:00001',ownerRef:{kind:'household',id:'household-local'},recipeId:'farm',capacityBatches:20,wagePerWorkerMinor:40,cashMinor:1000,inventories:[{goodId:'food',quantity:0,bookValueMinor:0}]}]
};
const scenario={...structuredClone(base.scenario),population,economy};
module.exports={hierarchy,population,economy,scenario};
