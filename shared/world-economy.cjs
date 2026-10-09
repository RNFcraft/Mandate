// One-shot synthetic world authoring over frozen provinces and existing cohorts.
const settlements=require('./settlements.cjs');
const {validatePopulationScenario}=require('./population.cjs');
const {validateEconomyScenario,canonicalize}=require('./economy.cjs');
const registry=require('./production-registry.cjs'),rules=require('./world-economy-rules.cjs');
const {compare,number,hash}=settlements;
const fail=message=>{throw Error('World economy: '+message);};
function validateAdjacency(adjacency,hierarchy){
  if(!adjacency||adjacency.schema!=='mandate-province-adjacency-v1'||adjacency.geographyId!==hierarchy.id||adjacency.landOnly!==true||!adjacency.neighbors||Object.getPrototypeOf(adjacency.neighbors)!==Object.prototype)fail('land adjacency required');
  const ids=new Set(hierarchy.territories.map(t=>t.id));if(ids.size!==hierarchy.territories.length||Object.keys(adjacency.neighbors).length!==ids.size)fail('invalid adjacency coverage');
  const sets=new Map();
  for(const id of ids){const neighbors=adjacency.neighbors[id];if(!Array.isArray(neighbors)||new Set(neighbors).size!==neighbors.length||neighbors.some(n=>!ids.has(n)||n===id))fail('invalid adjacency neighbor');sets.set(id,new Set(neighbors));}
  for(const [id,neighbors]of sets)for(const n of neighbors)if(!sets.get(n).has(id))fail('asymmetric adjacency');return sets;
}
function generateMarkets(settlementState,population,hierarchy,adjacency,ownership){
  const land=validateAdjacency(adjacency,hierarchy),mass=settlements.totals(population,hierarchy),at=new Map();
  for(const r of settlementState.rows){if(!at.has(r.provinceId))at.set(r.provinceId,[]);at.get(r.provinceId).push(r);}
  const eligible=[...mass.keys()].filter(id=>mass.get(id).urban+mass.get(id).rural>0),unassigned=new Set(eligible);
  const hubs=eligible.sort((a,b)=>{
    const score=id=>{const rows=at.get(id)||[];return [rows.some(r=>r.capitalOf.length)?1:0,Math.max(0,...rows.filter(r=>r.classification==='urban').map(r=>r.population)),mass.get(id).urban+mass.get(id).rural];};
    const x=score(a),y=score(b);return y[0]-x[0]||y[1]-x[1]||y[2]-x[2]||compare(a,b);
  });
  const markets=[];
  for(const hub of hubs){
    if(!unassigned.has(hub))continue;
    const provinceIds=[hub],frontier=[hub];unassigned.delete(hub);let population=mass.get(hub).urban+mass.get(hub).rural;
    for(let index=0;index<frontier.length&&provinceIds.length<rules.maxMarketProvinces;index++){
      // Prefer rural neighbors around urban hubs and urban neighbors around rural hubs.
      const neighbors=[...land.get(frontier[index])].sort((a,b)=>{
        const score=id=>mass.get(hub).urban>mass.get(hub).rural?mass.get(id).rural:mass.get(id).urban;
        return score(b)-score(a)||compare(a,b);
      });
      for(const neighbor of neighbors){
        if(provinceIds.length>=rules.maxMarketProvinces)break;
        const n=mass.get(neighbor).urban+mass.get(neighbor).rural;
        if(!unassigned.has(neighbor)||(ownership[neighbor]??null)!==(ownership[hub]??null)||population+n>rules.maxMarketPopulation)continue;
        provinceIds.push(neighbor);frontier.push(neighbor);unassigned.delete(neighbor);population+=n;
      }
    }
    markets.push({id:'market-'+hub.slice(9),provinceIds:provinceIds.sort(compare),accountingUnitId:'synthetic-world-unit',goods:registry.goods.map(g=>({goodId:g.id,priceMinor:rules.prices[g.id]}))});
  }
  return markets.sort((a,b)=>compare(a.id,b.id));
}
function generateWorld(scenario,hierarchy,adjacency,seed=1700){
  validatePopulationScenario(scenario.population,hierarchy);
  if(hierarchy.id!=='mandate-provinces-v1'||scenario.scenario.version!==4||scenario.scenario.geography!==hierarchy.id)fail('incompatible source scenario');
  if(scenario.economy||scenario.settlements)fail('source already has economy/settlements');
  const settlementState=settlements.generateSettlements(scenario.population,hierarchy,scenario.countries,seed);
  const markets=generateMarkets(settlementState,scenario.population,hierarchy,adjacency,scenario.ownership),mass=settlements.totals(scenario.population,hierarchy);
  const atProvince=new Map();for(const row of settlementState.rows){if(!atProvince.has(row.provinceId))atProvince.set(row.provinceId,[]);atProvince.get(row.provinceId).push(row);}
  const households=[],enterprises=[],recipes=new Map(registry.recipes.map(r=>[r.id,r]));
  const available=new Map(settlementState.rows.map(r=>[r.id,Math.floor(r.population/2)]));
  for(const market of markets){
    const rows=market.provinceIds.flatMap(id=>atProvince.get(id)||[]),people=number(market.provinceIds.reduce((n,id)=>n+BigInt(mass.get(id).urban)+BigInt(mass.get(id).rural),0n));
    for(const provinceId of market.provinceIds){
      const p=mass.get(provinceId),people=number(BigInt(p.urban)+BigInt(p.rural));
      // 120 months of food and a complete clothing target; no later injections.
      const food=(BigInt(people)+99n)/100n,clothing=BigInt(people)/100n;
      households.push({id:'household-'+provinceId.slice(9),provinceId,cashMinor:number(food*BigInt(rules.prices.food)*BigInt(rules.workingCapitalMonths)+clothing*BigInt(rules.prices.clothing))});
    }
    const facts={urban:rows.reduce((n,r)=>n+(r.classification==='urban'?r.population:0),0),population:people},specializations=new Set(rows.flatMap(r=>r.specializations));
    const eligible=rules.sectors.filter(s=>{const thresholds=Object.entries(s.minimumAny),roll=hash(seed,market.id+':'+s.id)%s.chance.modulo;return (!thresholds.length||thresholds.some(([key,value])=>facts[key]>=value))&&s.requires.every(role=>specializations.has(role))&&roll>=s.chance.min&&roll<=s.chance.max;});
    const eligibleIds=new Set(eligible.map(s=>s.id)),selected=eligible.filter(s=>!s.excludes.some(id=>eligibleIds.has(id)));
    for(const sector of selected){
      const batches=number((BigInt(people)+BigInt(sector.perPeople)-1n)/BigInt(sector.perPeople));
      for(const recipeId of sector.recipeIds){
        const recipe=recipes.get(recipeId),profile=rules.placement[recipeId];if(!recipe||!profile)fail('unknown production profile');
        const candidates=[...rows].sort((a,b)=>{
          const preferred=r=>(r.specializations.includes(profile.specialization)?2:0)+(r.classification===profile.classification?1:0);
          return preferred(b)-preferred(a)||available.get(b.id)-available.get(a.id)||compare(a.id,b.id);
        });
        let remaining=batches;
        const count=Math.min(4,Math.max(1,Math.ceil(batches/3000))),chunk=Math.ceil(batches/count);
        for(let i=0;i<count&&remaining;i++){
          const desired=Math.min(remaining,chunk)*recipe.workersPerBatch;
          // Do not strand a large province's food capacity in a tiny urban labor pool.
          const row=candidates.find(r=>available.get(r.id)>=desired)||[...candidates].sort((a,b)=>available.get(b.id)-available.get(a.id)||compare(a.id,b.id))[0];
          const capacityBatches=Math.min(remaining,chunk,Math.floor(available.get(row.id)/recipe.workersPerBatch));
          // Tiny isolated settlements may have no integer labor; keep the unmet need explicit.
          if(!capacityBatches)break;
          available.set(row.id,available.get(row.id)-capacityBatches*recipe.workersPerBatch);remaining-=capacityBatches;
          if(!row.specializations.includes(profile.specialization))row.specializations.push(profile.specialization);
          const enterpriseId=`enterprise-${market.id.slice(7)}-${recipeId}-${i+1}`;
          let monthlyCost=BigInt(recipe.workersPerBatch)*BigInt(rules.wagePerWorkerMinor);
          for(const input of recipe.inputs)monthlyCost+=BigInt(input.quantity)*BigInt(rules.prices[input.goodId]);
          const inventories=registry.goods.map(g=>{
            const input=recipe.inputs.find(i=>i.goodId===g.id),quantity=input?number(BigInt(capacityBatches)*BigInt(input.quantity)*2n):g.id===recipe.output.goodId?number(BigInt(capacityBatches)*BigInt(recipe.output.quantity)):0;
            return {goodId:g.id,quantity,bookValueMinor:number(BigInt(quantity)*BigInt(rules.prices[g.id]))};
          });
          enterprises.push({id:enterpriseId,provinceId:row.provinceId,ownerRef:{kind:'household',id:'household-'+row.provinceId.slice(9)},recipeId,capacityBatches,wagePerWorkerMinor:rules.wagePerWorkerMinor,cashMinor:number(BigInt(capacityBatches)*monthlyCost*BigInt(rules.workingCapitalMonths)),inventories});
          settlementState.placements.push({enterpriseId,settlementId:row.id,kind:profile.external?'external':'settlement'});
        }
      }
    }
  }
  const economy=canonicalize({version:1,rules:{foodGoodId:'food',foodPerPersonNumerator:1,foodPerPersonDenominator:100,laborParticipationBps:5000,maxPriceAdjustmentBps:100,profitPayoutBps:0,consumerNeeds:structuredClone(rules.consumerNeeds)},goods:structuredClone(registry.goods),recipes:structuredClone(registry.recipes),markets,households,enterprises});
  settlements.canonicalizeSettlements(settlementState);
  validateEconomyScenario(economy,hierarchy);settlements.validateSettlements(settlementState,scenario.population,hierarchy,economy);
  return {settlements:settlementState,economy};
}
module.exports={generateWorld,generateMarkets,validateAdjacency};
