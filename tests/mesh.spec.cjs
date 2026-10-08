const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {mergeArcs}=require('topojson-client');
const {borderClass,CLASSES}=require('../shared/borders.cjs');
const {unpackTopology}=require('../scripts/topology-codec.cjs');
const read=async file=>unpackTopology(JSON.parse(await fs.readFile(file,'utf8')));
test('canonical atoms, derived coverage and unique classified shared edges',async()=>{
  const [t,d,h,baseline,inv,canonical,manifest]=await Promise.all(['data/processed/adm2/detail.topo.json','client/data/adm2/derived.topo.json','client/data/adm2/hierarchy.json','data/map/adm2-baseline-links.json','data/processed/canonical/invariants.json','data/processed/canonical/atomic.topo.json','client/data/adm2/manifest.json'].map(read));
  expect(inv.topologySha256).toBe(crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex'));
  expect(inv.overlaps).toEqual([]);expect(inv.intersectionErrors).toEqual([]);expect(inv.overlapFaceCount).toBe(0);expect(inv.coverage.significantUncoveredParts).toBe(0);
  const metadata=new Map(h.territories.map(r=>[r.id,r]));
  expect(metadata.size).toBe(h.territories.length);
  const real=baseline.territories.filter(r=>r.id.startsWith('gb:'));
  expect(h.territories.filter(r=>r.kind==='adm2').map(r=>r.id).sort()).toEqual(real.map(r=>r.id).sort());
  for(const r of real)assert.equal(metadata.get(r.id).adm1Id,r.adm1Id,r.id);
  for(const g of t.objects.territories.geometries)assert.ok(g.arcs.length&&metadata.has(g.id),g.id);
  const remap=a=>Array.isArray(a)?a.map(remap):a<0?~d.sourceArcIds[~a]:d.sourceArcIds[a];
  for(const [name,key]of [['regions','adm1Id'],['countries','adm0Id']]){
    const groups=new Map();for(const g of t.objects.territories.geometries){const id=metadata.get(g.id)[key];if(id===null)continue;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(g);}
    expect(d.objects[name].geometries.length).toBe(groups.size);
    for(const g of d.objects[name].geometries)assert.deepEqual({...g,arcs:remap(g.arcs)},{...mergeArcs(t,groups.get(g.id)),id:g.id},g.id);
  }
  for(let i=0;i<d.arcs.length;i++)assert.deepEqual(d.arcs[i],t.arcs[d.sourceArcIds[i]]);
  const draws=new Uint8Array(t.arcs.length);
  for(const c of manifest.chunks){const chunk=await read(`client/data/adm2/chunks/${c.id}.json`);for(let i=0;i<chunk.arcIds.length;i++){
    const global=chunk.arcIds[i];assert.deepEqual(chunk.arcs[i],t.arcs[global]);assert.deepEqual(chunk.neighbors[i],t.neighbors[global]);if(chunk.drawArcs[i])draws[global]++;
  }}
  expect(draws.every(n=>n===1)).toBe(true);
  for(const neighbors of t.neighbors){assert.ok(neighbors.length===1||neighbors.length===2);assert.ok(CLASSES.includes(borderClass(neighbors,h.territories,()=>null)));}
  const rs=[{id:'a',adm1Id:'p',adm0Id:'X'},{id:'b',adm1Id:'p',adm0Id:'X'},{id:'c',adm1Id:'q',adm0Id:'X'},{id:'d',adm1Id:'q',adm0Id:'Y'}];
  expect(borderClass([0],rs,()=>null)).toBe('coastline');expect(borderClass([0,1],rs,()=>null)).toBe('adm2');expect(borderClass([0,2],rs,()=>null)).toBe('adm1');expect(borderClass([0,3],rs,()=>null)).toBe('country');expect(borderClass([0,1],rs,id=>id)).toBe('political');
  const worker=await fs.readFile('scripts/political-worker.cjs','utf8');expect(worker).not.toMatch(/require\(['"](?:mapshaper|polygon-clipping)['"]\)/);
});
test('atomic migration preserves authored real owners, retired claims and controller independence',async()=>{
  const {migrateAtomic}=require('../shared/scenario.cjs');const h=await read('client/data/adm2/hierarchy.json');
  for(const id of ['modern','1700']){
    const old=Object.fromEntries(await Promise.all(['scenario','countries','ownership'].map(async name=>[name,await read(`scenarios/.atomic-backups/${id}/${name}.json`)])));
    const next=migrateAtomic(old,h),disk=Object.fromEntries(await Promise.all(['scenario','countries','ownership'].map(async name=>[name,await read(`scenarios/.atomic-backups/${id}/${name}.json`)])));
    expect(migrateAtomic(next,h)).toEqual(next);expect(next.scenario.version).toBe(3);expect(Object.keys(next.ownership)).toHaveLength(h.territories.length);
    if(old.scenario.version===2){for(const r of h.territories.filter(r=>r.kind==='adm2'))assert.equal(next.ownership[r.id],old.ownership[r.id],r.id);for(const row of h.migration.fallbacks){assert.equal(next.scenario.territoryMigration.retiredOwnership[row.from],old.ownership[row.from]);for(const target of row.to)assert.equal(next.ownership[target],old.ownership[row.from]);}}
  }
  const ids=[...h.territories.filter(r=>r.kind==='adm2').map(r=>r.id),...h.migration.fallbacks.map(r=>r.from)];
  const row=h.migration.fallbacks.find(r=>r.to.length),removed=h.migration.fallbacks.find(r=>!r.to.length);
  const fixture={scenario:{id:'fixture',name:'Fixture',year:1700,version:2,geography:'mandate-adm2-v1'},countries:['A','B'].map(id=>({id,name:id,shortName:id,color:'#777777',governmentType:'test',capitalRegionId:null})),ownership:Object.fromEntries(ids.map(id=>[id,null])),controllers:{[row.from]:'B',[removed.from]:'B'}};
  fixture.ownership[row.from]='A';fixture.ownership[removed.from]='A';fixture.countries[0].capitalRegionId=removed.from;
  const next=migrateAtomic(fixture,h);for(const id of row.to){expect(next.ownership[id]).toBe('A');expect(next.controllers[id]).toBe('B');}expect(next.countries[0].capitalRegionId).toBeNull();expect(next.scenario.territoryMigration.retiredOwnership[removed.from]).toBe('A');expect(next.scenario.territoryMigration.retiredControllers[removed.from]).toBe('B');
  expect(migrateAtomic(next,h)).toEqual(next);
});
