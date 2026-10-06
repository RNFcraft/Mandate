// Offline composition only. No political ownership, randomness or runtime changes.
const {createHash}=require('node:crypto');
const {TAG}=require('../shared/scenario.cjs');
const {validatePopulationScenario}=require('../shared/population.cjs');
const compare=(a,b)=>a<b?-1:a>b?1:0;
const DIMENSIONS=[['cultureShares','cultureId','cultures'],['religionShares','religionId','religions'],['stratumShares','stratumId','strata']];
const fail=message=>{throw Error(`Composition: ${message}`);};
const plain=value=>value&&Object.getPrototypeOf(value)===Object.prototype;
const tag=value=>typeof value==='string'&&TAG.test(value)&&!['__proto__','constructor','prototype'].includes(value);
function fields(value,required,optional=[]){
  if(!plain(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!required.includes(key)&&!optional.includes(key)))fail('invalid fields');
}
function validateRegistries(registries){
  fields(registries,['cultures','religions','strata']);const sets={};
  for(const [key,rows]of Object.entries(registries)){
    if(!Array.isArray(rows))fail(`invalid ${key} registry`);const ids=new Set();
    for(const row of rows){fields(row,['id','name']);if(!tag(row.id)||ids.has(row.id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>160)fail(`invalid/duplicate ${key} ID or name`);ids.add(row.id);}
    if(!ids.has('unclassified'))fail(`${key} requires unclassified`);sets[key]=ids;
  }
  return sets;
}
function validateRules(config,registries,hierarchy){
  const sets=validateRegistries(registries),territories=new Set(hierarchy.territories.map(t=>t.id)),ids=new Set();
  fields(config,['version','rules']);if(config.version!==1||!Array.isArray(config.rules))fail('unsupported rule version/rules');
  return config.rules.map(rule=>{
    fields(rule,['id','match'],['cultureShares','religionShares','stratumShares','literacyBps']);
    if(!tag(rule.id)||ids.has(rule.id))fail('invalid/duplicate rule ID');ids.add(rule.id);
    fields(rule.match,[],['territoryId','territoryIds','sourceCountry','bbox','settlement','stratumId']);const m=rule.match;
    if(Object.hasOwn(m,'territoryId')&&!territories.has(m.territoryId))fail(`unknown territoryId in ${rule.id}`);
    if(Object.hasOwn(m,'territoryIds')&&(!Array.isArray(m.territoryIds)||!m.territoryIds.length||new Set(m.territoryIds).size!==m.territoryIds.length||m.territoryIds.some(id=>!territories.has(id))))fail(`invalid territory list in ${rule.id}`);
    if(Object.hasOwn(m,'sourceCountry')&&(typeof m.sourceCountry!=='string'||! /^[A-Z]{3}$/.test(m.sourceCountry)))fail(`invalid sourceCountry in ${rule.id}`);
    if(Object.hasOwn(m,'settlement')&&!['rural','urban'].includes(m.settlement))fail(`invalid settlement in ${rule.id}`);
    if(Object.hasOwn(m,'bbox')){
      const b=m.bbox;if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||b[0]<-180||b[0]>180||b[2]<-180||b[2]>180||b[1]<-90||b[3]>90||b[1]>=b[3]||b[0]===b[2])fail(`invalid bbox in ${rule.id}`);
    }
    if(Object.hasOwn(m,'stratumId')&&(!sets.strata.has(m.stratumId)||DIMENSIONS.some(([field])=>Object.hasOwn(rule,field))))fail(`stratumId selector is for literacy-only rules: ${rule.id}`);
    if(!DIMENSIONS.some(([field])=>Object.hasOwn(rule,field))&&!Object.hasOwn(rule,'literacyBps'))fail(`empty rule ${rule.id}`);
    const distributions={};
    for(const [field,,registry]of DIMENSIONS)if(Object.hasOwn(rule,field)){
      const shares=rule[field];if(!plain(shares)||!Object.keys(shares).length)fail(`invalid ${field}`);
      let sum=0;for(const [id,bps]of Object.entries(shares)){if(!sets[registry].has(id))fail(`unknown registry ID ${id}`);if(!Number.isInteger(bps)||bps<0||bps>10000)fail(`invalid share ${id}`);sum+=bps;}
      if(sum!==10000)fail(`${field} must sum exactly to 10000`);
      distributions[field]=Object.fromEntries(Object.entries(shares).sort((a,b)=>compare(a[0],b[0])));
    }
    if(Object.hasOwn(rule,'literacyBps')&&rule.literacyBps!==null&&(!Number.isInteger(rule.literacyBps)||rule.literacyBps<0||rule.literacyBps>10000))fail(`invalid literacyBps in ${rule.id}`);
    const geography=m.territoryId!==undefined?5:m.territoryIds!==undefined?4:m.bbox!==undefined&&m.sourceCountry!==undefined?3:m.bbox!==undefined?2:m.sourceCountry!==undefined?1:0;
    return {...rule,...distributions,priority:geography*4+(m.settlement!==undefined?2:0)+(m.stratumId!==undefined?1:0),territorySet:m.territoryIds?new Set(m.territoryIds):null};
  }).sort((a,b)=>compare(a.id,b.id));
}
function matches(rule,cohort,points){
  const m=rule.match;
  if(m.territoryId!==undefined&&m.territoryId!==cohort.territoryId||rule.territorySet&&!rule.territorySet.has(cohort.territoryId)||m.sourceCountry!==undefined&&!cohort.territoryId.startsWith(`gb:${m.sourceCountry}:`)||m.settlement!==undefined&&m.settlement!==cohort.settlement||m.stratumId!==undefined&&m.stratumId!==cohort.stratumId)return false;
  if(m.bbox){
    const point=points?.[cohort.territoryId];if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||Math.abs(point[0])>180||Math.abs(point[1])>90)fail(`canonical geographic point required for ${cohort.territoryId}`);
    const [west,south,east,north]=m.bbox,[x,y]=point;
    if(y<south||y>north||(west<east?x<west||x>east:x<west&&x>east))return false;
  }
  return true;
}
function resolve(rules,field,cohort,points,used){
  const groups=new Map();
  for(const rule of rules)if(Object.hasOwn(rule,field)&&matches(rule,cohort,points)){
    used.add(rule.id);const value=rule[field],previous=groups.get(rule.priority);
    if(previous&&JSON.stringify(previous.value)!==JSON.stringify(value))fail(`conflicting equal-specificity ${field}: ${previous.id}, ${rule.id} at ${cohort.territoryId}/${cohort.settlement}`);
    groups.set(rule.priority,{id:rule.id,value});
  }
  return groups.size?groups.get(Math.max(...groups.keys())).value:undefined;
}
// Exact integer Hamilton for basis points, including safe counts near 2^53.
function split(count,shares){
  if(!Number.isSafeInteger(count)||count<0)fail('invalid split count');
  let sum=0;const rows=Object.entries(shares).map(([id,bps])=>{
    if(!tag(id)||!Number.isInteger(bps)||bps<0||bps>10000)fail('invalid split shares');sum+=bps;
    const numerator=BigInt(count)*BigInt(bps);return {id,count:Number(numerator/10000n),remainder:numerator%10000n};
  }).sort((a,b)=>compare(a.id,b.id));
  if(sum!==10000)fail('split shares must sum exactly to 10000');
  let remaining=count-rows.reduce((n,r)=>n+r.count,0);
  const ranked=rows.slice().sort((a,b)=>a.remainder===b.remainder?compare(a.id,b.id):a.remainder>b.remainder?-1:1);
  for(let i=0;i<remaining;i++)ranked[i].count++;
  return rows.filter(r=>r.count>0).map(({id,count})=>({id,count}));
}
const cohortHash=tuple=>createHash('sha256').update(JSON.stringify(tuple)).digest('hex').slice(0,32);
function mass(population){
  const territories=new Map();let total=0n,rural=0n,urban=0n;
  for(const c of population.cohorts){if(!c.count)continue;const count=BigInt(c.count),key=JSON.stringify([c.territoryId,c.settlement]);territories.set(key,(territories.get(key)||0n)+count);total+=count;if(c.settlement==='rural')rural+=count;else urban+=count;}
  return {total:Number(total),rural:Number(rural),urban:Number(urban),territories};
}
function composePopulation(baseline,registries,config,hierarchy,options={}){
  validatePopulationScenario(baseline,hierarchy);
  if(baseline.cohorts.some(c=>c.cultureId!=='unclassified'||c.religionId!=='unclassified'||c.stratumId!=='unclassified'||c.literacyBps!==null||Object.hasOwn(c,'birthRateBps')||Object.hasOwn(c,'deathRateBps')))fail('input must be the original unclassified, unknown-literacy, rate-free HYDE baseline');
  const rules=validateRules(config,registries,hierarchy),cohorts=[],ids=new Set(),used=new Set(),hash=options.cohortHash||cohortHash;
  for(const source of baseline.cohorts.slice().sort((a,b)=>compare(a.territoryId,b.territoryId)||compare(a.settlement,b.settlement))){
    if(!source.count)continue;
    let children=[{territoryId:source.territoryId,settlement:source.settlement,count:source.count}];
    for(const [field,target]of DIMENSIONS){
      const shares=resolve(rules,field,source,options.points,used)||{unclassified:10000};
      children=children.flatMap(parent=>split(parent.count,shares).map(row=>({...parent,[target]:row.id,count:row.count})));
    }
    if(children.reduce((n,c)=>n+c.count,0)!==source.count)fail(`input cohort mass changed: ${source.id}`);
    for(const child of children){
      const tuple=[child.territoryId,child.settlement,child.cultureId,child.religionId,child.stratumId],suffix=hash(tuple);
      if(typeof suffix!=='string'||!/^[a-f0-9]{32}$/.test(suffix))fail('invalid cohort hash');
      const id=`p1700c-${suffix}`;if(ids.has(id))fail(`cohort ID collision: ${id}`);ids.add(id);
      const literacyBps=resolve(rules,'literacyBps',child,options.points,used)??null;
      cohorts.push({id,territoryId:child.territoryId,cultureId:child.cultureId,religionId:child.religionId,stratumId:child.stratumId,settlement:child.settlement,count:child.count,literacyBps});
    }
  }
  cohorts.sort((a,b)=>compare(a.id,b.id));
  const population={version:1,...Object.fromEntries(['cultures','religions','strata'].map(key=>[key,registries[key].slice().sort((a,b)=>compare(a.id,b.id)).map(({id,name})=>({id,name}))])),cohorts};
  validatePopulationScenario(population,hierarchy);const input=mass(baseline),output=mass(population);
  for(const key of ['total','rural','urban'])if(input[key]!==output[key])fail(`${key} mass changed`);
  for(const key of new Set([...input.territories.keys(),...output.territories.keys()]))if((input.territories.get(key)||0n)!==(output.territories.get(key)||0n))fail(`territory/settlement mass changed: ${key}`);
  const byCulture=new Map(),byReligion=new Map(),byStratum=new Map();let knownLiteracyPopulation=0,unknownLiteracyPopulation=0,unclassifiedPopulation=0;
  const unclassifiedByDimension={culture:0,religion:0,stratum:0};
  for(const c of cohorts){
    for(const [field,map]of [['cultureId',byCulture],['religionId',byReligion],['stratumId',byStratum]])map.set(c[field],(map.get(c[field])||0)+c.count);
    if(c.literacyBps===null)unknownLiteracyPopulation+=c.count;else knownLiteracyPopulation+=c.count;
    if(['cultureId','religionId','stratumId'].some(key=>c[key]==='unclassified'))unclassifiedPopulation+=c.count;
    for(const dimension of ['culture','religion','stratum'])if(c[dimension+'Id']==='unclassified')unclassifiedByDimension[dimension]+=c.count;
  }
  const ordered=map=>Object.fromEntries([...map].sort((a,b)=>compare(a[0],b[0])));
  return {population,audit:{schema:'mandate-population-composition-audit-v1',inputPopulation:input.total,outputPopulation:output.total,ruralInput:input.rural,ruralOutput:output.rural,urbanInput:input.urban,urbanOutput:output.urban,inputCohorts:baseline.cohorts.length,outputCohorts:cohorts.length,byCulture:ordered(byCulture),byReligion:ordered(byReligion),byStratum:ordered(byStratum),knownLiteracyPopulation,unknownLiteracyPopulation,unclassifiedPopulation,unclassifiedByDimension,rulesMatched:rules.filter(r=>used.has(r.id)).map(r=>r.id),rulesUnused:rules.filter(r=>!used.has(r.id)).map(r=>r.id)}};
}
module.exports={composePopulation,validateRules,validateRegistries,split,mass,cohortHash};
