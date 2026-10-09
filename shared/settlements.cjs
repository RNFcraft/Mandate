// Settlement v1: demographic allocations and placement links, never a second population.
const {TAG}=require('./scenario.cjs');
const compare=(a,b)=>a<b?-1:a>b?1:0;
const fail=message=>{throw Error('Settlements: '+message);};
const safe=n=>Number.isSafeInteger(n)&&n>=0;
function number(n){if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))fail('integer overflow');return Number(n);}
function fields(o,keys){if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).length!==keys.length||keys.some(k=>!Object.hasOwn(o,k)))fail('invalid fields');}
function id(value){if(typeof value!=='string'||!TAG.test(value)||['constructor','prototype','__proto__'].includes(value))fail('invalid ID');}
function hash(seed,key){let n=(2166136261^seed)>>>0;for(let i=0;i<key.length;i++)n=Math.imul(n^key.charCodeAt(i),16777619)>>>0;return n;}
function totals(population,hierarchy){
  const result=new Map(hierarchy.territories.map(t=>[t.id,{urban:0,rural:0}]));
  for(const c of population?.cohorts||[]){const row=result.get(c.territoryId);if(!row||!['urban','rural'].includes(c.settlement)||!safe(c.count))fail('invalid cohort');row[c.settlement]=number(BigInt(row[c.settlement])+BigInt(c.count));}
  number([...result.values()].reduce((n,r)=>n+BigInt(r.urban)+BigInt(r.rural),0n));return result;
}
// Exact largest remainder; fixed weights allocate demographic change, not migration.
function allocate(total,rows){
  const denominator=rows.reduce((n,r)=>n+BigInt(r.weight),0n);if(!denominator){if(total)fail('unrepresented demographic category');return rows.map(()=>0);}
  let assigned=0;const parts=rows.map((r,i)=>{const numerator=BigInt(total)*BigInt(r.weight),quantity=Number(numerator/denominator);assigned+=quantity;return {i,id:r.id,quantity,remainder:numerator%denominator};});
  parts.sort((a,b)=>a.remainder>b.remainder?-1:a.remainder<b.remainder?1:compare(a.id,b.id));
  for(let i=0;i<total-assigned;i++)parts[i].quantity++;
  return parts.sort((a,b)=>a.i-b.i).map(r=>r.quantity);
}
const urbanType=n=>n>=100000?'large-city':n>=10000?'city':'town';
function generateSettlements(population,hierarchy,countries,seed){
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||hierarchy.id!=='mandate-provinces-v1')fail('invalid seed/geography');
  const mass=totals(population,hierarchy),capitals=new Map(),rows=[];
  for(const c of countries){if(c.capitalRegionId){if(!mass.has(c.capitalRegionId))fail('unknown capital province');if(!capitals.has(c.capitalRegionId))capitals.set(c.capitalRegionId,[]);capitals.get(c.capitalRegionId).push(c.id);}}
  for(const territory of [...hierarchy.territories].sort((a,b)=>compare(a.id,b.id))){
    const counts=mass.get(territory.id),key=territory.id.slice(9),density=territory.areaKm2>0?(counts.urban+counts.rural)/territory.areaKm2:0;
    const create=(classification,index,population,type)=>({id:`settlement-${key}-${classification==='urban'?'u':'r'}${String(index).padStart(2,'0')}`,provinceId:territory.id,type,name:`Synthetic ${type} ${key}-${index}`,classification,population,weight:population,position:null,capitalOf:classification==='urban'&&index===1?[...(capitals.get(territory.id)||[])].sort(compare):[],specializations:classification==='urban'?['food-processing','textiles']:['agriculture','textile-fiber',...(density<100&&hash(seed,territory.id+':forest')%4!==0?['forestry']:[]),...(hash(seed,territory.id+':ore')%5===0?['ore-extraction']:[])]});
    if(counts.urban){
      const count=Math.min(12,Math.max(1,Math.ceil(counts.urban/(capitals.has(territory.id)?120000:80000))));
      const weights=Array.from({length:count},(_,i)=>({id:String(i).padStart(2,'0'),weight:Math.max(1,Math.floor(10000/(i+1)**2))+hash(seed,territory.id+':urban:'+i)%300}));
      const allocations=allocate(counts.urban,weights);for(let i=0;i<count;i++)if(allocations[i])rows.push(create('urban',i+1,allocations[i],urbanType(allocations[i])));
    }
    if(counts.rural){
      let remaining=counts.rural;
      const villages=counts.rural>10000?2:1;
      for(let i=1;i<=villages&&remaining;i++){const size=Math.min(remaining,500+hash(seed,territory.id+':village:'+i)%1501);rows.push(create('rural',i,size,'village'));remaining-=size;}
      if(remaining)rows.push(create('rural',3,remaining,'rural-group'));
    }
  }
  const state={version:1,generatorVersion:1,seed,rows:rows.sort((a,b)=>compare(a.id,b.id)),placements:[]};validateSettlements(state,population,hierarchy);return state;
}
function validateSettlements(state,population,hierarchy,economy){
  fields(state,['version','generatorVersion','seed','rows','placements']);
  if(state.version!==1||state.generatorVersion!==1||!Number.isInteger(state.seed)||state.seed<0||state.seed>0xffffffff||!Array.isArray(state.rows)||!Array.isArray(state.placements))fail('invalid version/registry');
  const mass=totals(population,hierarchy),sum=new Map([...mass].map(([k])=>[k,{urban:0,rural:0}])),rows=new Map();
  for(const r of state.rows){
    fields(r,['id','provinceId','type','name','classification','population','weight','position','capitalOf','specializations']);id(r.id);
    if(rows.has(r.id)||!mass.has(r.provinceId)||!safe(r.population)||!safe(r.weight)||r.weight===0||r.position!==null||typeof r.name!=='string'||!r.name.trim()||r.name.length>160||!['urban','rural'].includes(r.classification))fail('invalid settlement');
    if(r.classification==='urban'?!['large-city','city','town'].includes(r.type):!['village','rural-group'].includes(r.type))fail('invalid settlement type');
    for(const key of ['capitalOf','specializations']){if(!Array.isArray(r[key])||new Set(r[key]).size!==r[key].length)fail('invalid labels');r[key].forEach(id);}
    if(r.classification==='rural'&&r.capitalOf.length)fail('rural capital center');
    rows.set(r.id,r);const s=sum.get(r.provinceId);s[r.classification]=number(BigInt(s[r.classification])+BigInt(r.population));
  }
  for(const [provinceId,counts]of mass){const s=sum.get(provinceId);if(s.urban!==counts.urban||s.rural!==counts.rural)fail('population allocation mismatch');}
  const enterprises=new Map((economy?.enterprises||[]).map(e=>[e.id,e])),linked=new Set();
  for(const p of state.placements){
    fields(p,['enterpriseId','settlementId','kind']);id(p.enterpriseId);const row=rows.get(p.settlementId),e=enterprises.get(p.enterpriseId);
    if(!row||!e||linked.has(p.enterpriseId)||e.provinceId!==row.provinceId||!['settlement','external'].includes(p.kind))fail('invalid enterprise placement');linked.add(p.enterpriseId);
  }
  if(economy&&linked.size!==enterprises.size)fail('missing enterprise placement');
  return state;
}
function canonicalizeSettlements(state){state.rows.sort((a,b)=>compare(a.id,b.id));for(const r of state.rows){r.capitalOf.sort(compare);r.specializations.sort(compare);}state.placements.sort((a,b)=>compare(a.enterpriseId,b.enterpriseId));return state;}
function refreshCapitals(state,countries){
  if(!state)return;const centers=new Map();
  for(const r of state.rows){r.capitalOf=[];if(r.classification!=='urban')continue;const old=centers.get(r.provinceId);if(!old||r.population>old.population||r.population===old.population&&compare(r.id,old.id)<0)centers.set(r.provinceId,r);}
  for(const c of countries){const center=centers.get(c.capitalRegionId);if(center)center.capitalOf.push(c.id);}for(const r of centers.values())r.capitalOf.sort(compare);
}
function prepareSettlementsMonth(state,population,hierarchy,economy){
  const next=structuredClone(state),mass=totals(population,hierarchy),groups=new Map();
  for(const row of next.rows){const key=row.provinceId+':'+row.classification;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  for(const [provinceId,counts]of mass)for(const classification of ['urban','rural']){
    const rows=groups.get(provinceId+':'+classification)||[],parts=allocate(counts[classification],rows);
    rows.forEach((r,i)=>{r.population=parts[i];if(classification==='urban')r.type=urbanType(r.population);});
  }
  validateSettlements(next,population,hierarchy,economy);return next;
}
function summarizeSettlements(state,population,economy,provinceId){
  if(!state)return null;
  const recipes=new Map((economy?.recipes||[]).map(r=>[r.id,r])),marketAt=new Map((economy?.markets||[]).flatMap(m=>m.provinceIds.map(id=>[id,m.id]))),firms=new Map((economy?.enterprises||[]).map(e=>[e.id,e])),at=new Map();
  for(const p of state.placements){if(!at.has(p.settlementId))at.set(p.settlementId,[]);at.get(p.settlementId).push(firms.get(p.enterpriseId));}
  return state.rows.filter(r=>provinceId===undefined||r.provinceId===provinceId).map(r=>{const linked=at.get(r.id)||[];return {...structuredClone(r),marketId:marketAt.get(r.provinceId)||null,enterprises:linked.map(e=>e.id).sort(compare),availableLabor:number(BigInt(r.population)*BigInt(economy?.rules.laborParticipationBps||0)/10000n),usedLabor:linked.reduce((n,e)=>n+e.stats.workers,0),revenue:linked.reduce((n,e)=>n+e.stats.revenue,0),activeEnterprises:linked.filter(e=>e.stats.batches>0).length,industries:[...new Set(linked.map(e=>recipes.get(e.recipeId).output.goodId))].sort(compare)};});
}
module.exports={generateSettlements,validateSettlements,prepareSettlementsMonth,canonicalizeSettlements,refreshCapitals,summarizeSettlements,totals,hash,allocate,number,compare};
