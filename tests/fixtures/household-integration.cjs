const base=require('./economy-integration.cjs'),{generateSettlements}=require('../../shared/settlements.cjs');
function createScenario({trade=false,buyer=true}={}){
  const scenario=base.createScenario(),hierarchy=structuredClone(base.hierarchy),adjacency=structuredClone(base.adjacency);
  scenario.scenario.id='synthetic-household-integration';scenario.economy.rules.maxPriceAdjustmentBps=0;
  for(const c of scenario.population.cohorts)c.settlement=trade?'urban':c.territoryId==='province:00001'?'rural':'urban';
  scenario.economy.enterprises=trade?scenario.economy.enterprises.filter(f=>f.recipeId==='prepare-food'):[];
  for(const f of scenario.economy.enterprises)f.capacityBatches=0;
  if(trade){
    const province={...hierarchy.territories[1],id:'province:00003'};hierarchy.territories.push(province);scenario.ownership[province.id]=scenario.ownership['province:00001'];scenario.population.cohorts.push({...scenario.population.cohorts[1],id:'far-population',territoryId:province.id});
    const m=structuredClone(scenario.economy.markets[1]);m.id='market-far';m.provinceIds=[province.id];scenario.economy.markets.push(m);scenario.economy.households[1].cashMinor=0;scenario.economy.households.push({id:'household-far',provinceId:province.id,cashMinor:10000});
    for(const g of scenario.economy.markets[1].goods)if(g.goodId==='food')g.priceMinor=3;
    adjacency.neighbors['province:00002'].push(province.id);adjacency.neighbors[province.id]=['province:00002'];
  }else{
    scenario.economy.markets[0].provinceIds.push('province:00002');scenario.economy.markets.pop();if(!buyer)scenario.economy.households[1].cashMinor=0;
  }
  scenario.settlements=generateSettlements(scenario.population,hierarchy,scenario.countries,1700);for(const f of scenario.economy.enterprises)scenario.settlements.placements.push({enterpriseId:f.id,settlementId:scenario.settlements.rows.find(r=>r.provinceId===f.provinceId).id,kind:'settlement'});
  return {scenario,hierarchy,adjacency};
}
module.exports={createScenario};
