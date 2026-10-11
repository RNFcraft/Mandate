// Prepared for user execution. No tests or simulations run during this audit.
const {test,expect}=require('@playwright/test'),diagnostics=require('../shared/economy-diagnostics.cjs'),{options}=require('../scripts/autonomous-runner.cjs');
const {Simulation,ordinal}=require('../shared/simulation.cjs'),fixture=require('./fixtures/economy-v33.cjs');
function session(){let tick=0;return diagnostics.start({now:()=>++tick});}
function world(cargo=[],month=1){return {stats:{lastCompletedPeriod:{year:1700,month}},trade:{routing:{cargo}}};}
function cargo(){return {id:1,goodId:'clothing',quantity:10,escrowMinor:8,path:['a','b','c'],index:1};}
function create(){const d=fixture.createScenario(),s=new Simulation(d.scenario,d.hierarchy,{seed:1700,landAdjacency:d.adjacency});s.enableAutonomy({birthRateBps:0,deathRateBps:0,urbanizationBps:0,durableLifetimeMonths:1000,profitPayoutBps:0});return s;}
function month(s){const d=s.clock.date,next={year:d.year+(d.month===12?1:0),month:d.month===12?1:d.month+1,day:1};s.step(ordinal(next)-ordinal(d));}
test('diagnostics defaults off and CLI requires explicit sequential stats output',()=>{
  expect(diagnostics.current()).toBe(null);expect(options([]).profileEconomy).toBe(false);
  expect(options(['--profile-economy','--workers','0','--stats','p.json']).profileEconomy).toBe(true);
  for(const args of [['--profile-economy'],['--profile-economy','--workers','1','--stats','p.json'],['--profile-economy','--benchmark','--stats','p.json']])expect(()=>options(args)).toThrow();
});
test('known cargo age includes observed stalls and distinguishes elapsed boundaries',()=>{
  const t=session(),c=cargo();try{
    t.beginMonth({year:1700,month:1});t.openRoutes(world());t.created(c);t.closeRoutes(world([c]));expect(t.endMonth().logistics.age['1']).toEqual({shipments:1,quantity:10});
    t.beginMonth({year:1700,month:2});t.openRoutes(world([c],2));t.stalled(c,true,false);t.closeRoutes(world([c],2));const blocked=t.endMonth().logistics;expect(blocked.blocked.labor).toBe(1);expect(blocked.maxConsecutiveStalls).toBe(1);
    t.beginMonth({year:1700,month:3});t.openRoutes(world([c],3));t.moved(c);t.delivered(c);t.closeRoutes(world([],3));const last=t.endMonth().logistics;expect(last.delivery.meanServiceMonths).toBe(3);expect(last.delivery.meanElapsedMonths).toBe(2);expect(last.active).toBe(0);expect(last.unobservedRemovals).toBe(0);
  }finally{t.stop();}
});
test('loaded cargo true age is unknown and excluded from completion means',()=>{
  const t=session(),c=cargo();try{t.beginMonth({year:1700,month:1});t.openRoutes(world([c]));t.closeRoutes(world([c]));const r=t.endMonth().logistics;expect(r.unknownAge).toBe(1);expect(r.age['1'].shipments).toBe(0);expect(r.observedAgeLowerBound['1'].shipments).toBe(1);
    t.beginMonth({year:1700,month:2});t.openRoutes(world([c],2));t.delivered(c);t.closeRoutes(world([],2));const d=t.endMonth().logistics.delivery;expect(d.unknownCompleted).toBe(1);expect(d.meanServiceMonths).toBe(null);
  }finally{t.stop();}
});
test('one-edge delivery records both events and leaves no active metadata',()=>{
  const t=session(),c={...cargo(),path:['a','b']};try{t.beginMonth({year:1700,month:1});t.openRoutes(world());t.created(c);t.delivered(c);t.closeRoutes(world());const r=t.endMonth().logistics;expect(r.created).toBe(1);expect(r.delivered).toBe(1);expect(r.delivery.meanServiceMonths).toBe(1);expect(r.delivery.meanElapsedMonths).toBe(0);expect(r.active).toBe(0);expect(r.cancelled).toBe(0);}finally{t.stop();}
});
test('overlapping pending requests and food target changes only produce counters',()=>{
  const t=session();try{t.beginMonth({year:1700,month:1});t.openRoutes(world());t.request(2,10);t.request(0,10);t.retarget(0,5);t.closeRoutes(world());const r=t.endMonth().logistics;expect(r.repeatRequests).toEqual({requests:1,requestedQuantity:2,pendingQuantity:10});expect(r.foodRetargets.reopenedAfterFulfilled).toBe(1);}finally{t.stop();}
});
test('profiling preserves full state, RNG, reports and save/load continuation',()=>{
  const plain=create(),observed=create();for(let i=0;i<3;i++)month(plain);
  const t=session(),restore=require('../scripts/economy-profile.cjs').instrument();let result;
  try{for(let i=0;i<3;i++){t.beginMonth(observed.clock.date);month(observed);observed.economicReport();t.endMonth();}result=t.stop();}finally{restore();t.stop();}
  expect(observed.serialize()).toBe(plain.serialize());expect(observed.economicReport()).toEqual(plain.economicReport());expect(result.months[0].phases.tradeCandidateSearch.calls).toBeGreaterThan(0);expect(result.months[0].counters.tradeRouteRequests).toBeGreaterThan(0);
  const continued=create();continued.load(observed.snapshot());month(continued);month(plain);expect(continued.serialize()).toBe(plain.serialize());expect(observed.snapshot().systems.economy).not.toHaveProperty('diagnostics');
});
test('stopping profiling restores exports and releases its process-local session',()=>{
  const e=require('../shared/economy.cjs'),original=e.validateEconomyState,t=session(),restore=require('../scripts/economy-profile.cjs').instrument();restore();t.stop();expect(e.validateEconomyState).toBe(original);expect(diagnostics.current()).toBe(null);
});
