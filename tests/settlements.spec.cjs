const {test,expect}=require('@playwright/test');
const {generateSettlements,validateSettlements,prepareSettlementsMonth,totals}=require('../shared/settlements.cjs');
const {initializePopulation,preparePopulationMonth}=require('../shared/population.cjs');
const {Simulation}=require('../shared/simulation.cjs');
const fixture=require('./fixtures/world-economy.cjs');
function generated(seed=1700,input=fixture.createScenario(),hierarchy=fixture.hierarchy){return generateSettlements(input.population,hierarchy,input.countries,seed);}
function conservation(rows,population,hierarchy){
  const counts=totals(population,hierarchy);
  for(const [id,n] of counts)for(const category of ['urban','rural'])expect(rows.filter(r=>r.provinceId===id&&r.classification===category).reduce((n,r)=>n+r.population,0)).toBe(n[category]);
}
test('settlements preserve each province and classification, with logical positions and urban capitals',()=>{
  const input=fixture.createScenario(),before=JSON.stringify(input),state=generated();conservation(state.rows,input.population,fixture.hierarchy);
  expect(new Set(state.rows.map(r=>r.id)).size).toBe(state.rows.length);expect(state.rows.every(r=>r.population>0&&r.position===null)).toBe(true);
  expect(state.rows.filter(r=>r.provinceId==='province:00003')).toEqual([]);
  expect(state.rows.find(r=>r.provinceId==='province:00005')).toMatchObject({classification:'urban',population:1,type:'town'});
  expect(state.rows.find(r=>r.capitalOf.includes('A'))).toMatchObject({provinceId:'province:00001',classification:'urban'});
  expect(state.rows.filter(r=>r.classification==='urban'&&r.provinceId==='province:00006')).toEqual([]);
  expect(new Set(state.rows.filter(r=>r.provinceId==='province:00001'&&r.classification==='urban').map(r=>r.population)).size).toBeGreaterThan(1);
  expect(JSON.stringify(input)).toBe(before);
});
test('seed determinism, input ordering and province-local random streams',()=>{
  const input=fixture.createScenario(),a=generated(),reordered=structuredClone(input),h=structuredClone(fixture.hierarchy);
  reordered.population.cohorts.reverse();reordered.countries.reverse();h.territories.reverse();expect(generated(1700,reordered,h)).toEqual(a);
  const other=generated(1701);expect(other).not.toEqual(a);conservation(other.rows,input.population,fixture.hierarchy);
  input.population.cohorts.find(c=>c.territoryId==='province:00001').count+=100;
  expect(generated(1700,input).rows.filter(r=>r.provinceId==='province:00002')).toEqual(a.rows.filter(r=>r.provinceId==='province:00002'));
});
test('monthly reconciliation changes allocations only to match authoritative cohort births/deaths',()=>{
  const input=fixture.createScenario();for(const c of input.population.cohorts){c.birthRateBps=1000;c.deathRateBps=500;}
  let population=initializePopulation(input.population,fixture.hierarchy),state=generated(1700,input);const ids=state.rows.map(r=>r.id),weights=state.rows.map(r=>r.weight);
  for(let m=0;m<12;m++){population=preparePopulationMonth(population,fixture.hierarchy).state;state=prepareSettlementsMonth(state,population,fixture.hierarchy);conservation(state.rows,population,fixture.hierarchy);}
  expect(state.rows.map(r=>r.id)).toEqual(ids);expect(state.rows.map(r=>r.weight)).toEqual(weights);expect(state.rows.every(r=>r.population>=0)).toBe(true);
});
test('empty world and rural-only capital do not invent urban inhabitants',()=>{
  const input=fixture.createScenario();input.population.cohorts=[];expect(generated(0,input).rows).toEqual([]);
  input.population.cohorts=[{...fixture.createScenario().population.cohorts[0],count:1}];
  const state=generated(1700,input);expect(state.rows).toHaveLength(1);expect(state.rows[0]).toMatchObject({classification:'rural',population:1,capitalOf:[]});
});
for(const [name,mutate] of Object.entries({negative:s=>s.rows[0].population=-1,duplicate:s=>s.rows.push(structuredClone(s.rows[0])),province:s=>s.rows[0].provinceId='province:99999',classification:s=>s.rows[0].classification='urban',weight:s=>s.rows[0].weight=0,population:s=>s.rows[0].population++,coordinates:s=>s.rows[0].position=[0,0],version:s=>s.version=2,seed:s=>s.seed=-1}))test('settlements reject '+name,()=>{const state=generated();mutate(state);const input=fixture.createScenario();expect(()=>validateSettlements(state,input.population,fixture.hierarchy)).toThrow('Settlements:');});
test('settlement snapshots follow monthly population and failed loads/updates preserve the whole GameState',()=>{
  const input=fixture.createScenario();input.population.cohorts[0].birthRateBps=10000;
  const s=new Simulation(input,fixture.hierarchy,{seed:1700,proceduralWorld:{adjacency:fixture.adjacency}});s.step(31);
  const state=s.snapshot();conservation(state.systems.settlements.rows,state.systems.population,fixture.hierarchy);
  const bad=structuredClone(state);bad.systems.settlements.rows[0].population++;const before=s.serialize();expect(()=>s.load(bad)).toThrow('Settlements:');expect(s.serialize()).toBe(before);
  // Creation of a previously absent urban category is not disguised as migration.
  const rural=fixture.createScenario();rural.population.cohorts=rural.population.cohorts.filter(c=>c.settlement==='rural');
  const t=new Simulation(rural,fixture.hierarchy,{proceduralWorld:{adjacency:fixture.adjacency}});const modified=t.snapshot();
  const row=modified.systems.population.cohorts[0];modified.systems.population.cohorts.push({...structuredClone(row),id:'future-urban',settlement:'urban',count:1});
  expect(()=>prepareSettlementsMonth(modified.systems.settlements,modified.systems.population,fixture.hierarchy,modified.systems.economy)).toThrow('unrepresented');
});
