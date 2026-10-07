const {test,expect}=require('@playwright/test');
const {DEFAULTS,graph,partition,produce,simplifyShared}=require('../scripts/gameplay-provinces.cjs');
const {feature}=require('topojson-client');
const fs=require('node:fs');
function fixture(width=12,height=8){
  const arcs=[],edges=new Map(),geometries=[],cohorts=[];
  function edge(a,b){const key=[a.join(','),b.join(',')].sort().join('|');if(edges.has(key)){const n=edges.get(key);return arcs[n][0][0]===a[0]&&arcs[n][0][1]===a[1]?n:~n;}const n=arcs.length;arcs.push([a,b]);edges.set(key,n);return n;}
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const id=`cell:${String(y*width+x).padStart(3,'0')}`,points=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]];
    geometries.push({type:'Polygon',id,arcs:[points.map((p,i)=>edge(p,points[(i+1)%4]))]});cohorts.push({territoryId:id,count:x<width/2?1000000:100});}
  return {topology:{type:'Topology',arcs,objects:{territories:{type:'GeometryCollection',geometries}}},population:{cohorts}};
}
test('deterministic graph partition: complete, unique, connected and shared geometry',()=>{
  const {topology,population}=fixture(),config={...DEFAULTS,target:24,tinyAreaKm2:0};const input=graph(topology,population,config);
  const a=partition(input,config),b=partition(input,config);expect(a).toEqual(b);
  const output=produce(topology,input,a,config);expect(Object.keys(output.mapping)).toHaveLength(96);
  expect(new Set(a.provinces.flatMap(p=>p.members)).size).toBe(96);expect(a.provinces.flatMap(p=>p.members)).toHaveLength(96);
  expect(output.qa.provinceCount).toBeGreaterThanOrEqual(20);expect(output.qa.provinceCount).toBeLessThanOrEqual(24);
  expect(output.qa.disconnectedMainlandProvinces).toEqual([]);expect(output.qa.invalidPolygons).toEqual([]);expect(output.qa.sharedBorderErrors).toEqual([]);
  for(const atom of input.atoms)for(const e of atom.adjacency)expect(input.atoms[e.id].adjacency.find(n=>input.atoms[n.id]===atom)?.borderKm).toBe(e.borderKm);
  for(const p of output.provinces)for(const id of p.adjacency)expect(output.provinces.find(q=>q.id===id).adjacency).toContain(p.id);
  const dense=new Set(input.atoms.filter(a=>a.centroid[0]<6).map(a=>output.mapping[a.id])),sparse=new Set(input.atoms.filter(a=>a.centroid[0]>=6).map(a=>output.mapping[a.id]));expect(dense.size).toBeGreaterThan(sparse.size);
  expect(feature(output.topology,output.topology.objects.provinces).features).toHaveLength(output.qa.provinceCount);
});
test('point contacts are not land adjacency; maritime grouping stays separate',()=>{
  const topology={type:'Topology',arcs:[[[0,0],[1,0],[1,1],[0,1],[0,0]],[[1,1],[1.01,1],[1.01,1.01],[1,1.01],[1,1]]],objects:{territories:{type:'GeometryCollection',geometries:[{id:'large',type:'Polygon',arcs:[[0]]},{id:'islet',type:'Polygon',arcs:[[1]]}]}}};
  const input=graph(topology,{cohorts:[]});expect(input.atoms.every(a=>!a.adjacency.length)).toBe(true);
  const result=partition(input,{...DEFAULTS,target:1});expect(result.provinces).toHaveLength(1);expect(result.maritime).toHaveLength(1);
  const out=produce(topology,input,result);expect(out.provinces[0].landComponents).toBe(2);expect(out.provinces[0].adjacency).toEqual([]);
});
test('current independent artifact supersedes atomic-union preview and preserves population',()=>{
  const qa=JSON.parse(fs.readFileSync('client/data/map-v2/qa.json')),provinces=JSON.parse(fs.readFileSync('client/data/map-v2/provinces.json'));
  expect(qa.provinceCount).toBeGreaterThanOrEqual(4500);expect(qa.provinceCount).toBeLessThanOrEqual(5500);expect(qa.atomCount).toBe(52262);
  expect(qa.structuralFailures).toEqual([]);expect(qa.populationConservationDifference).toBe(0);
  expect(provinces.reduce((s,p)=>s+p.population,0)).toBe(591714189);
  expect(qa.segmentIntersections).toBe(0);
});
test('shared simplification retains exact exterior and a single common internal boundary',()=>{
  const boundary=Array.from({length:21},(_,i)=>[1+(i%2)*.002,i/20]);
  const topology={type:'Topology',arcs:[boundary,[[1,1],[0,1],[0,0],[1,0]],[[1,0],[2,0],[2,1],[1,1]]],objects:{provinces:{type:'GeometryCollection',geometries:[{id:'a',type:'Polygon',arcs:[[0,1]]},{id:'b',type:'Polygon',arcs:[[~0,2]]}]}}};
  const exterior=JSON.stringify(topology.arcs.slice(1)),report=simplifyShared(topology,DEFAULTS);
  expect(JSON.stringify(topology.arcs.slice(1))).toBe(exterior);expect(report.verticesAfter).toBeLessThan(report.verticesBefore);expect(report.segmentIntersections).toBe(0);
  expect(topology.objects.provinces.geometries.map(g=>g.arcs[0][0])).toEqual([0,~0]);
});
test('gameplay browser preview: province hit, statistics, pan and zoom without atomic/scenario requests',async({page})=>{
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto('/?mapPreview=gameplay');await page.waitForFunction(()=>window.mandateMap?.frames>0);
  const qa=JSON.parse(fs.readFileSync('client/data/map-v2/qa.json'));
  await expect(page.locator('#gameplay-inspect')).toContainText(`${qa.provinceCount} provinces`);
  const position=await page.evaluate(()=>{const m=mandateMap;return {x:m.x+182.35*m.scale,y:m.y+41.14*m.scale};});
  await page.mouse.move(position.x,position.y);await expect.poll(()=>page.evaluate(()=>mandateMap.hoveredId)).toMatch(/^preview:/);
  await page.mouse.click(position.x,position.y);await expect(page.locator('#gameplay-inspect')).toContainText('Population 1700:');
  const before=await page.evaluate(()=>({selected:mandateMap.selectedId,x:mandateMap.x}));
  await page.mouse.move(700,500);await page.mouse.down();await page.mouse.move(760,500,{steps:5});await page.mouse.up();expect(await page.evaluate(before=>mandateMap.x-before.x,before)).toBeCloseTo(60);
  await page.mouse.wheel(0,-500);await expect.poll(()=>page.evaluate(()=>mandateMap.zoom)).toBeGreaterThan(1);
  expect(await page.evaluate(()=>mandateMap.selectedId)).toBe(before.selected);expect(requests.some(url=>/\/api\/|\/adm2\//.test(url))).toBe(false);expect(errors).toEqual([]);
  for(const [name,lon,lat,zoom]of [['world',0,0,1],['europe',15,49,12],['india',80,23,10],['japan',138,36,18],['siberia',105,62,6],['sahara',15,24,6],['islands',120,-3,10]]){
    const frames=await page.evaluate(({lon,lat,zoom})=>{const m=mandateMap;m.zoom=zoom;m.scale=m.baseScale*zoom;m.x=m.width/2-(lon+180)*m.scale;m.y=m.height/2-(90-lat)*m.scale;m.background=null;m.hoveredId=null;m.invalidate();return m.frames;},{lon,lat,zoom});
    await page.waitForFunction(frames=>mandateMap.frames>frames,frames);
    await page.screenshot({path:`test-results/gameplay-preview-${name}.png`});
  }
});
