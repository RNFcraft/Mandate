const {test,expect}=require('@playwright/test'),path=require('node:path'),{Worker}=require('node:worker_threads');
const {Simulation,ordinal,validateGameState}=require('../shared/simulation.cjs'),{EconomyPool}=require('../shared/economy-pool.cjs'),{createEndpoint}=require('../shared/simulation-protocol.cjs'),fixture=require('./fixtures/world-economy.cjs');
const create=()=>{const s=new Simulation(fixture.createScenario(),fixture.hierarchy,{seed:1700,proceduralWorld:{adjacency:fixture.adjacency}});s.enableAutonomy();return s;};
const pool=size=>new EconomyPool({size,createWorker:()=>new Worker(path.resolve('scripts/economy-worker.cjs'))});
const days=s=>{const d=s.clock.date;return ordinal({year:d.year+(d.month===12?1:0),month:d.month===12?1:d.month+1,day:1})-ordinal(d);};
test('twelve independent markets use all eight workers and ignore completion ordering',async()=>{
  const source=fixture.createScenario(),hierarchy={...fixture.hierarchy,territories:[]},scenario={...source,population:{...source.population,cohorts:[]},ownership:{}},adjacency={...fixture.adjacency,neighbors:{}};
  for(let group=0;group<4;group++){
    const ids=new Map(fixture.hierarchy.territories.map((t,i)=>[t.id,'province:'+String(group*6+i+1).padStart(5,'0')]));
    for(const t of fixture.hierarchy.territories){const id=ids.get(t.id);hierarchy.territories.push({...t,id});scenario.ownership[id]=source.ownership[t.id];adjacency.neighbors[id]=fixture.adjacency.neighbors[t.id].map(id=>ids.get(id));}
    for(const c of source.population.cohorts)scenario.population.cohorts.push({...c,id:c.id+'-g'+group,territoryId:ids.get(c.territoryId)});
  }
  const createLarge=()=>{const s=new Simulation(scenario,hierarchy,{seed:1700,proceduralWorld:{adjacency}});s.enableAutonomy();return s;};
  const reference=createLarge();reference.step(365);const expected=reference.serialize();
  for(const size of [1,2,4,8]){const s=createLarge(),p=pool(size),original=p.call.bind(p);p.call=async(w,type,payload)=>{const result=await original(w,type,payload);if(type==='Prepare')await new Promise(r=>setTimeout(r,(p.workers.indexOf(w)%3)*3));return result;};try{await s.stepAsync(365,p);expect(s.serialize()).toBe(expected);expect(p.workers).toHaveLength(size);}finally{p.dispose();}}
});
for(const size of [1,2,4,6,8])test(`persistent ${size} worker pool matches the entire reference state across 36 months and save/load`,async()=>{
  const a=create(),b=create(),p=pool(size);try{
    for(let month=0;month<36;month++){a.step(days(a));await b.stepAsync(days(b),p);expect(b.serialize()).toBe(a.serialize());validateGameState(b.snapshot(),fixture.hierarchy);if(month===17)b.load(JSON.parse(b.serialize()));}
    expect(p.metrics.months).toBe(36);
  }finally{p.dispose();}
});
test('worker crash and cancellation preserve the month boundary, events and RNG and allow retry',async()=>{
  const a=create(),b=create(),p=pool(2);try{
    a.step(31);await b.stepAsync(31,p);a.step(27);b.step(27);const before=b.serialize(),events=[];b.subscribe(e=>events.push(e));
    const original=p.call.bind(p);let fail=true;p.call=(w,type,payload)=>{const result=original(w,type,payload);if(type==='Prepare'&&fail){fail=false;w.transport.terminate();}return result;};
    await expect(b.stepAsync(1,p)).rejects.toThrow();expect(b.serialize()).toBe(before);expect(events).toEqual([]);
    p.call=original;a.step(1);await b.stepAsync(1,p);expect(b.serialize()).toBe(a.serialize());
    a.step(30);b.step(30);const second=b.serialize();let cancel=true;p.call=(w,type,payload)=>{const result=original(w,type,payload);if(type==='Prepare'&&cancel){cancel=false;queueMicrotask(()=>p.cancel());}return result;};
    await expect(b.stepAsync(1,p)).rejects.toThrow();expect(b.serialize()).toBe(second);p.call=original;a.step(1);await b.stepAsync(1,p);expect(b.serialize()).toBe(a.serialize());
  }finally{p.dispose();}
});
test('pool rejects overflow without partial state or calendar commit',async()=>{
  const b=create(),p=pool(2);try{b.step(30);const state=b.snapshot(),e=state.systems.economy.enterprises.find(e=>e.recipeId==='grow-grain');e.inventories.find(g=>g.goodId==='grain').quantity=Number.MAX_SAFE_INTEGER;b.load(state);const before=b.serialize();await expect(b.stepAsync(1,p)).rejects.toThrow('overflow');expect(b.serialize()).toBe(before);}finally{p.dispose();}
});
test('serialized worker protocol orders commands and saves, rejects duplicate commits and loads atomically',async()=>{
  const messages=[],receive=createEndpoint(m=>messages.push(m));let id=0;
  const send=async(type,payload={})=>{const request={version:1,id:++id,type,payload};await receive(request);return messages.at(-1);};
  await send('Initialize',{scenario:fixture.createScenario(),hierarchy:fixture.hierarchy,options:{seed:1700,proceduralWorld:{adjacency:fixture.adjacency}},autonomous:true});
  const first=receive({version:1,id:++id,type:'Step',payload:{count:31}}),second=receive({version:1,id:++id,type:'SubmitCommand',payload:{command:{type:'SetOwnership',ids:['province:00001'],owner:null}}});await Promise.all([first,second]);
  const saved=await send('Save');expect(JSON.parse(saved.result).state.clock.date).toEqual({year:1700,month:2,day:1});
  const before=(await send('Serialize')).result;
  await receive(null);expect(messages.at(-1).type).toBe('Error');expect((await send('Serialize')).result).toBe(before);
  await receive({version:1,id,type:'Step',payload:{count:31}});expect(messages.at(-1).type).toBe('Error');expect((await send('Serialize')).result).toBe(before);
  expect((await send('Load',{value:'{"bad":true}'})).type).toBe('Error');expect((await send('Serialize')).result).toBe(before);
  await send('Step',{count:28});await send('Load',{value:saved.result});expect((await send('Serialize')).result).toBe(before);
});
test('asynchronous clock applies backpressure and discards suspended catch-up',async()=>{
  const {ClockDriver}=await import('../client/game/clock.js');let now=0,resolve,requests=0;
  const simulation={clock:{paused:false,speed:100},subscribe:()=>()=>{},step:()=>{requests++;return new Promise(r=>resolve=r);},pause:()=>({ok:true})};
  const driver=new ClockDriver(simulation,{now:()=>now,interval:999999});try{now=1000;driver.pump();for(let i=0;i<100;i++){now+=100;driver.pump();}expect(requests).toBe(1);resolve();await new Promise(setImmediate);simulation.loading=true;now+=100;driver.pump();expect(requests).toBe(1);simulation.loading=false;now+=100;driver.pump();expect(requests).toBe(2);resolve();}finally{driver.dispose();}
});
