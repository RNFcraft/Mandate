// Two synthetic neighboring markets; published scenarios are never modified.
const chains=require('./production-chains.cjs'),{generateSettlements}=require('../../shared/settlements.cjs');
const hierarchy={...structuredClone(chains.hierarchy),territories:[{...chains.hierarchy.territories[0]},{...chains.hierarchy.territories[0],id:'province:00002'}]};
const adjacency={schema:'mandate-province-adjacency-v1',geographyId:hierarchy.id,landOnly:true,neighbors:{'province:00001':['province:00002'],'province:00002':['province:00001']}};
function createScenario(){
  const s=chains.createScenario();s.population.cohorts.push({...s.population.cohorts[0],id:'neighbor-population',territoryId:'province:00002'});s.ownership['province:00002']=s.ownership['province:00001'];s.economy.rules.consumerNeeds=[{id:'food',goodId:'food',priority:'essential',perPersonNumerator:1,perPersonDenominator:100,usage:'consumable'}];
  s.economy.markets.push({...structuredClone(s.economy.markets[0]),id:'market-neighbor',provinceIds:['province:00002']});s.economy.households.push({id:'household-neighbor',provinceId:'province:00002',cashMinor:10000});s.economy.households[0].cashMinor=0;
  for(const g of s.economy.markets[0].goods)if(g.goodId==='food')g.priceMinor=3;for(const g of s.economy.markets[1].goods)if(g.goodId==='food')g.priceMinor=20;
  s.economy.enterprises.find(f=>f.recipeId==='prepare-food').inventories.find(v=>v.goodId==='food').quantity=100;
  s.settlements=generateSettlements(s.population,hierarchy,s.countries,1700);for(const f of s.economy.enterprises)s.settlements.placements.push({enterpriseId:f.id,settlementId:s.settlements.rows.find(r=>r.provinceId===f.provinceId).id,kind:'settlement'});return s;
}
module.exports={hierarchy,adjacency,createScenario};
