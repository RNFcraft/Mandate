// Portable deterministic kernel. No DOM, rendering, filesystem or wall clock.
const {validateScenario,migrateLegacy}=require('./scenario.cjs');
const population=require('./population.cjs');
const SPEEDS=Object.freeze([1,5,20,100]);
const STATE_VERSION=1;
const uint=n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff;
const leap=y=>y%4===0&&(y%100!==0||y%400===0);
const monthDays=(y,m)=>[31,leap(y)?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
function ordinal(date){
  const {year:y,month:m,day:d}=date||{};
  if(!Number.isInteger(y)||y<1700||y>9999||!Number.isInteger(m)||m<1||m>12||!Number.isInteger(d)||d<1||d>monthDays(y,m))throw new Error('Invalid simulation date');
  const n=y-1;let result=365*n+Math.floor(n/4)-Math.floor(n/100)+Math.floor(n/400)+d-1;
  for(let month=1;month<m;month++)result+=monthDays(y,month);
  return result;
}
function nextDay(date){
  let {year,month,day}=date;
  if(++day>monthDays(year,month)){day=1;if(++month>12){month=1;year++;}}
  return {year,month,day};
}
function nextRandom(state){let n=state;n^=n<<13;n^=n>>>17;n^=n<<5;return n>>>0;}
function jsonValue(value,seen=new Set()){
  if(value===null||typeof value==='string'||typeof value==='boolean')return;
  if(typeof value==='number'&&Number.isFinite(value))return;
  if(!value||typeof value!=='object'||seen.has(value)||(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype))throw new Error('State must contain plain JSON data');
  seen.add(value);for(const [key,item]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))throw new Error('Unsafe state key');jsonValue(item,seen);}seen.delete(value);
}
function fields(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw new Error('Invalid fields');}
function validateGameState(state,hierarchy){
  jsonValue(state);
  fields(state,['version','geography','game','clock','rng','countries','ownership','controllers','systems']);
  if(state.version!==STATE_VERSION)throw new Error('Unsupported GameState version');
  if(state.geography!==hierarchy.id||state.geography!=='mandate-atomic-v1')throw new Error('Incompatible geography');
  fields(state.game,['scenario']);
  if(state.game.scenario.version!==3||state.game.scenario.geography!==state.geography)throw new Error('Invalid originating scenario');
  validateScenario({scenario:state.game.scenario,countries:state.countries,ownership:state.ownership,controllers:state.controllers},new Set(hierarchy.territories.map(r=>r.id)));
  fields(state.clock,['tick','date','paused','speed']);fields(state.clock.date,['year','month','day']);
  if(!Number.isSafeInteger(state.clock.tick)||state.clock.tick<0||typeof state.clock.paused!=='boolean'||!SPEEDS.includes(state.clock.speed)||ordinal(state.clock.date)!==ordinal({year:state.game.scenario.year,month:1,day:1})+state.clock.tick)throw new Error('Invalid simulation clock');
  fields(state.rng,['seed','state']);if(!uint(state.rng.seed)||!uint(state.rng.state)||state.rng.state===0)throw new Error('Invalid RNG state');
  if(!state.systems||Array.isArray(state.systems)||typeof state.systems!=='object')throw new Error('Invalid system state');
  fields(state.systems.tickProbe,['ticks','lastRandom']);
  if(state.systems.tickProbe.ticks!==state.clock.tick||!uint(state.systems.tickProbe.lastRandom))throw new Error('Invalid tick probe');
  if(Object.hasOwn(state.systems,'population'))population.validatePopulationState(state.systems.population,hierarchy);
  return state;
}
function initializeGameState(scenario,hierarchy,seed=1){
  if(!uint(seed))throw new Error('Seed must be an unsigned 32-bit integer');
  const data=migrateLegacy(scenario,hierarchy);
  const state={version:STATE_VERSION,geography:hierarchy.id,game:{scenario:structuredClone(data.scenario)},clock:{tick:0,date:{year:data.scenario.year,month:1,day:1},paused:true,speed:1},rng:{seed,state:seed||0x6d2b79f5},countries:structuredClone(data.countries),ownership:structuredClone(data.ownership),controllers:structuredClone(data.controllers||{}),systems:{tickProbe:{ticks:0,lastRandom:0}}};
  state.systems.population=population.initializePopulation(scenario.population,hierarchy);
  validateGameState(state,hierarchy);return state;
}
function readOnlyMap(get){
  return Object.freeze({get size(){return get().size;},get:id=>get().get(id),has:id=>get().has(id),keys:()=>get().keys(),values:()=>get().values(),entries:()=>get().entries(),[Symbol.iterator]:()=>get().entries()});
}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
// Trusted system order is explicit. This probe has no gameplay consequences.
const DAILY_SYSTEMS=Object.freeze([state=>{state.rng.state=nextRandom(state.rng.state);state.systems.tickProbe.ticks++;state.systems.tickProbe.lastRandom=state.rng.state;}]);
const MONTHLY_SYSTEMS=Object.freeze([state=>population.advancePopulationMonth(state.systems.population)]);
class Simulation {
  #state;#hierarchy;#owners;#countries;#listeners=new Set();
  constructor(scenario,hierarchy,{seed=1}={}){
    this.#hierarchy=hierarchy;this.#install(initializeGameState(scenario,hierarchy,seed));
    this.ownership=readOnlyMap(()=>this.#owners);this.countries=readOnlyMap(()=>this.#countries);
  }
  #install(state){
    this.#state=state;this.#owners=new Map(Object.entries(state.ownership));
    this.#countries=new Map(state.countries.map(c=>[c.id,freeze(c)]));
  }
  get clock(){return Object.freeze({...this.#state.clock,date:Object.freeze({...this.#state.clock.date})});}
  get scenario(){return structuredClone(this.#state.game.scenario);}
  get controllers(){return Object.freeze({...this.#state.controllers});}
  subscribe(listener){if(typeof listener!=='function')throw new Error('Expected listener');this.#listeners.add(listener);return ()=>this.#listeners.delete(listener);}
  #emit(type,detail={}){
    const event=Object.freeze({type,...detail});
    // Observers cannot roll back committed simulation work or affect other observers.
    for(const listener of this.#listeners)try{listener(event);}catch{}
  }
  snapshot(){return structuredClone(this.#state);}
  serialize(){return JSON.stringify(this.#state);}
  populationSummary(territoryId){return population.summarizePopulation(this.#state.systems.population,territoryId);}
  load(state){
    validateGameState(state,this.#hierarchy);const next=structuredClone(state);this.#install(next);
    this.#emit('stateChanged',{kind:'loaded',ownershipIds:null});this.#emit('gameLoaded',{clock:this.clock});
  }
  start(){return this.submit({type:'ResumeSimulation'});}
  pause(){return this.submit({type:'PauseSimulation'});}
  setSpeed(speed){return this.submit({type:'SetSimulationSpeed',speed});}
  step(count=1){
    if(!Number.isInteger(count)||count<1||count>1000||ordinal(this.#state.clock.date)+count>ordinal({year:9999,month:12,day:31}))throw new Error('Invalid step count or calendar limit');
    // Only small clock/system fields change per tick; never clone/serialize the world.
    for(let i=0;i<count;i++){
      const date=nextDay(this.#state.clock.date);let update;
      // Monthly work is staged before committing this day's clock/RNG.
      if(date.day===1)for(const system of MONTHLY_SYSTEMS)update=system(this.#state);
      for(const system of DAILY_SYSTEMS)system(this.#state);this.#state.clock.tick++;this.#state.clock.date=date;
      if(update)this.#emit('populationUpdated',{date:Object.freeze({...date}),...update});
    }
    this.#emit('timeAdvanced',{steps:count,clock:this.clock});this.#emit('stateChanged',{kind:'time',ownershipIds:[]});
  }
  submit(command){
    try{
      jsonValue(command);
      switch(command?.type){
        case 'PauseSimulation':case 'ResumeSimulation':{
          fields(command,['type']);this.#state.clock.paused=command.type==='PauseSimulation';this.#emit('pauseChanged',{clock:this.clock});break;
        }
        case 'SetSimulationSpeed':{
          fields(command,['type','speed']);if(!SPEEDS.includes(command.speed))throw new Error('Unsupported simulation speed');
          this.#state.clock.speed=command.speed;this.#emit('speedChanged',{clock:this.clock});break;
        }
        case 'SetOwnership':{
          // Integration/debug command; there is no player-facing ownership action.
          fields(command,['type','ids','owner']);
          if(!Array.isArray(command.ids)||!command.ids.length||new Set(command.ids).size!==command.ids.length||command.ids.some(id=>!this.#owners.has(id))||(command.owner!==null&&!this.#countries.has(command.owner)))throw new Error('Invalid ownership command');
          const changed=command.ids.filter(id=>this.#owners.get(id)!==command.owner);
          for(const id of changed){this.#owners.set(id,command.owner);this.#state.ownership[id]=command.owner;}
          const changedSet=new Set(changed);
          this.#state.countries=this.#state.countries.map(c=>{
            if(c.capitalRegionId&&changedSet.has(c.capitalRegionId)&&c.id!==command.owner){const next=Object.freeze({...c,capitalRegionId:null});this.#countries.set(c.id,next);return next;}return c;
          });
          this.#emit('stateChanged',{kind:'ownership',ownershipIds:Object.freeze(changed)});return {ok:true};
        }
        case 'SetCountryColor':case 'SetCapital':{
          const color=command.type==='SetCountryColor';fields(command,color?['type','countryId','color']:['type','countryId','territoryId']);
          const country=this.#countries.get(command.countryId);if(!country)throw new Error('Unknown country');
          if(color?!/^#[0-9a-f]{6}$/i.test(command.color):(command.territoryId!==null&&this.#owners.get(command.territoryId)!==command.countryId))throw new Error('Invalid country metadata command');
          const next=freeze({...country,...(color?{color:command.color}:{capitalRegionId:command.territoryId})});
          this.#countries.set(country.id,next);this.#state.countries=this.#state.countries.map(c=>c.id===country.id?next:c);
          this.#emit('stateChanged',{kind:'countries',ownershipIds:[]});return {ok:true};
        }
        default:throw new Error('Unknown simulation command');
      }
      this.#emit('stateChanged',{kind:'clock',ownershipIds:[]});return {ok:true};
    }catch(error){return {ok:false,error:error.message};}
  }
}
module.exports={Simulation,SPEEDS,STATE_VERSION,initializeGameState,validateGameState,nextRandom,ordinal};
