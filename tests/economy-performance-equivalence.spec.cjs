// Prepared only. Do not run during implementation of the performance patch.
const {test,expect}=require('@playwright/test'),path=require('node:path'),{Worker}=require('node:worker_threads');
const {create,month,days,edit}=require('./fixtures/agricultural-markets.cjs'),routes=require('../shared/economy-routes.cjs'),agriculture=require('../shared/agricultural-resources.cjs'),partitions=require('../shared/economy-partitions.cjs'),{EconomyPool}=require('../shared/economy-pool.cjs');
const reference=require('./fixtures/economy-opportunities-reference.cjs'),{baseline}=require('./fixtures/economy-baseline-loader.cjs');
function opening(){
  const data=create({stockGood:'grain',formal:[{recipeId:'mill-flour'},{recipeId:'prepare-food'},{recipeId:'forge-tools'},{recipeId:'grow-grain',provinceId:'province:00002'},{recipeId:'mill-flour',provinceId:'province:00002',stocks:{flour:100}},{recipeId:'forge-tools',provinceId:'province:00001',stocks:{tools:100}}]}),e=data.s.snapshot().systems.economy;
  for(const h of e.households)for(const s of h.consumerState)if(e.rules.consumerNeeds.find(n=>n.id===s.needId).goodId==='food')s.stats.need=20;
  for(const c of e.autonomy.firms){c.plannedBatches=4;c.pendingCapacity=2;}
  return e;
}
const quote=(e,market,good,price)=>e.markets.find(m=>m.id===market).goods.find(g=>g.goodId===good).priceMinor=price;
function equivalent(e){const before=JSON.stringify(e),expected=reference.opportunities(e),actual=routes.opportunities(e);expect(actual).toEqual(expected);expect(JSON.stringify(e)).toBe(before);return actual;}
for(const [name,mutate]of [
  ['one supplier',e=>{e.enterprises=e.enterprises.filter(f=>f.provinceId==='province:00003');e.householdEconomy.rows.find(r=>r.householdId==='household-local').inventories.find(s=>s.goodId==='tools').quantity=100;}],
  ['different supplier prices',e=>quote(e,'market-neighbor','flour',1)],
  ['many enterprises share a destination',()=>{}],
  ['different accounting units',e=>{e.markets.find(m=>m.id==='market-local').accountingUnitId='other-unit';}],
  ['unreachable supplier',e=>{e.trade.edges=e.trade.edges.filter(v=>v.a!=='market-local'&&v.b!=='market-local');}],
  ['maxRouteEdges excludes a distant supplier',e=>{e.trade.routing.maxRouteEdges=1;}],
  ['household food demand and owned reserve',e=>{const row=e.householdEconomy.rows.find(r=>r.householdId==='household-local');row.sectors.ruralPopulation=1000;row.inventories.find(s=>s.goodId==='food').quantity=10;}],
  ['incoming grain flour and equipment',e=>{e.trade.routing.cargo=['grain','flour','tools'].map((goodId,i)=>({ownerId:e.enterprises[i].id,goodId,quantity:3}));}],
  ['no capacity and no physical offer',e=>{for(const f of e.enterprises)if(f.provinceId!=='province:00003'){f.capacityBatches=0;for(const s of f.inventories)s.quantity=0;}for(const row of e.householdEconomy.rows){for(const stage of row.stages)stage.capacityBatches=0;for(const s of row.inventories)s.quantity=0;}}],
  ['capacity alone remains a forecast, not a delivery',e=>{for(const f of e.enterprises)for(const s of f.inventories)s.quantity=0;for(const row of e.householdEconomy.rows)for(const s of row.inventories)s.quantity=0;}],
  ['no affordable demand',e=>{for(const a of [...e.households,...e.enterprises])a.cashMinor=0;}],
])test('forecast equals frozen algorithm: '+name,()=>{const e=opening();mutate(e);equivalent(e);});
test('equal delivered grain costs retain the first sorted supplier',()=>{
  const e=opening();for(const h of e.households)h.cashMinor=0;for(const c of e.autonomy.firms){c.status='dormant';c.pendingCapacity=0;}
  const mill=e.enterprises.find(f=>f.id==='synthetic-firm-0'),controller=e.autonomy.firms.find(c=>c.enterpriseId===mill.id);controller.status='active';controller.plannedBatches=1;
  // Eight grain: 8*3+16 (two edges) equals 8*4+8 (one edge).
  quote(e,'market-local','grain',3);quote(e,'market-neighbor','grain',4);
  expect(equivalent(e)).toEqual([{marketId:'market-local',goodId:'grain',quantity:8}]);
});
test('additional funded actors at the same market reuse the existing BFS',()=>{
  const e=opening();let reads=0;for(const market of e.markets){const unit=market.accountingUnitId;Object.defineProperty(market,'accountingUnitId',{enumerable:true,get(){reads++;return unit;}});}
  routes.opportunities(e);const firstReads=reads;expect(firstReads).toBeGreaterThan(0);
  for(let i=0;i<4;i++){const f=structuredClone(e.enterprises[0]),c=structuredClone(e.autonomy.firms.find(c=>c.enterpriseId===f.id));f.id='additional-mill-'+i;c.enterpriseId=f.id;e.enterprises.push(f);e.autonomy.firms.push(c);}
  reads=0;routes.opportunities(e);expect(reads).toBe(firstReads);equivalent(e);
});
test('prices and newly added producers invalidate all previous forecast work',()=>{
  const e=opening();equivalent(e);quote(e,'market-neighbor','flour',200);equivalent(e);
  const f=structuredClone(e.enterprises[0]),c=structuredClone(e.autonomy.firms.find(c=>c.enterpriseId===f.id));f.id='new-mill';f.provinceId='province:00001';c.enterpriseId=f.id;e.enterprises.push(f);e.autonomy.firms.push(c);equivalent(e);
  for(const row of e.householdEconomy.rows){row.stages=[];for(const s of row.inventories)s.quantity=0;}e.enterprises=e.enterprises.filter(v=>v.provinceId==='province:00003');equivalent(e);
});
test('indexed land and household helpers read changes through live rows',()=>{
  const e=opening(),index=agriculture.context(e),h=e.households[0],row=e.householdEconomy.rows.find(r=>r.householdId===h.id);
  for(const need of [10,30]){row.sectors.ruralPopulation=need;row.sectors.urbanPopulation=100;expect(agriculture.ruralNeed(e,h,20,index)).toBe(agriculture.ruralNeed(e,h,20));expect(agriculture.reserves(e,row,index)).toEqual(agriculture.reserves(e,row));}
  const plain=structuredClone(e);for(const household of [false,true,false])expect(agriculture.limit(e,h.provinceId,'grow-grain',10,household,index)).toBe(agriculture.limit(plain,h.provinceId,'grow-grain',10,household));expect(e.agriculture).toEqual(plain.agriculture);
});
test('incoming index uses live quantities and preserves overflow rejection',()=>{
  const e=opening();e.trade.routing.cargo=[{ownerId:'a',goodId:'grain',quantity:2},{ownerId:'a',goodId:'grain',quantity:3},{ownerId:'b',goodId:'grain',quantity:9}];const index=routes.incomingContext(e);
  expect(routes.incoming(e,'a','grain',index)).toBe(5);e.trade.routing.cargo[0].quantity=7;expect(routes.incoming(e,'a','grain',index)).toBe(routes.incoming(e,'a','grain'));
  e.trade.routing.cargo[0].quantity=Number.MAX_SAFE_INTEGER;expect(()=>routes.incoming(e,'a','grain',index)).toThrow(/overflow/);expect(()=>routes.incoming(e,'a','grain')).toThrow(/overflow/);
});
test('shared forecast does not alter any partition payload',()=>{const e=opening(),hints=routes.opportunities(e);for(const ids of partitions.partitionMarkets(e,3))expect(partitions.project(e,ids,hints)).toEqual(partitions.project(e,ids));});
test('one full opening forecast serves core and autonomous planning',()=>{
  const data=create(),original=routes.opportunities;let full=0;routes.opportunities=e=>{if(!e.trade?.routing?.planning)full++;return original(e);};
  try{month(data.s);expect(full).toBe(1);expect(data.s.serialize()).not.toContain('"planning"');}finally{routes.opportunities=original;}
});
test('fixed six-month campaign and save continuation match the entire pre-fix engine',()=>{
  const data=create({mixed:true,formal:[{recipeId:'mill-flour'},{recipeId:'prepare-food'},{recipeId:'forge-tools',stocks:{iron:20}},{recipeId:'forge-tools',provinceId:'province:00001',stocks:{tools:100}}]}),load=baseline(),{Simulation}=load('simulation.cjs');
  edit(data.s,e=>{for(const c of e.autonomy.firms)c.pendingCapacity=1;});
  const old=new Simulation(data.scenario,data.hierarchy,{seed:1700,landAdjacency:data.adjacency});old.load(data.s.snapshot());
  for(let i=0;i<6;i++){if(i===2){edit(data.s,e=>{quote(e,'market-local','grain',4);});old.load(data.s.snapshot());}month(data.s);old.step(days(old));expect(data.s.serialize()).toBe(old.serialize());expect(data.s.economicReport()).toEqual(old.economicReport());if(i===3){data.s.load(JSON.parse(data.s.serialize()));old.load(JSON.parse(old.serialize()));}}
});
test('pre-agriculture save migration and continuation match baseline',()=>{
  const data=create(),state=data.s.snapshot();delete state.systems.economy.agriculture;for(const row of state.systems.economy.householdEconomy.rows)delete row.sectors;
  const {Simulation}=baseline()('simulation.cjs'),old=new Simulation(data.scenario,data.hierarchy,{seed:1700,landAdjacency:data.adjacency});data.s.load(state);old.load(structuredClone(state));expect(data.s.serialize()).toBe(old.serialize());month(data.s);old.step(days(old));expect(data.s.serialize()).toBe(old.serialize());
});
for(const size of [1,2,3])test('pooled full state matches baseline sequence, pool size '+size,async()=>{
  const data=create({stockGood:'grain',formal:[{recipeId:'mill-flour'},{recipeId:'prepare-food'}]}),load=baseline(),{Simulation}=load('simulation.cjs'),old=new Simulation(data.scenario,data.hierarchy,{seed:1700,landAdjacency:data.adjacency});old.load(data.s.snapshot());
  const pool=new EconomyPool({size,createWorker:()=>new Worker(path.resolve(__dirname,'../scripts/economy-worker.cjs'))}),original=routes.opportunities;let full=0;routes.opportunities=e=>{if(!e.trade?.routing?.planning)full++;return original(e);};
  try{for(let i=0;i<3;i++){full=0;await data.s.stepAsync(days(data.s),pool);old.step(days(old));expect(data.s.serialize()).toBe(old.serialize());expect(full).toBe(1);expect(data.s.serialize()).not.toContain('"planning"');if(i===1){data.s.load(JSON.parse(data.s.serialize()));old.load(JSON.parse(old.serialize()));}}}finally{routes.opportunities=original;pool.dispose();}
});
