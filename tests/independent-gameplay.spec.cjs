const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const {feature}=require('topojson-client');
const {DEFAULTS,componentsFromMask,allocateBudgets,partitionComponent,boundedDensity}=require('../scripts/gameplay-partition.cjs');
const {sharedTopology,regroup,topologyMetadata}=require('../scripts/gameplay-topology.cjs');
const {atomicOverlay}=require('../scripts/gameplay-overlay.cjs');
const {auditGeometry}=require('../scripts/gameplay-qa.cjs');
const {unpackTopology}=require('../scripts/topology-codec.cjs');
const {surfaceArea}=require('../scripts/gameplay-area.cjs');
const box=(x0,y0,x1,y1)=>[[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]];
async function build(mask,target=16){
  const config={...DEFAULTS,targetProvinceCount:target,samplingStep:.15,relaxationIterations:3};
  const components=componentsFromMask(mask,(x)=>x<4?300:0,config);allocateBudgets(components,target,config);
  const parts=components.flatMap(c=>c.budget?partitionComponent(c,config):[{id:`${c.id}:island`,seedId:null,componentId:c.id,seed:c.polygon[0][0],geometry:{type:'Polygon',coordinates:c.polygon}}]);
  const t=await sharedTopology(parts,mask,config),result=regroup(t,parts,components,config),records=topologyMetadata(result.topology,result.metadata,config).records;
  const provinces=feature(result.topology,result.topology.objects.provinces).features;
  const atoms=[{type:'Feature',id:'atom:a',geometry:{type:'Polygon',coordinates:box(0,0,4,8)}},{type:'Feature',id:'atom:b',geometry:{type:'Polygon',coordinates:box(4,0,8,8)}}];
  const overlay=atomicOverlay(atoms,provinces,new Map([['atom:a',101],['atom:b',307]]));
  records.forEach(r=>Object.assign(r,overlay.sums.get(r.id)));
  return {...result,records,overlay,qa:auditGeometry(result.topology,records,mask,config),config};
}
test('independent partition is reproducible, covers land exactly and crosses atomic boundaries',async()=>{
  const mask=[box(0,0,8,8)],a=await build(mask),b=await build(mask);
  expect(a.topology).toEqual(b.topology);expect(a.records).toEqual(b.records);expect(a.overlay.mapping).toEqual(b.overlay.mapping);
  expect(a.qa.provinceCount).toBeGreaterThanOrEqual(14);expect(a.qa.provinceCount).toBeLessThanOrEqual(18);expect(a.qa.structuralFailures).toEqual([]);
  expect(a.qa.gapArea).toBeLessThan(1e-6);expect(a.qa.overlapArea).toBeLessThan(1e-6);expect(a.qa.oceanArea).toBeLessThan(1e-6);
  expect(a.qa.invalidProvinceCount+a.qa.disconnectedProvinceCount).toBe(0);expect(a.qa.sharedTopologyConsistency).toBe(true);
  for(const [id,total]of [['atom:a',101],['atom:b',307]]){const rows=a.overlay.mapping[id].intersections;expect(rows.length).toBeGreaterThan(1);expect(rows.reduce((s,r)=>s+r.population,0)).toBe(total);expect(rows.reduce((s,r)=>s+r.areaFraction,0)).toBeCloseTo(1,7);}
  expect(a.records.reduce((s,p)=>s+p.population,0)).toBe(408);
  expect(boundedDensity(1e12)).toBe(DEFAULTS.densityClamp);expect(boundedDensity(0)).toBe(DEFAULTS.densityFloor);
});
test('bounded target mass retains dense/sparse size contrast through relaxation',()=>{
  const config={...DEFAULTS,samplingStep:.15,skinnyRepairPasses:0};
  const [component]=componentsFromMask([box(0,0,20,10)],x=>x<10?100:0,config);component.budget=100;
  const parts=partitionComponent(component,config).filter(p=>!p.fragment),dense=parts.filter(p=>p.seed[0]<8),sparse=parts.filter(p=>p.seed[0]>12);
  const median=ps=>ps.map(p=>surfaceArea([p.geometry.coordinates])).sort((a,b)=>a-b)[Math.floor(ps.length/2)];
  expect(dense.length).toBeGreaterThan(sparse.length*3);expect(median(sparse)/median(dense)).toBeGreaterThan(3);
  const different=partitionComponent(component,{...config,seed:config.seed+1});expect(different).not.toEqual(partitionComponent(component,config));
});
test('peninsula/concave mask fragments are repaired without mainland disconnection or ocean bridges',async()=>{
  const mask=[[[[0,0],[8,0],[8,8],[6,8],[6,2],[2,2],[2,8],[0,8],[0,0]]]];
  const a=await build(mask,18);expect(a.qa.structuralFailures).toEqual([]);expect(a.qa.disconnectedProvinceCount).toBe(0);expect(a.qa.oceanArea).toBeLessThan(1e-6);
});
test('archipelago membership retains island geometry and does not fabricate land adjacency',async()=>{
  const a=await build([box(0,0,8,8),box(8.4,3,8.5,3.1),box(8.7,3.1,8.8,3.2)]);
  expect(a.maritime).toHaveLength(2);expect(a.records.some(r=>r.archipelago&&r.geometryComponents>1)).toBe(true);
  expect(a.qa.structuralFailures).toEqual([]);expect(a.qa.oceanArea).toBeLessThan(1e-6);
  expect(a.maritime.every(r=>r.provinceId)).toBe(true);
});
test('skinny cleanup merges along a real shared land edge without moving the coastline',async()=>{
  const config={...DEFAULTS},mask=[box(0,0,1,1)],components=componentsFromMask(mask,()=>0,config);components[0].budget=2;
  const parts=[box(0,0,.02,1),box(.02,0,1,1)].map((coordinates,i)=>({id:`part:${i}`,seedId:`seed:${i}`,componentId:components[0].id,seed:[i?.5:.01,.5],geometry:{type:'Polygon',coordinates}}));
  const topology=await sharedTopology(parts,mask,config),result=regroup(topology,parts,components,config),records=topologyMetadata(result.topology,result.metadata,config).records;
  expect(result.cleanup.skinnyMerges).toBe(1);expect(records).toHaveLength(1);expect(records[0].elongation).toBeLessThan(config.skinnyRatio);
  const qa=auditGeometry(result.topology,records,mask,config);expect(qa.structuralFailures).toEqual([]);expect(qa.gapArea+qa.oceanArea+qa.overlapArea).toBeLessThan(1e-6);
});
test('coastline subdivision does not change area; outside-mask atoms keep explicit allocation provenance',async()=>{
  const p=[[[10,30],[15,50],[20,45],[10,30]]],split=[[[10,30],[12.5,40],[15,50],[20,45],[10,30]]];expect(surfaceArea([p])).toBeCloseTo(surfaceArea([split]),6);
  const a=await build([box(0,0,8,8)]),provinces=feature(a.topology,a.topology.objects.provinces).features;
  const out=atomicOverlay([{type:'Feature',id:'missing-island',geometry:{type:'Polygon',coordinates:box(20,20,20.1,20.1)}}],provinces,new Map([['missing-island',17]]));
  expect(out.qa.uncoveredAtoms).toHaveLength(1);expect(out.qa.populationOutputTotal).toBe(17);expect(out.mapping['missing-island'].intersections[0]).toMatchObject({overlapAreaKm2:0,areaFraction:0,allocationFraction:1,population:17,fallback:'outside-clean-mask-nearest-province'});
});
test('generated world satisfies independent QA and exact population transfer',()=>{
  const q=JSON.parse(fs.readFileSync('client/data/map-v2/qa.json'));expect(q.schema).toBe('mandate-independent-gameplay-preview-v2');expect(q.provinceCount).toBeGreaterThanOrEqual(4500);expect(q.provinceCount).toBeLessThanOrEqual(5500);expect(q.structuralFailures).toEqual([]);
  expect(q.populationInputTotal).toBe(591714189);expect(q.populationOutputTotal).toBe(591714189);expect(q.populationConservationDifference).toBe(0);
  expect(q.tinyMainlandProvinceCount).toBe(0);expect(q.microNonIslandComponentCount).toBe(0);expect(q.skinnyProvinceOutliers.length).toBeLessThan(250);expect(q.tinyIslandStandaloneProvinceCount).toBeLessThan(42);
  const p=JSON.parse(fs.readFileSync('client/data/map-v2/provinces.json')),t=unpackTopology(JSON.parse(fs.readFileSync('client/data/map-v2/provinces.topo.json')));expect(p.reduce((s,r)=>s+r.population,0)).toBe(591714189);expect(feature(t,t.objects.provinces).features).toHaveLength(q.provinceCount);
});
test('required visual set, source-mask mode, hover inspection and isolated preview',async({page})=>{
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto('/?mapPreview=gameplay');await page.waitForFunction(()=>window.mandateMap?.frames>0);
  const p=await page.evaluate(()=>({x:mandateMap.x+182.35*mandateMap.scale,y:mandateMap.y+41.14*mandateMap.scale}));await page.mouse.move(p.x,p.y);await page.mouse.click(p.x,p.y);
  await expect(page.locator('#gameplay-inspect')).toContainText('Compactness:');await expect(page.locator('#gameplay-inspect')).toContainText('Intersected atoms:');
  await page.evaluate(()=>{mandateMap.selectedId=null;mandateMap.hoveredId=null;mandateMap.canvas.dispatchEvent(new PointerEvent('pointerleave'));});
  for(const name of ['world','europe','india','china','japan','indonesia','sahara','siberia','canada','alaska','australia','philippines','aegean','scandinavia','britain','caribbean']){
    const frame=await page.evaluate(name=>{mandateMap.gameplayPreview.focus(name);return mandateMap.frames;},name);await page.waitForFunction(frame=>mandateMap.frames>frame,frame);await page.screenshot({path:`test-results/independent-${name}.png`});
  }
  await page.evaluate(()=>{mandateMap.gameplayPreview.focus('indonesia');mandateMap.gameplayPreview.setMode('borders');});await expect.poll(()=>page.evaluate(()=>mandateMap.gameplayPreview.mode)).toBe('borders');await page.screenshot({path:'test-results/independent-land-and-borders.png'});
  await page.evaluate(()=>mandateMap.gameplayPreview.setMode('land'));expect(await page.evaluate(()=>mandateMap.politicalFeatures.length)).toBe(0);
  expect(requests.some(url=>/\/api\/|\/adm2\//.test(url))).toBe(false);expect(errors).toEqual([]);
});
