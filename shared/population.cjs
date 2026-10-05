// Population v1: plain JSON authority, exact integer arithmetic, no geography.
const {TAG}=require('./scenario.cjs');
const DENOMINATOR=120000;
const emptyPopulation=()=>({version:1,cultures:[],religions:[],strata:[],cohorts:[]});
const fail=message=>{throw new Error(`Population: ${message}`);};
function plain(value){
  if(!value||Object.getPrototypeOf(value)!==Object.prototype)fail('expected plain object');
  if(Object.keys(value).some(k=>['__proto__','constructor','prototype'].includes(k)))fail('unsafe key');
}
function fields(value,required,optional=[]){plain(value);if(required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>!required.includes(k)&&!optional.includes(k)))fail('invalid fields');}
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const bps=n=>Number.isInteger(n)&&n>=0&&n<=10000;
const tag=id=>typeof id==='string'&&TAG.test(id)&&!['__proto__','constructor','prototype'].includes(id);
function number(n){if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))fail('integer overflow');return Number(n);}
function validate(data,hierarchy,runtime){
  fields(data,['version','cultures','religions','strata','cohorts',...(runtime?['stats']:[])]);
  if(data.version!==1)fail('unsupported version');
  const registries={};
  for(const key of ['cultures','religions','strata']){
    if(!Array.isArray(data[key]))fail(`invalid ${key}`);const ids=new Set();
    for(const row of data[key]){fields(row,['id','name']);if(!tag(row.id)||ids.has(row.id))fail(`duplicate or invalid ${key} ID`);if(typeof row.name!=='string'||!row.name.trim()||row.name.length>160)fail('invalid registry name');ids.add(row.id);}
    registries[key]=ids;
  }
  if(!Array.isArray(data.cohorts))fail('invalid cohorts');
  const territories=new Set(hierarchy.territories.map(t=>t.id)),ids=new Set(),tuples=new Set();let total=0n;
  for(const c of data.cohorts){
    fields(c,['id','territoryId','cultureId','religionId','stratumId','settlement','count','literacyBps',...(runtime?['birthRateBps','deathRateBps','birthRemainder','deathRemainder']:[])],runtime?[]:['birthRateBps','deathRateBps']);
    if(!tag(c.id)||ids.has(c.id))fail('duplicate or invalid cohort ID');ids.add(c.id);
    if(!territories.has(c.territoryId))fail('unknown territoryId');
    for(const [field,registry] of [['cultureId','cultures'],['religionId','religions'],['stratumId','strata']])if(!registries[registry].has(c[field]))fail(`unknown ${field}`);
    if(!['rural','urban'].includes(c.settlement))fail('invalid settlement');
    const tuple=JSON.stringify([c.territoryId,c.cultureId,c.religionId,c.stratumId,c.settlement]);if(tuples.has(tuple))fail('duplicate demographic tuple');tuples.add(tuple);
    if(!safe(c.count))fail('invalid count');total+=BigInt(c.count);
    if(c.literacyBps!==null&&!bps(c.literacyBps))fail('invalid literacyBps');
    for(const key of ['birthRateBps','deathRateBps'])if((runtime||Object.hasOwn(c,key))&&!bps(c[key]))fail(`invalid ${key}`);
    if(runtime)for(const key of ['birthRemainder','deathRemainder'])if(!Number.isInteger(c[key])||c[key]<0||c[key]>=DENOMINATOR)fail(`invalid ${key}`);
  }
  number(total);
  if(runtime){fields(data.stats,['monthsProcessed','births','deaths']);if(Object.values(data.stats).some(n=>!safe(n)))fail('invalid cumulative stats');}
  return data;
}
const validatePopulationScenario=(data,hierarchy)=>validate(data,hierarchy,false);
const validatePopulationState=(data,hierarchy)=>validate(data,hierarchy,true);
function initializePopulation(data=emptyPopulation(),hierarchy){
  validatePopulationScenario(data,hierarchy);
  return {...structuredClone(data),cohorts:data.cohorts.map(c=>({...c,birthRateBps:c.birthRateBps??0,deathRateBps:c.deathRateBps??0,birthRemainder:0,deathRemainder:0})),stats:{monthsProcessed:0,births:0,deaths:0}};
}
function advancePopulationMonth(state){
  if(!state)return null;
  // Stage numeric results only; overflow cannot partially modify cohorts or stats.
  const changes=[];let births=0n,deaths=0n,total=0n;
  for(const c of state.cohorts){
    const b=BigInt(c.count)*BigInt(c.birthRateBps)+BigInt(c.birthRemainder),d=BigInt(c.count)*BigInt(c.deathRateBps)+BigInt(c.deathRemainder),born=b/120000n,died=d/120000n;
    const count=number(BigInt(c.count)+born-died);births+=born;deaths+=died;total+=BigInt(count);
    changes.push({count,birthRemainder:Number(b%120000n),deathRemainder:Number(d%120000n)});
  }
  number(total);const stats={monthsProcessed:number(BigInt(state.stats.monthsProcessed)+1n),births:number(BigInt(state.stats.births)+births),deaths:number(BigInt(state.stats.deaths)+deaths)};
  for(let i=0;i<changes.length;i++)Object.assign(state.cohorts[i],changes[i]);state.stats=stats;
  return {births:number(births),deaths:number(deaths),netChange:Number(births-deaths)};
}
function summarizePopulation(state,territoryId){
  const result={total:0,urban:0,rural:0,literacyBps:0,byCulture:{},byReligion:{},byStratum:{}};let weighted=0n,unknown=false;
  for(const c of state?.cohorts||[]){
    if(territoryId!==undefined&&c.territoryId!==territoryId)continue;
    result.total+=c.count;result[c.settlement]+=c.count;
    if(c.count>0&&c.literacyBps===null)unknown=true;
    else if(c.literacyBps!==null)weighted+=BigInt(c.count)*BigInt(c.literacyBps);
    for(const [key,id] of [['byCulture',c.cultureId],['byReligion',c.religionId],['byStratum',c.stratumId]])result[key][id]=(Object.hasOwn(result[key],id)?result[key][id]:0)+c.count;
  }
  if(result.total)result.literacyBps=unknown?null:Number(weighted/BigInt(result.total));return result;
}
module.exports={DENOMINATOR,emptyPopulation,validatePopulationScenario,initializePopulation,validatePopulationState,advancePopulationMonth,summarizePopulation};
