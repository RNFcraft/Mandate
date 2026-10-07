const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path');
const adapter=require('../scripts/historical-basemaps-adapter.cjs');
const {runPreview,argsOf,FROZEN}=require('../scripts/preview-historical-basemaps-1700.cjs');
const {generatePoliticalGeography}=require('../scripts/import-political-geography-1700.cjs');
const {assignPoliticalGeography}=require('../scripts/political-geography-assignment.cjs');
const {hierarchy,population}=require('./fixtures/population.cjs');
const rect=x=>({type:'MultiPolygon',coordinates:[[[[x,0],[x+1,0],[x+1,1],[x,1],[x,0]]]]});
const feature=(NAME,x=0,BORDERPRECISION=3)=>({type:'Feature',properties:{NAME,SUBJECTO:NAME,PARTOF:NAME,BORDERPRECISION,ABBREVN:NAME},geometry:rect(x)});
const source=()=>({type:'FeatureCollection',features:[feature('Alpha'),feature('Beta',3,1),{...feature('Alpha',6),properties:{...feature('Alpha').properties,SUBJECTO:'Beta'}},feature(null,9)]});
const bytes=()=>JSON.stringify(source()),mapping=()=>adapter.proposeMapping(source(),adapter.sha(bytes()));

test('strict source parsing preserves raw data and rejects malformed FeatureCollection and duplicate keys',()=>{
  expect(adapter.parseSource(bytes())).toEqual(source());
  for(const value of ['{}','{"type":"FeatureCollection","features":[null]}','{"type":"FeatureCollection","features":[],"features":[]}'])expect(()=>adapter.parseSource(value)).toThrow();
});
test('proposed ASCII IDs are stable, bounded, Unicode-safe and collision-resistant without geometry inference',()=>{
  for(const name of ['France','Đại Việt','Yup\'ik & Cup\'ik','A'.repeat(160),'東京']){expect(adapter.proposedId(name)).toMatch(/^[a-z0-9_]{1,64}$/);expect(adapter.proposedId(name)).toBe(adapter.proposedId(name));}
  expect(adapter.proposedId('A B')).not.toBe(adapter.proposedId('A-B'));expect(()=>adapter.proposedId(null)).toThrow();
});
test('explicit authored mapping wins over proposed IDs; unmapped/stale/unknown/merging mappings rejected',()=>{
  const m=mapping();m.mappings.Alpha='explicit_alpha';const s=source(),before=JSON.stringify(s),result=adapter.adaptSource(s,m,adapter.sha(bytes()));
  expect(result.source.features.filter(f=>f.properties.NAME==='Alpha').every(f=>f.properties.polityId==='explicit_alpha')).toBe(true);expect(JSON.stringify(s)).toBe(before);expect(result.registry.every(p=>p.type==='source_entity_unreviewed')).toBe(true);expect(result.excluded[0].reason).toContain('unnamed');
  const missing=mapping();delete missing.mappings.Beta;expect(()=>adapter.validateMapping(missing,s,adapter.sha(bytes()))).toThrow('Unmapped');
  const merge=mapping();merge.mappings.Beta=merge.mappings.Alpha;expect(()=>adapter.validateMapping(merge,s,adapter.sha(bytes()))).toThrow('merge');
  expect(()=>adapter.validateMapping({...mapping(),sourceSha256:'bad'},s,adapter.sha(bytes()))).toThrow('stale');
});
test('inventory/relations/precision are deterministic; source precision remains distinct from assignment confidence',()=>{
  const a=adapter.inspectSource(source()),b=adapter.inspectSource({...source(),features:source().features.slice().reverse()});expect(b).toEqual(a);
  expect(a.report.borderPrecisionDistribution).toEqual([{value:1,count:1},{value:3,count:3}]);expect(a.report.duplicateNames).toEqual([{name:'Alpha',count:2}]);expect(a.inventory[0].featureCount).toBe(2);expect(a.inventory[0].areaKm2).toBeGreaterThan(0);
  expect(a.relationshipCandidates).toEqual([{sourceName:'Alpha',sourceField:'SUBJECTO',targetSourceName:'Beta',targetPresentAsNAME:true,relationshipType:null,reviewStatus:'unreviewed',featureCount:1}]);
  const result=adapter.adaptSource(source(),mapping(),adapter.sha(bytes()),a);expect(result.precisionAudit.byPolity[0].sourceBorderPrecisionValues).toEqual([3]);expect(result.precisionAudit.note).toContain('not atomic-overlap');
});
test('invalid geometry never repaired silently; explicit preview exclusion and raw source remain auditable',()=>{
  const s=source();s.features[0].geometry=null;const raw=JSON.stringify(s),m=adapter.proposeMapping(s,adapter.sha(raw)),inspection=adapter.inspectSource(s);
  expect(inspection.report.nullGeometries).toBe(1);expect(inspection.report.invalidGeometries).toHaveLength(1);
  expect(()=>adapter.adaptSource(s,m,adapter.sha(raw),inspection)).toThrow('Invalid source geometry');
  const result=adapter.adaptSource(s,m,adapter.sha(raw),inspection,{excludeInvalid:true});expect(result.excluded.some(r=>r.sourceName==='Alpha'&&r.geometryError)).toBe(true);expect(JSON.stringify(s)).toBe(raw);
});
test('source overlap diagnostics detect independent feature intersections, including unnamed regions',()=>{
  const s=source();s.features[1].geometry=rect(0);const report=adapter.inspectSource(s);expect(report.overlaps).toHaveLength(1);expect(report.overlaps[0].areaKm2).toBeGreaterThan(0);expect(report.report.overlapErrors).toEqual([]);
});
test('canonical area sub-ppm excess from collinear vertices no longer prevents overlap assignment',()=>{
  const geometry={type:'Polygon',coordinates:[[[0,30],[.5,30.005],[1,30.01],[0,31],[0,30]]]},historical={type:'Polygon',coordinates:[[[0,30],[1,30.01],[0,31],[0,30]]]};
  const features=hierarchy.territories.map((t,i)=>({id:t.id,geometry:i?rect(9):geometry})),polities=[{id:'alpha',name:'Alpha',shortName:'Alpha',type:'fixture',color:'#778899'}];
  const result=assignPoliticalGeography({features,hierarchy,baseline:population,polities,relations:{version:1,relations:[]},overrides:{version:1,overrides:[]},sources:[{type:'FeatureCollection',features:[{type:'Feature',properties:{polityId:'alpha'},geometry:historical}]}]});
  expect(result.asset.owners[features[0].id]).toBe('alpha');expect(result.audit.territoryAssignments[0].winningOverlapPct).toBe(100);
});
test('preview CLI refuses publication and orchestrator delegates only preview; frozen files and raw source remain identical',async()=>{
  expect(()=>argsOf(['--publish'])).toThrow('PREVIEW ONLY');await expect(runPreview({publish:true})).rejects.toThrow('forbidden');
  const srcRoot=path.resolve('data/source'),auditRoot=path.resolve('data/generated');await fs.mkdir(srcRoot,{recursive:true});await fs.mkdir(auditRoot,{recursive:true});
  const src=await fs.mkdtemp(path.join(srcRoot,'hb-test-')),audit=await fs.mkdtemp(path.join(auditRoot,'hb-test-')),scenarioDir=path.join(src,'scenario');
  const sourceFile=path.join(src,'source.geojson'),mappingFile=path.join(src,'mapping.json'),raw=bytes();
  try{
    await fs.mkdir(scenarioDir);await fs.writeFile(sourceFile,raw);await fs.writeFile(mappingFile,JSON.stringify(mapping()));
    const before=await Promise.all(FROZEN.map(async f=>adapter.sha(await fs.readFile(f))));let calls=0;
    const generate=async options=>{calls++;expect(Object.hasOwn(options,'publish')).toBe(false);expect(options.sourceCitation).toContain(adapter.sha(raw));return generatePoliticalGeography({...options,scenarioDir},{geography:{features:hierarchy.territories.map((t,i)=>({id:t.id,geometry:rect(i*3)})),hierarchy,geographyHash:'a'.repeat(64),hierarchyHash:'b'.repeat(64)},baseline:population,protectedFiles:FROZEN.map(f=>path.resolve(f))});};
    const options={source:sourceFile,mapping:mappingFile,audit,commit:'a'.repeat(40)};
    const result=await runPreview(options,{generate});expect(result.published).toBe(false);expect(result.mapping.mappedNames).toBe(2);expect(result.provenance.originalFileSha256).toBe(adapter.sha(raw));expect(result.provenance.license).toBe('GPL-3.0');expect(result.provenance.assignment.method).toContain('intersection');expect(calls).toBe(1);
    expect(JSON.parse(await fs.readFile(path.join(audit,'assignment/polity-relations.json')))).toEqual({version:1,relations:[]});
    expect(await fs.readFile(sourceFile,'utf8')).toBe(raw);expect(await Promise.all(FROZEN.map(async f=>adapter.sha(await fs.readFile(f))))).toEqual(before);
    await expect(fs.access(path.join(scenarioDir,'political-geography.json'))).rejects.toMatchObject({code:'ENOENT'});
    const bad=mapping();delete bad.mappings.Beta;await fs.writeFile(mappingFile,JSON.stringify(bad));await expect(runPreview(options,{generate})).rejects.toThrow('Unmapped');expect(calls).toBe(1);expect(JSON.parse(await fs.readFile(path.join(audit,'mapping-audit.json'))).unmappedNames).toEqual(['Beta']);
  }finally{for(const [folder,root]of [[src,srcRoot],[audit,auditRoot]]){if(path.dirname(folder)!==root)throw Error('Unsafe cleanup');await fs.rm(folder,{recursive:true,force:true});}}
});
