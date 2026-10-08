const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {generateWorld}=require('../scripts/generate-mandate-world-1700.cjs');
const {candidateRows}=require('../scripts/mandate-world-provinces.cjs');
const read=async f=>JSON.parse(await fs.readFile(f));
const digest=async f=>crypto.createHash('sha256').update(await fs.readFile(f)).digest('hex');
test('candidate audit uses positive overlap, ASCII ties, null and stable source ordering',()=>{
 const mapping={z:{intersections:[{provinceId:'p',overlapAreaKm2:2}]},a:{intersections:[{provinceId:'p',overlapAreaKm2:2},{provinceId:'p',overlapAreaKm2:0}]},n:{intersections:[{provinceId:'p',overlapAreaKm2:1}]}};
 const asset={owners:{z:'zeta',a:'alpha'}},out=candidateRows(asset,mapping,['p']);expect(out.get('p')).toEqual([{polityId:'alpha',areaKm2:2,share:.4},{polityId:'zeta',areaKm2:2,share:.4},{polityId:null,areaKm2:1,share:.2}]);expect(candidateRows(asset,Object.fromEntries(Object.entries(mapping).reverse()),['p'])).toEqual(out);
});
test('real province publication is deterministic, preserves frozen bytes and rejects invalid overrides before replacement',async()=>{
 test.setTimeout(120000);const root=path.resolve('tmp');await fs.mkdir(root,{recursive:true});const folder=await fs.mkdtemp(path.join(root,'province-world-test-')),scenarioDir=path.join(folder,'scenario');
 try{await fs.cp('scenarios/1700',scenarioDir,{recursive:true});const frozen=[...(await fs.readdir('client/data/map-v2')).map(n=>'client/data/map-v2/'+n),...['population.json','population.meta.json','population-composition.json'].map(n=>path.join(scenarioDir,n))],before=await Promise.all(frozen.map(digest));const options={scenarioDir,audit:path.join(folder,'audit'),publish:true};
 const first=await generateWorld(options),files=['scenario','countries','ownership','controllers','political-geography','polities','polity-relations','political-province-qa'].map(n=>path.join(scenarioDir,n+'.json')),hashes=await Promise.all(files.map(digest));await generateWorld(options);expect(await Promise.all(files.map(digest))).toEqual(hashes);expect(await Promise.all(frozen.map(digest))).toEqual(before);
 expect(first.province.summary.totalPopulation).toBe(591714189);expect(first.province.summary.capitalFailures).toBe(0);expect(first.province.summary.assignedInhabitedAreaPct).toBeGreaterThan(99.9);expect(first.province.outputs['province-ambiguous.json'].filter(r=>r.overridden)).toHaveLength(5);
 const policy=await read(path.join(scenarioDir,'province-political-authoring.json'));policy.provinceOverrides.push({provinceId:'province:99999',ownerPolityId:'qing',reason:'invalid synthetic test'});await fs.writeFile(path.join(scenarioDir,'province-political-authoring.json'),JSON.stringify(policy));await expect(generateWorld(options)).rejects.toThrow('Invalid/duplicate province override');expect(await Promise.all(files.map(digest))).toEqual(hashes);
 }finally{if(path.dirname(folder)!==root)throw Error('Unsafe test cleanup');await fs.rm(folder,{recursive:true,force:true});}
});
