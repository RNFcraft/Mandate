// Prepared for user execution only. No tests or simulations were run during implementation.
const {test,expect}=require('@playwright/test');
const {Simulation,ordinal,validateGameState}=require('../shared/simulation.cjs');
const physical=require('../shared/physical-transport.cjs'),accounts=require('../shared/household-accounts.cjs');
const fixture=require('./fixtures/economy-v33.cjs');
function create(options={}){const data=fixture.createScenario(options),s=new Simulation(data.scenario,data.hierarchy,{seed:1700,landAdjacency:data.adjacency});s.enableAutonomy({birthRateBps:0,deathRateBps:0,urbanizationBps:0,profitPayoutBps:0});return {...data,s};}
function month(s){const d=s.clock.date;s.step(ordinal({year:d.year+(d.month===12?1:0),month:d.month===12?1:d.month+1,day:1})-ordinal(d));return s.economySummary();}
const cash=e=>[...e.households,...e.enterprises,...physical.actors(e)].reduce((n,a)=>n+BigInt(a.cashMinor),0n)+e.trade.routing.cargo.reduce((n,c)=>n+BigInt(c.escrowMinor),0n);
function unit(){const d=create();d.s.enablePhysicalTransport();const e=d.s.economySummary();e.stats.lastCompletedPeriod={year:1700,month:1};const edge=e.trade.edges[0],path=[edge.a,edge.b],from=e.markets.find(m=>m.id===edge.a),to=e.markets.find(m=>m.id===edge.b),seller=e.households.find(h=>from.provinceIds.includes(h.provinceId)),buyer=e.households.find(h=>to.provinceIds.includes(h.provinceId));const cargo={id:1,ownerId:buyer.id,sellerId:seller.id,goodId:'clothing',quantity:55,bookValueMinor:997,path,index:0,escrowMinor:41,haul:[1,0,0]};e.trade.routing.nextId=2;const labor=new Map(e.households.map(h=>[h.provinceId,{remaining:100,ruralRemaining:50,urbanRemaining:50}])),edges=new Map(e.trade.edges.map(v=>[[v.a,v.b].sort().join('|'),v])),used=new Map();return {e,cargo,labor,edges,used,edge,from,to};}

test('explicit migration preserves all paid cargo rights, quantities, values, escrow and total cash; recognition is idempotent',()=>{
  const d=create();month(d.s);const before=d.s.economySummary(),money=cash(before);expect(before.trade.routing.cargo.length).toBeGreaterThan(0);
  d.s.enablePhysicalTransport();const e=d.s.economySummary();expect(cash(e)).toBe(money);expect(e.trade.rules).toEqual(before.trade.rules);
  expect(e.trade.routing.cargo.map(({haul,...c})=>c)).toEqual(before.trade.routing.cargo);
  expect(e.transport.capital.recognizedUnits).toBe(e.markets.length*Math.floor(e.trade.rules.capacityPerEdge/e.trade.rules.unitsPerWorker));
  expect(e.transport.capital.installedUnits).toBe(0);expect(e.stats.goods.find(g=>g.goodId==='wagon').produced).toBe(0);
  const serialized=d.s.serialize();d.s.enablePhysicalTransport();expect(d.s.serialize()).toBe(serialized);validateGameState(d.s.snapshot(),d.hierarchy);
});
test('split rounding conserves exact quantity, book value and escrow and retains ownership',()=>{
  const {e,cargo,labor,edges,used}=unit(),ctx=physical.context(e,labor,edges,used),before={...cargo};const part=ctx.split(cargo,21);
  expect(part.quantity+cargo.quantity).toBe(before.quantity);expect(part.bookValueMinor+cargo.bookValueMinor).toBe(before.bookValueMinor);expect(part.escrowMinor+cargo.escrowMinor).toBe(before.escrowMinor);
  expect(part.bookValueMinor).toBe(Number(997n*21n/55n));expect(part.escrowMinor).toBe(Number(41n*21n/55n));expect(part.ownerId).toBe(before.ownerId);expect(part.sellerId).toBe(before.sellerId);expect(part.haul).toEqual(before.haul);expect(part.id).not.toBe(cargo.id);
});
test('physical allocation combines road, real fleet and labor; arrivals cannot serve a second cargo',()=>{
  const {e,cargo,labor,edges,used,edge}=unit(),g=e.transport.groups.find(g=>g.marketId===edge.a);g.quantity=1;g.bookValueMinor=160;used.set([edge.a,edge.b].sort().join('|'),e.trade.rules.capacityPerEdge-17);
  const ctx=physical.context(e,labor,edges,used),plan=ctx.limits(cargo.path,0,cargo.quantity,cargo);expect(plan.quantity).toBe(17);const part=ctx.split(cargo,17),walletBefore=cash(e)+BigInt(part.escrowMinor)+BigInt(cargo.escrowMinor);
  ctx.move(part,17,plan);expect(g.quantity).toBe(0);used.clear();expect(ctx.limits([edge.b,edge.a],0,1)).toBeTruthy();
  // Only the destination's opening fleet is eligible; moved vehicles are quarantined.
  const destination=e.transport.groups.filter(g=>g.marketId===edge.b&&g.readyPeriod===0);for(const other of destination)other.quantity=0;
  expect(ctx.limits([edge.b,edge.a],0,1)).toBeNull();expect(cash(e)+BigInt(part.escrowMinor)+BigInt(cargo.escrowMinor)).toBe(walletBefore);
  expect(e.transport.month.revenue).toBe(plan.payment);expect(e.transport.month.wages).toBe(8);expect(part.index).toBe(1);
});
test('no available vehicles or workers means no movement, including for paid legacy cargo',()=>{
  for(const reason of ['fleet','labor','road','finance']){const {e,cargo,labor,edges,used,edge}=unit();const g=e.transport.groups.find(g=>g.marketId===edge.a);
    if(reason==='fleet')g.quantity=0;if(reason==='labor')labor.get(edge.provinceA).remaining=0;if(reason==='road')used.set([edge.a,edge.b].sort().join('|'),e.trade.rules.capacityPerEdge);
    if(reason==='finance'){cargo.escrowMinor=0;e.transport.carriers.find(c=>c.id===g.ownerId).cashMinor=0;}
    const before={...cargo};expect(physical.context(e,labor,edges,used).limits(cargo.path,0,cargo.quantity,cargo)).toBeNull();expect(cargo).toEqual(before);
  }
});
test('compatible fragments coalesce without losing rights, values or escrow',()=>{
  const {e,cargo,labor,edges,used}=unit(),ctx=physical.context(e,labor,edges,used),part=ctx.split(cargo,21);e.trade.routing.cargo=[cargo,part];ctx.finish();expect(e.trade.routing.cargo.length).toBe(1);const merged=e.trade.routing.cargo[0];expect([merged.quantity,merged.bookValueMinor,merged.escrowMinor]).toEqual([55,997,41]);expect(merged.ownerId).toBe(cargo.ownerId);expect(e.transport.month.merged).toBe(1);
});
test('paid empty return moves one physical edge and consumes road, labor and carrier money',()=>{
  const {e,labor,edges,used,edge}=unit(),g=e.transport.groups.find(g=>g.marketId===edge.a),carrier=e.transport.carriers.find(c=>c.id===g.ownerId);g.marketId=edge.b;g.quantity=1;g.bookValueMinor=160;accounts.transfer(e.households.find(h=>h.provinceId===edge.provinceB),carrier,0);
  carrier.cashMinor=8;const oldCash=cash(e);physical.context(e,labor,edges,used).finish();const returned=e.transport.groups.find(x=>x.ownerId===carrier.id&&x.lastMove==='empty');expect(returned.marketId).toBe(edge.a);expect(returned.readyPeriod).toBe(1700*12+2);expect(carrier.cashMinor).toBe(0);expect(carrier.stats.profit).toBe(-8);expect(used.get([edge.a,edge.b].sort().join('|'))).toBe(20);expect(cash(e)).toBe(oldCash);
});
test('enterprise-owned carrier funding is transferred rather than minted and uses a separate wallet',()=>{
  const d=create();d.s.enablePhysicalTransport();const e=d.s.economySummary(),owner=e.enterprises[0],m=e.markets.find(m=>m.provinceIds.includes(owner.provinceId)),before=cash(e),funding=Math.min(100,owner.cashMinor),old=owner.cashMinor,c=physical.register(e,{kind:'enterprise',id:owner.id},m.id,funding);
  expect(owner.cashMinor).toBe(old-funding);expect(c.cashMinor).toBe(funding);expect(cash(e)).toBe(before);expect(c.inventories[0].quantity).toBe(0);physical.validate(e);
});
test('wagon factory consumes actual inputs and labor, buyer pays and installs only next month',()=>{
  const d=create({local:true});d.s.enablePhysicalTransport();const state=d.s.snapshot(),e=state.systems.economy,f=e.enterprises[0],c=e.transport.carriers.find(c=>c.provinceId===f.provinceId);f.recipeId='build-wagon';f.capacityBatches=1;f.wagePerWorkerMinor=8;Object.assign(e.autonomy.firms.find(v=>v.enterpriseId===f.id),{baseCapacity:1,plannedBatches:1,status:'active'});
  const recipe=e.recipes.find(r=>r.id==='build-wagon');for(const s of f.inventories){s.quantity=recipe.inputs.find(i=>i.goodId===s.goodId)?.quantity||0;s.bookValueMinor=s.quantity*e.markets.find(m=>m.provinceIds.includes(f.provinceId)).goods.find(g=>g.goodId===s.goodId).priceMinor;}
  c.desiredUnits=1;const h=e.households.find(h=>h.provinceId===f.provinceId);accounts.transfer(h,c,1000,'urban');d.s.load(state);const before=cash(e),a=month(d.s);
  expect(a.stats.goods.find(g=>g.goodId==='wagon').produced).toBe(1);expect(a.enterprises.find(v=>v.id===f.id).stats.workers).toBe(2);for(const i of recipe.inputs)expect(a.stats.goods.find(g=>g.goodId===i.goodId).inputsConsumed).toBeGreaterThanOrEqual(i.quantity);
  expect(a.transport.capital.installedUnits).toBe(0);expect(a.transport.carriers.find(v=>v.id===c.id).inventories[0].quantity).toBe(1);expect(cash(a)).toBe(before);const b=month(d.s);expect(b.transport.capital.installedUnits).toBe(1);expect(b.stats.goods.find(g=>g.goodId==='wagon').transportAdded).toBe(1);expect(cash(b)).toBe(before);
});
test('physical campaign save continuation and profiling preserve complete deterministic state',()=>{
  const a=create(),b=create();a.s.enablePhysicalTransport();b.s.enablePhysicalTransport();month(a.s);month(b.s);b.s.load(JSON.parse(a.s.serialize()));
  const diagnostics=require('../shared/economy-diagnostics.cjs');let clock=0;const trace=diagnostics.start({now:()=>++clock});try{trace.beginMonth(b.s.clock.date);month(b.s);trace.endMonth();}finally{trace.stop();}month(a.s);expect(b.s.serialize()).toBe(a.s.serialize());expect(b.s.economicReport()).toEqual(a.s.economicReport());validateGameState(b.s.snapshot(),b.hierarchy);
});
test('invalid physical capital and cargo lineage fail load atomically',()=>{
  const d=create();month(d.s);d.s.enablePhysicalTransport();const before=d.s.serialize();for(const corrupt of [e=>e.transport.groups[0].quantity++,e=>e.transport.carriers[0].cashMinor++,e=>e.trade.routing.cargo[0].haul[0]=e.trade.routing.nextId]){const state=d.s.snapshot();corrupt(state.systems.economy);expect(()=>d.s.load(state)).toThrow();expect(d.s.serialize()).toBe(before);}
});
test('oversized paid cargo drains in parts over several months without reselling or multiplying stored fragments',()=>{
  const d=create();month(d.s);d.s.enablePhysicalTransport();const state=d.s.snapshot(),e=state.systems.economy,original={...e.trade.routing.cargo[0]},market=original.path[original.index],carrier=e.transport.carriers.find(c=>c.baseMarketId===market);
  e.trade.rules.capacityPerEdge=3;accounts.transfer(e.enterprises[0],carrier,1000);d.s.load(state);const money=cash(e);let delivered=0;
  for(let i=0;i<4;i++){const next=month(d.s);delivered+=next.trade.routing.month.byDeliveredGood.clothing||0;expect(cash(next)).toBe(money);const fragments=next.trade.routing.cargo.filter(c=>c.haul[0]===original.id);expect(fragments.length).toBeLessThanOrEqual(original.path.length-2);expect(fragments.reduce((n,c)=>n+c.quantity,0)+delivered).toBe(original.quantity);expect(next.trade.routing.month.started).toBe(0);validateGameState(d.s.snapshot(),d.hierarchy);}
  expect(delivered).toBe(original.quantity);expect(d.s.economySummary().trade.routing.cargo.some(c=>c.haul[0]===original.id)).toBe(false);
});
test('worker adapter preserves physical state through explicit sequential fallback',async()=>{
  const d=create();d.s.enablePhysicalTransport();const state=d.s.snapshot(),{EconomyPool}=require('../shared/economy-pool.cjs'),pool=new EconomyPool({size:2,createWorker:()=>{throw Error('Physical state must not be partitioned');}}),period={year:1700,month:1};
  try{const a=await pool.prepare(state.systems.economy,state.systems.population,d.hierarchy,period),b=require('../shared/economy.cjs').prepareEconomyMonth(state.systems.economy,state.systems.population,d.hierarchy,period);expect(a).toEqual(b);expect(pool.metrics.physicalTransportSequentialMonths).toBe(1);}finally{pool.dispose();}
});
