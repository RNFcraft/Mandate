// Written before Stage B integration. User execution only; no tests run by Codex.
const {test,expect}=require('@playwright/test'),fixture=require('./fixtures/economy-v33.cjs');
const {baseline}=require('./fixtures/economy-baseline-loader.cjs');
const revision='ad7658f2ea35865b288ba991681bd69d27f0a18c';
function engines(options={}){const old=baseline(revision),current=require('../shared/simulation.cjs'),source=fixture.createScenario(options);return {old,current,source,a:new (old('simulation.cjs').Simulation)(source.scenario,source.hierarchy,{seed:1700,landAdjacency:source.adjacency}),b:new current.Simulation(source.scenario,source.hierarchy,{seed:1700,landAdjacency:source.adjacency})};}
function enable(s){s.enableAutonomy({birthRateBps:0,deathRateBps:0,urbanizationBps:0,profitPayoutBps:0});}
function month(s,kernel){const d=s.clock.date,next={year:d.year+(d.month===12?1:0),month:d.month===12?1:d.month+1,day:1};s.step(kernel.ordinal(next)-kernel.ordinal(d));}
for(const options of [{local:true},{distance:1},{distance:2},{mixed:true}])test('Stage A full state and transaction order match frozen v3.3 '+JSON.stringify(options),()=>{
  const {old,current,a,b}=engines(options),oldKernel=old('simulation.cjs');enable(a);enable(b);
  for(let i=0;i<4;i++){month(a,oldKernel);month(b,current);expect(b.serialize()).toBe(a.serialize());expect(b.economicReport()).toEqual(a.economicReport());expect(b.economySummary().trade.flows).toEqual(a.economySummary().trade.flows);}
  const continued=engines(options).b;continued.load(b.snapshot());month(a,oldKernel);month(continued,current);expect(continued.serialize()).toBe(a.serialize());
});
test('Stage A corrupted cargo fails in both engines without partial load',()=>{
  const {old,current,a,b}=engines();enable(a);enable(b);month(a,old('simulation.cjs'));month(b,current);
  for(const edit of [v=>v.systems.economy.trade.routing.cargo[0].escrowMinor++,v=>v.systems.economy.trade.routing.cargo[0].sellerId='missing-seller',v=>v.systems.economy.households[0].cashMinor++]){
    for(const s of [a,b]){const before=s.serialize(),v=s.snapshot();edit(v);expect(()=>s.load(v)).toThrow();expect(s.serialize()).toBe(before);}
  }
});
test('Stage A profiling is observational and preserves the frozen RNG and balances',()=>{
  const {old,current,a,b}=engines();enable(a);enable(b);month(a,old('simulation.cjs'));
  const diagnostics=require('../shared/economy-diagnostics.cjs');let tick=0;const trace=diagnostics.start({now:()=>++tick}),restore=require('../scripts/economy-profile.cjs').instrument();
  try{trace.beginMonth(b.clock.date);month(b,current);trace.endMonth();}finally{restore();trace.stop();}
  expect(b.serialize()).toBe(a.serialize());expect(b.economySummary().stats).toEqual(a.economySummary().stats);
});
test('Stage A parent trees preserve sorted shortest-path ties, depth limits and accounting-unit isolation',()=>{
  const topology=require('../shared/economy-topology.cjs'),e={markets:['a','b','c','d','e'].map(id=>({id,accountingUnitId:id==='e'?'other':'unit'})),trade:{edges:[['a','c'],['c','d'],['a','b'],['b','d'],['d','e']].map(([a,b])=>({a,b}))}};
  const graph=topology.topology(e);expect(topology.path(graph.tree('a',3),'a','d')).toEqual(['a','b','d']);expect(topology.path(graph.tree('a',1),'a','d')).toBeNull();expect(topology.path(graph.tree('a',4),'a','e')).toBeNull();expect(topology.topology(structuredClone(e))).toBe(graph);
});
