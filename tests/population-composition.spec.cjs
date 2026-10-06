const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {composePopulation,split,mass}=require('../scripts/population-composition.cjs');
const {generateComposition,argsOf,atomicWrite}=require('../scripts/apply-population-composition-1700.cjs');
const {Simulation}=require('../shared/simulation.cjs');
const {scenario:legacyScenario,hierarchy:legacyHierarchy}=require('./fixtures/population.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const ids=['gb:JPN:1','gb:FRA:2','residual:JPN:p','gb:IND:3'];
const hierarchy={id:'mandate-atomic-v1',territories:ids.map(id=>({id}))};
const registry=names=>names.map(id=>({id,name:id}));
const registries={cultures:registry(['unclassified','a','b']),religions:registry(['unclassified','folk','buddhist']),strata:registry(['unclassified','peasant','artisan','elite'])};
const baseline={version:1,cultures:registry(['unclassified']),religions:registry(['unclassified']),strata:registry(['unclassified']),cohorts:[
  ['gb:JPN:1','rural',7],['gb:JPN:1','urban',11],['gb:FRA:2','rural',13],['residual:JPN:p','urban',0],['gb:IND:3','urban',17]
].map(([territoryId,settlement,count],i)=>({id:`base-${i}`,territoryId,settlement,count,cultureId:'unclassified',religionId:'unclassified',stratumId:'unclassified',literacyBps:null}))};
const rule=(id,match,fields)=>({id,match,...fields});
const config=rules=>({version:1,rules});
const compose=(rules=[],options={},input=baseline)=>composePopulation(input,registries,config(rules),hierarchy,options);
const culture=(rules,id='gb:JPN:1',settlement='rural')=>compose(rules).population.cohorts.filter(c=>c.territoryId===id&&c.settlement===settlement).map(c=>c.cultureId);
test.beforeAll(async()=>{await fs.mkdir(path.resolve('tmp'),{recursive:true});});
test('joint Hamilton composition preserves global, settlement and every territory mass exactly',()=>{
  const rules=[rule('joint',{}, {cultureShares:{a:5000,b:5000},religionShares:{folk:4000,buddhist:6000},stratumShares:{peasant:6000,artisan:3000,elite:1000}})];
  const before=JSON.stringify(baseline),result=compose(rules),input=mass(baseline),output=mass(result.population);
  expect(output).toEqual(input);expect(JSON.stringify(baseline)).toBe(before);
  for(const source of baseline.cohorts)expect(result.population.cohorts.filter(c=>c.territoryId===source.territoryId&&c.settlement===source.settlement).reduce((n,c)=>n+c.count,0)).toBe(source.count);
  expect(result.population.cohorts.every(c=>['a','b'].includes(c.cultureId)&&['folk','buddhist'].includes(c.religionId)&&['peasant','artisan','elite'].includes(c.stratumId)&&Number.isSafeInteger(c.count)&&c.count>0)).toBe(true);
  expect(result.audit).toMatchObject({inputPopulation:48,outputPopulation:48,ruralInput:20,ruralOutput:20,urbanInput:28,urbanOutput:28});
  for(const key of ['byCulture','byReligion','byStratum'])expect(Object.values(result.audit[key]).reduce((a,b)=>a+b,0)).toBe(48);
});
test('seven persons split 4/3 with stable ASCII Hamilton ties and zero weights omitted',()=>{
  expect(split(7,{b:5000,a:5000})).toEqual([{id:'a',count:4},{id:'b',count:3}]);
  expect(split(1,{a:5000,A:5000})).toEqual([{id:'A',count:1}]);
  expect(split(7,{a:5000,b:5000,unclassified:0})).toEqual(split(7,{b:5000,a:5000}));
  const result=compose([rule('culture',{territoryId:'gb:JPN:1',settlement:'rural'},{cultureShares:{b:5000,a:5000}})]);
  expect(Object.fromEntries(result.population.cohorts.filter(c=>c.territoryId==='gb:JPN:1'&&c.settlement==='rural').map(c=>[c.cultureId,c.count]))).toEqual({a:4,b:3});
});
test('basis-point splitting is exact near maximum safe integer and at zero',()=>{
  const count=Number.MAX_SAFE_INTEGER,rows=split(count,{a:5000,b:5000});
  expect(rows).toEqual([{id:'a',count:4503599627370496},{id:'b',count:4503599627370495}]);
  expect(rows.reduce((n,r)=>n+r.count,0)).toBe(count);expect(split(0,{a:10000})).toEqual([]);
});
for(const [name,mutation,message]of [
  ['wrong sum',r=>r.cultureShares={a:9999},'sum exactly'],
  ['negative share',r=>r.cultureShares={a:-1,b:10001},'invalid share'],
  ['fractional share',r=>r.cultureShares={a:9999.5,b:0.5},'invalid share'],
  ['unknown ID',r=>r.cultureShares={missing:10000},'unknown registry ID'],
  ['unknown territory',r=>r.match.territoryId='gb:JPN:missing','unknown territory'],
  ['empty list',r=>r.match.territoryIds=[],'territory list'],
  ['duplicate list',r=>r.match.territoryIds=['gb:JPN:1','gb:JPN:1'],'territory list'],
  ['bad source country',r=>r.match.sourceCountry='JPN:','sourceCountry'],
  ['bad bbox',r=>r.match.bbox=[0,20,1,10],'bbox'],
  ['unknown stratum',r=>{delete r.cultureShares;r.literacyBps=10;r.match.stratumId='missing';},'stratumId'],
  ['stratum selector for shares',r=>r.match.stratumId='artisan','literacy-only'],
  ['bad literacy',r=>r.literacyBps=10001,'literacyBps'],
  ['hidden ownership selector',r=>r.match.owner='RU','invalid fields'],
  ['birth rates',r=>r.birthRateBps=1,'invalid fields']
])test(`malformed authored rules reject: ${name}`,()=>{
  const r=rule('bad',{}, {cultureShares:{a:10000}});mutation(r);expect(()=>compose([r])).toThrow(message);
});
test('unknown/duplicate registry IDs and absent fallback are rejected',()=>{
  for(const mutate of [r=>r.cultures.push(r.cultures[0]),r=>r.religions=r.religions.filter(r=>r.id!=='unclassified'),r=>r.strata[0].id='constructor']){
    const data=structuredClone(registries);mutate(data);expect(()=>composePopulation(baseline,data,config([]),hierarchy)).toThrow('Composition:');
  }
  expect(()=>compose([rule('same',{}, {literacyBps:1}),rule('same',{}, {literacyBps:1})])).toThrow('duplicate rule');
});
test('exact territory overrides country per field while preserving country religion',()=>{
  const rules=[rule('country',{sourceCountry:'JPN'},{cultureShares:{a:10000},religionShares:{buddhist:10000}}),rule('exact',{territoryId:'gb:JPN:1'},{cultureShares:{b:10000}})];
  expect(culture(rules)).toEqual(['b']);
  expect(compose(rules).population.cohorts.filter(c=>c.territoryId==='gb:JPN:1').every(c=>c.religionId==='buddhist')).toBe(true);
  expect(compose(rules.slice().reverse())).toEqual(compose(rules));
});
test('list, bbox+country, bbox, country and fallback follow documented precedence',()=>{
  const points={'gb:JPN:1':[130,35],'gb:FRA:2':[2,48],'gb:IND:3':[75,20],'residual:JPN:p':[130,35]};
  const rules=[rule('global',{}, {cultureShares:{a:10000}}),rule('country',{sourceCountry:'JPN'}, {cultureShares:{b:10000}}),rule('bbox',{bbox:[120,30,140,40]}, {cultureShares:{a:10000}}),rule('both',{bbox:[120,30,140,40],sourceCountry:'JPN'}, {cultureShares:{b:10000}}),rule('list',{territoryIds:['gb:JPN:1']},{cultureShares:{a:10000}})];
  for(const [length,expected]of [[1,'a'],[2,'b'],[3,'a'],[4,'b'],[5,'a']]){
    const result=compose(rules.slice(0,length),{points});expect(result.population.cohorts.filter(c=>c.territoryId==='gb:JPN:1').every(c=>c.cultureId===expected)).toBe(true);
    expect(compose(rules.slice(0,length).reverse(),{points})).toEqual(result);
  }
  expect(()=>compose(rules.slice(0,3))).toThrow('canonical geographic point');
});
test('settlement-specific rules refine the same geographic level, selectors combine with AND',()=>{
  const rules=[rule('general',{sourceCountry:'JPN'}, {stratumShares:{peasant:10000}}),rule('urban',{sourceCountry:'JPN',settlement:'urban'},{stratumShares:{artisan:10000}}),rule('exact-rural',{territoryId:'gb:JPN:1',settlement:'rural',sourceCountry:'FRA'},{cultureShares:{a:10000}})];
  const result=compose(rules);
  expect(result.population.cohorts.find(c=>c.territoryId==='gb:JPN:1'&&c.settlement==='urban').stratumId).toBe('artisan');
  expect(result.population.cohorts.find(c=>c.territoryId==='gb:JPN:1'&&c.settlement==='rural').stratumId).toBe('peasant');
  expect(result.audit.rulesUnused).toEqual(['exact-rural']);
});
test('bbox selectors support inclusive bounds and antimeridian crossing',()=>{
  const points={'gb:JPN:1':[179,0],'gb:FRA:2':[-179,0],'gb:IND:3':[0,0]};
  const result=compose([rule('wrap',{bbox:[170,-10,-170,10]},{cultureShares:{a:10000},literacyBps:0})],{points});
  expect(result.population.cohorts.filter(c=>c.territoryId==='gb:JPN:1'||c.territoryId==='gb:FRA:2').every(c=>c.cultureId==='a'&&c.literacyBps===0)).toBe(true);
  expect(result.population.cohorts.find(c=>c.territoryId==='gb:IND:3').cultureId).toBe('unclassified');
});
test('equal-specificity conflicts fail even when overridden; equal data and disjoint fields are allowed',()=>{
  const a=rule('a',{}, {cultureShares:{a:10000}}),b=rule('b',{}, {cultureShares:{b:10000}}),exact=rule('exact',{territoryId:'gb:JPN:1'}, {cultureShares:{a:10000}});
  expect(()=>compose([a,b,exact])).toThrow('conflicting equal-specificity');expect(()=>compose([b,a])).toThrow('conflicting equal-specificity');
  expect(()=>compose([a,{...a,id:'same-data'},rule('religion',{}, {religionShares:{folk:10000}})])).not.toThrow();
});
test('ownership never affects composition and source prefixes do not classify residual atoms',()=>{
  const rules=[rule('proxy',{sourceCountry:'JPN'}, {cultureShares:{a:10000}})];
  expect(compose(rules,{ownership:{'gb:JPN:1':'RU'}})).toEqual(compose(rules,{ownership:{'gb:JPN:1':'US'}}));
  const input=structuredClone(baseline);input.cohorts[3].count=5;
  expect(compose(rules,{},input).population.cohorts.find(c=>c.territoryId==='residual:JPN:p').cultureId).toBe('unclassified');
});
test('unmatched and zero cohorts remain safe: unclassified dimensions, null literacy, no rates',()=>{
  const result=compose([rule('unused',{sourceCountry:'USA'}, {cultureShares:{a:10000}})]);
  expect(result.audit).toMatchObject({unclassifiedPopulation:48,knownLiteracyPopulation:0,unknownLiteracyPopulation:48,rulesMatched:[],rulesUnused:['unused'],inputCohorts:5,outputCohorts:4});
  expect(result.population.cohorts.every(c=>c.count>0&&c.cultureId==='unclassified'&&c.religionId==='unclassified'&&c.stratumId==='unclassified'&&c.literacyBps===null&&c.birthRateBps===undefined&&c.deathRateBps===undefined)).toBe(true);
});
test('literacy depends on settlement, stratum and geography, including explicit null override',()=>{
  const rules=[rule('strata',{}, {stratumShares:{artisan:5000,peasant:5000}}),rule('general',{}, {literacyBps:100}),rule('urban',{settlement:'urban'},{literacyBps:200}),rule('artisan',{settlement:'urban',stratumId:'artisan'},{literacyBps:300}),rule('japan',{sourceCountry:'JPN',stratumId:'artisan'},{literacyBps:700}),rule('exact',{territoryId:'gb:JPN:1',settlement:'urban',stratumId:'artisan'},{literacyBps:null})];
  const result=compose(rules);
  const literacy=(id,settlement,stratum)=>result.population.cohorts.find(c=>c.territoryId===id&&c.settlement===settlement&&c.stratumId===stratum).literacyBps;
  expect(literacy('gb:JPN:1','rural','artisan')).toBe(700);expect(literacy('gb:JPN:1','urban','artisan')).toBeNull();
  expect(literacy('gb:IND:3','urban','artisan')).toBe(300);expect(literacy('gb:IND:3','urban','peasant')).toBe(200);
  expect(literacy('gb:FRA:2','rural','peasant')).toBe(100);expect(result.audit.knownLiteracyPopulation+result.audit.unknownLiteracyPopulation).toBe(48);
});
test('stable cohort IDs and bytes ignore input/registry/rule/share ordering and detect collisions',()=>{
  const rules=[rule('a',{}, {cultureShares:{a:5000,b:5000}})],first=compose(rules),reversed=structuredClone(baseline);reversed.cohorts.reverse();
  const r=Object.fromEntries(Object.entries(registries).map(([k,v])=>[k,v.slice().reverse()]));
  const other=composePopulation(reversed,r,config([rule('a',{}, {cultureShares:{b:5000,a:5000}})]),hierarchy);
  expect(json(other)).toBe(json(first));
  const changed=compose([...rules,rule('literacy',{}, {literacyBps:800})]);expect(changed.population.cohorts.map(c=>c.id)).toEqual(first.population.cohorts.map(c=>c.id));
  expect(()=>compose(rules,{cohortHash:()=> '0'.repeat(32)})).toThrow('collision');
});
test('already-composed input and assigned baseline rates reject instead of recursive splitting',()=>{
  expect(()=>compose([],{},compose([rule('culture',{}, {cultureShares:{a:10000}})]).population)).toThrow('original unclassified');
  const input=structuredClone(baseline);input.cohorts[0].birthRateBps=0;expect(()=>compose([],{},input)).toThrow('rate-free');
});
async function fixture(){
  const root=await fs.mkdtemp(path.resolve('tmp')+path.sep+'composition-'),baselineDir=path.join(root,'baseline'),registriesDir=path.join(root,'registries');
  await Promise.all([fs.mkdir(baselineDir),fs.mkdir(registriesDir)]);
  const bytes=json(baseline),hBytes=json(hierarchy),totals=mass(baseline);
  await Promise.all([fs.writeFile(path.join(baselineDir,'population.json'),bytes),fs.writeFile(path.join(baselineDir,'manifest.json'),json({schema:'mandate-population-composition-baseline-v1',scenario:'1700',year:1700,populationSha256:sha(bytes),hierarchySha256:sha(hBytes),totals:{total:totals.total,rural:totals.rural,urban:totals.urban}})),fs.writeFile(path.join(root,'hierarchy.json'),hBytes),fs.writeFile(path.join(root,'rules.json'),json(config([rule('split',{}, {cultureShares:{a:5000,b:5000}})]))),...Object.entries(registries).map(([key,value])=>fs.writeFile(path.join(registriesDir,key+'.json'),json(value)))]);
  return {root,options:{baselineDir,registries:registriesDir,hierarchy:path.join(root,'hierarchy.json'),rules:path.join(root,'rules.json'),output:path.join(root,'population.json'),audit:path.join(root,'composition-summary.json')}};
}
async function cleanup(root){if(path.dirname(root)!==path.resolve('tmp'))throw Error('Unsafe cleanup');await fs.rm(root,{recursive:true,force:true});}
test('generator runs twice with byte-identical output/audit and preserved canonical baseline',async()=>{
  const {root,options}=await fixture();
  try{
    const source=await fs.readFile(path.join(options.baselineDir,'population.json'));
    const first=await generateComposition(options),output=await fs.readFile(options.output),audit=await fs.readFile(options.audit);
    const second=await generateComposition(options);
    expect(await fs.readFile(options.output)).toEqual(output);expect(await fs.readFile(options.audit)).toEqual(audit);
    expect(await fs.readFile(path.join(options.baselineDir,'population.json'))).toEqual(source);expect(second.population).toEqual(first.population);
  }finally{await cleanup(root);}
});
test('failed generation with --publish preserves existing scenario population and metadata',async()=>{
  const {root,options}=await fixture(),targets=['population.json','population.meta.json'].map(n=>path.resolve('scenarios/1700',n));
  try{
    const before=await Promise.all(targets.map(p=>fs.readFile(p)));
    await fs.writeFile(options.rules,json(config([rule('bad',{}, {cultureShares:{unclassified:9999}})])));
    await expect(generateComposition({rules:options.rules,audit:options.audit,publish:true})).rejects.toThrow('sum exactly');
    expect(await Promise.all(targets.map(p=>fs.readFile(p)))).toEqual(before);
    await expect(fs.access(options.audit)).rejects.toMatchObject({code:'ENOENT'});
  }finally{await cleanup(root);}
});
test('baseline tampering and output paths over baseline/config reject before publication',async()=>{
  const {root,options}=await fixture();
  try{
    await fs.writeFile(options.output,'existing');
    await expect(generateComposition({...options,output:path.join(options.baselineDir,'population.json')})).rejects.toThrow('source/config');
    await expect(generateComposition({...options,output:options.rules})).rejects.toThrow('source/config');
    await expect(generateComposition({...options,publish:true})).rejects.toThrow('preview-only');
    await expect(generateComposition({...options,output:path.resolve('scenarios/1700/population.meta.json')})).rejects.toThrow('only scenario');
    await fs.appendFile(path.join(options.baselineDir,'population.json'),' ');
    await expect(generateComposition(options)).rejects.toThrow('provenance mismatch');expect(await fs.readFile(options.output,'utf8')).toBe('existing');
  }finally{await cleanup(root);}
});
test('publication I/O failure leaves previous output intact and removes temp file',async()=>{
  const {root,options}=await fixture(),rename=fs.rename;
  try{
    await fs.writeFile(options.output,'existing');
    fs.rename=async(from,to)=>{if(to===options.output)throw Error('Injected composition publication failure');return rename(from,to);};
    await expect(generateComposition(options)).rejects.toThrow('Injected');expect(await fs.readFile(options.output,'utf8')).toBe('existing');
    expect((await fs.readdir(root)).some(n=>n.endsWith('.tmp'))).toBe(false);
  }finally{fs.rename=rename;await cleanup(root);}
});
test('old saves load unchanged without composition or population layers',()=>{
  const engine=new Simulation(legacyScenario,legacyHierarchy),old=engine.snapshot();delete old.systems.population;
  const bytes=JSON.stringify(old);engine.load(old);engine.step(365);expect(engine.snapshot().systems.population).toBeUndefined();expect(JSON.stringify(old)).toBe(bytes);
});
test('CLI defaults to preview and rejects ambiguous publication flags',()=>{
  expect(argsOf([])).toEqual({});expect(argsOf(['--publish']).publish).toBe(true);
  expect(()=>argsOf(['--publish','--output','tmp/population.json'])).toThrow('mutually exclusive');
  expect(()=>argsOf(['--rules'])).toThrow('Invalid option');expect(()=>argsOf(['--publish','--publish'])).toThrow('Duplicate');
});
