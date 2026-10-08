const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const read=async name=>JSON.parse(await fs.readFile(`data/processed/adm2/audit/${name}.json`,'utf8'));
test('ADM2 audit is deterministic, IDs and geometry diagnostics are consistent',async()=>{
  test.setTimeout(600000);
  const audit=require('../scripts/audit-adm2.cjs');
  const names=['summary','records','overlaps','corrections'];
  const digest=async()=>Promise.all(names.map(async name=>crypto.createHash('sha256').update(await fs.readFile(`data/processed/adm2/audit/${name}.json`)).digest('hex')));
  const before=await digest();await audit();expect(await digest()).toEqual(before);
  const [summary,records,overlaps]=await Promise.all(['summary','records','overlaps'].map(read));
  const hierarchy=JSON.parse(await fs.readFile('client/data/adm2/hierarchy.json','utf8'));
  expect(summary.total).toBe(hierarchy.territories.length);
  expect(summary.sourceCount).toBe(49349);
  expect(new Set(records.map(r=>r.id)).size).toBe(records.length);
  const parents=new Map(hierarchy.adm1.map(r=>[r.id,r]));
  for(const r of records){
    assert.ok(r.candidates.every(c=>parents.get(c.id).adm0Id===r.canonicalSourceAdm0Id),r.id);
    if(r.category==='confident'){assert.equal(parents.get(r.adm1Id).adm0Id,r.canonicalSourceAdm0Id,r.id);assert.equal(r.candidates[0].id,r.adm1Id,r.id);assert.ok(r.candidates[0].share>=.995,r.id);assert.ok(r.margin>=.994,r.id);}
    if(r.category==='unmatched')assert.equal(r.adm1Id,null,r.id);
    if(r.category==='ambiguous')assert.ok(r.reason,r.id);
    if(r.category==='fallback'){assert.equal(r.id,`fallback:${r.adm1Id}`);assert.equal(r.assignedRealChildren,0,r.id);}
  }
  expect(summary.comparison.removedIds.sort()).toEqual(hierarchy.migration.removedIds.slice().sort());expect(summary.comparison.addedIds.sort()).toEqual(hierarchy.migration.addedIds.slice().sort());
  expect(overlaps).toEqual([]);expect(summary.counts.fallback).toBe(0);expect(summary.counts.residual).toBe(hierarchy.migration.addedIds.length);expect(summary.atomic.overlapFaceCount).toBe(0);expect(summary.coverage.significantUncoveredParts).toBe(0);
  expect(overlaps.filter(o=>o.significant).length).toBe(summary.overlap.significant);
  for(const o of overlaps.filter(o=>o.significant)){expect(o.areaKm2).toBeGreaterThanOrEqual(1);expect(o.smallerShare).toBeGreaterThanOrEqual(.01);}
});
test('spatial scoring respects holes, country constraints and dominant area',()=>{
  const {area,polygons,intersection,assess,countryOf}=require('../scripts/adm2-spatial.cjs');
  const square=(x,y,size)=>({type:'Polygon',coordinates:[[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]]});
  const outer=square(0,0,4);outer.coordinates.push(square(1,1,2).coordinates[0]);
  expect(area(intersection(outer,square(1.2,1.2,.2)))).toBe(0);
  expect(area(polygons(outer))).toBeGreaterThan(0);
  const candidates=[{id:'foreign',geometry:square(0,0,4)},{id:'local',geometry:square(0,0,4)}];
  const result=assess(square(.5,.5,1),candidates,'AAA',{foreign:'BBB',local:'AAA'});
  expect(result.strong).toBe(true);expect(result.scores.map(r=>r.id)).toEqual(['local']);
  expect(countryOf('XKX')).toBe('KOS');expect(countryOf('SSD')).toBe('SDS');expect(countryOf('111')).toBe('111');
});
test('audit is opt-in DEV, filters and navigation work without changing ownership',async({page,request})=>{
  const requests=[],errors=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?audit=1');await page.waitForFunction(()=>window.mandateMap);
  expect(await page.locator('#audit-toggle').count()).toBe(0);expect(requests.some(url=>url.includes('adm2-audit'))).toBe(false);
  expect(requests.some(url=>url.endsWith('/editor/audit.js'))).toBe(false);
  expect((await request.get('/api/adm2-audit/records')).status()).toBe(403);
  await page.goto('/?mapDebug=atomic&editor=1&scenario=1700');await page.waitForFunction(()=>window.mandateEditor);
  expect(requests.some(url=>url.includes('adm2-audit'))).toBe(false);
  expect(requests.some(url=>url.endsWith('/editor/audit.js'))).toBe(false);
  const before=await page.evaluate(()=>JSON.stringify(mandateMap.model.exportScenario()));
  await page.locator('#audit-toggle').click();await expect(page.locator('#audit-country')).toBeVisible();
  expect(requests.some(url=>url.endsWith('/editor/audit.js'))).toBe(true);
  await page.locator('#audit-country').selectOption('ROU');await page.locator('#audit-next').click();
  await page.waitForFunction(()=>mandateMap.lod.pending.size===0&&mandateMap.lod.active.length>0);
  const first=await page.evaluate(()=>mandateMap.selectedId);expect(first).toBeTruthy();
  await expect(page.locator('#audit-info')).toContainText(first);expect(await page.evaluate(()=>mandateMap.zoom)).toBeGreaterThanOrEqual(8);
  await page.locator('#audit-next').click();expect(await page.evaluate(()=>mandateMap.selectedId)).not.toBe(first);
  await page.locator('#audit-prev').click();expect(await page.evaluate(()=>mandateMap.selectedId)).toBe(first);
  const stats=await page.evaluate(()=>mandateMap.lod.stats());expect(stats.cachedChunks).toBeLessThanOrEqual(128);expect(stats.cacheBytes).toBeLessThanOrEqual(12*1024*1024);
  await page.locator('[data-category=ambiguous]').uncheck();await expect(page.locator('#audit-counts')).toContainText('ambiguous: 0');
  await page.locator('#audit-toggle').click();expect(await page.evaluate(()=>mandateMap.audit.enabled)).toBe(false);
  expect(await page.evaluate(()=>JSON.stringify(mandateMap.model.exportScenario()))).toBe(before);
  expect(errors).toEqual([]);
});
test('audit visual tour covers continents, islands, enclave and reserve conflicts',async({page})=>{
  test.setTimeout(120000);
  await page.goto('/?mapDebug=atomic&editor=1&scenario=1700');await page.waitForFunction(()=>window.mandateEditor);
  await page.locator('#audit-toggle').click();await expect(page.locator('#audit-country')).toBeVisible();
  const cases=[['europe','ROU','unmatched'],['russia-islands','RUS','unmatched'],['usa','USA','ambiguous'],['japan-coast','JPN','unmatched'],['palau','PLW','unmatched'],['andorra','AND','unmatched'],['italy-residual','ITA','residual'],['cyprus','CYP','unmatched'],['norway','NOR','ambiguous'],['enclave','LSO','ambiguous'],['brazil','BRA','ambiguous']];
  const results=[];
  for(const [name,country,category]of cases){
    const record=await page.evaluate(({country,category})=>{
      const audit=mandateEditor.audit;
      const r=audit.records.find(r=>r.sourceAdm0Id===country&&r.category===category);
      if(!r)return null;
      audit.country=country;audit.el('audit-country').value=country;audit.filter();mandateMap.selectedId=r.id;mandateMap.hoveredId=null;audit.center(r);audit.inspect(r.id);
      return {id:r.id,name:r.name,reason:r.reason,category:r.category,confidence:r.confidence,candidates:r.candidates,foreignCandidates:r.foreignCandidates,significantOverlaps:r.significantOverlaps||[]};
    },{country,category});
    expect(record).toBeTruthy();
    await page.waitForFunction(()=>mandateMap.lod.pending.size===0&&mandateMap.lod.active.length===mandateMap.lod.needed.size);
    await page.screenshot({path:`test-results/audit-${name}.png`});
    results.push({...record,view:name,stats:await page.evaluate(()=>mandateMap.lod.stats())});
  }
  await fs.writeFile('test-results/adm2-audit-visual-cases.json',JSON.stringify(results,null,2));
});
