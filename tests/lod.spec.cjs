const { test, expect } = require('@playwright/test');
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const {createReadStream}=require('node:fs');
async function digest(file){const h=crypto.createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
async function camera(page,lon,lat,zoom){
  await page.evaluate(({lon,lat,zoom})=>{const m=mandateMap;m.zoom=zoom;m.scale=m.baseScale*zoom;m.x=m.width/2-(lon+180)*m.scale;m.y=m.height/2-(90-lat)*m.scale;m.render();},{lon,lat,zoom});
  await page.waitForFunction(()=>mandateMap.lod.pending.size===0&&mandateMap.lod.active.length===mandateMap.lod.needed.size);
  await page.waitForFunction(()=>mandateMap.lod.level==='close'||mandateMap.background?.scale===mandateMap.scale);
}
test('ADM2 LOD, lazy loading, bounded cache, global touring and profiling',async({page})=>{
  test.setTimeout(180000);
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>requests.push(r.url()));
  await page.addInitScript(()=>{window.__lodLongTasks=[];new PerformanceObserver(list=>{for(const entry of list.getEntries())window.__lodLongTasks.push({start:entry.startTime,duration:entry.duration,phase:window.__lodPhase});}).observe({type:'longtask',buffered:true});});
  await page.goto('/?mapDebug=atomic');await page.waitForFunction(()=>window.mandateMap?.politicalFeatures);
  expect(requests.some(url=>url.includes('/chunks/'))).toBe(false);
  expect(await page.evaluate(()=>mandateMap.lod.stats().activeTerritories)).toBe(0);
  expect(requests.some(url=>url.includes('geoBoundariesCGAZ')||url.includes('coarse.topo')||url.includes('detail.topo'))).toBe(false);
  const measurements=[];
  async function measure(name){
    const data=await page.evaluate(async()=>{
      window.__lodPhase='animation-frame-profile';const m=mandateMap,t=[],frames=[];let previous;
      for(let i=0;i<15;i++){
        const timestamp=await new Promise(resolve=>requestAnimationFrame(resolve));
        if(previous!==undefined)frames.push(timestamp-previous);previous=timestamp;
        m.render();t.push(m.lastRenderMs);
      }
      t.sort((a,b)=>a-b);frames.sort((a,b)=>a-b);
      return {...m.lod.stats(),median:t[7],max:t[14],frameMedian:frames[7],frameMax:frames.at(-1),politicalComputeMs:m.politicalComputeMs};
    });
    measurements.push({name,...data});expect(data.cachedChunks).toBeLessThanOrEqual(128);expect(data.cacheBytes).toBeLessThanOrEqual(12*1024*1024);expect(data.error).toBeNull();expect(data.median).toBeLessThan(50);return data;
  }
  const far=await measure('world');expect(far.median).toBeLessThan(15);expect(far.frameMedian).toBeLessThan(50);
  expect(await page.evaluate(()=>mandateMap.background.canvas.width<=mandateMap.canvas.width+256&&mandateMap.background.canvas.height<=mandateMap.canvas.height+256)).toBe(true);
  await page.evaluate(()=>{window.__lodLongTasks=[];window.__lodWarm=performance.now();window.__lodPhase='camera';});
  await camera(page,5,49,4);expect(await page.evaluate(()=>mandateMap.lod.level)).toBe('medium');expect(requests.some(url=>url.includes('/chunks/'))).toBe(false);
  expect((await measure('ADM1 medium')).frameMedian).toBeLessThan(50);
  const regions=[['Russia',70,57],['Central Asia',65,44],['Italy',12,43],['Balkans',22,42],['Europe',5,49],['Romania dense',25,46],['India',78,24],['Japan',138,36],['Brazil dense',-47,-22],['USA',-91,38],['date line',179,55]];
  for(const [name,lon,lat]of regions){await page.evaluate(name=>{window.__lodPhase=name;},name);await camera(page,lon,lat,16);const s=await measure(name);expect(s.activeTerritories).toBeGreaterThan(0);}
  await camera(page,5,49,16);
  const before=await page.evaluate(()=>mandateMap.lod.requests);
  await camera(page,5.05,49.05,16);await camera(page,5,49,16);
  expect(await page.evaluate(()=>mandateMap.lod.requests)).toBe(before);
  const hit=await page.evaluate(()=>{window.__lodPhase='test-hit-scan';const m=mandateMap;for(let y=100;y<innerHeight-100;y+=10)for(let x=100;x<innerWidth-100;x+=10){const id=m.hit(x,y);if(id?.startsWith('gb:'))return {x,y,id};}});
  expect(hit).toBeTruthy();await page.mouse.move(hit.x,hit.y);expect(await page.evaluate(()=>mandateMap.hoveredId)).toBe(hit.id);
  await page.mouse.click(hit.x,hit.y);await page.mouse.move(10,10);expect(await page.evaluate(()=>mandateMap.selectedId)).toBe(hit.id);
  const center=await page.evaluate(()=>mandateMap.screenToWorld(innerWidth/2,innerHeight/2));await page.setViewportSize({width:1100,height:750});
  await page.waitForFunction(()=>mandateMap.width===1100);expect((await page.evaluate(()=>mandateMap.screenToWorld(innerWidth/2,innerHeight/2)))[0]).toBeCloseTo(center[0],8);
  // Fast direction reversals must discard stale requests and restore coarse rendering.
  await page.evaluate(async()=>{
    window.__lodPhase='rapid-zoom';const m=mandateMap;
    for(let i=0;i<20;i++){await new Promise(resolve=>requestAnimationFrame(resolve));m.zoom=i%2?1:32;m.scale=m.baseScale*m.zoom;m.x=m.width/2-185*m.scale;m.y=m.height/2-41*m.scale;m.render();}
    m.zoom=1;m.resize();m.x=(m.width-360*m.scale)/2;m.y=(m.height-180*m.scale)/2;m.invalidate();
  });
  await page.waitForFunction(()=>mandateMap.lod.level==='far'&&mandateMap.lod.pending.size===0);
  expect(await page.evaluate(()=>mandateMap.lod.active.length)).toBe(0);
  await measure('world after tour');await page.screenshot({path:'test-results/adm2-world.png'});
  expect(errors).toEqual([]);await fs.writeFile('test-results/lod-profile.json',JSON.stringify(measurements,null,2));
  const longTasks=await page.evaluate(()=>window.__lodLongTasks.filter(t=>t.start>=window.__lodWarm));
  await fs.writeFile('test-results/lod-long-tasks.json',JSON.stringify(longTasks));
  console.log('Tour long tasks:',JSON.stringify(longTasks));
  console.log('LOD profile:',measurements.map(m=>`${m.name}: ${m.median.toFixed(1)}ms / ${m.activeTerritories} ADM2 / ${m.cachedChunks} cached`).join('; '));
});
test('hierarchy IDs, original source hash and lossless legacy ownership migration',async()=>{
  const {migrateLegacy}=require('../shared/scenario.cjs');
  const hierarchy=JSON.parse(await fs.readFile('client/data/adm2/hierarchy.json','utf8'));
  const report=JSON.parse(await fs.readFile('data/processed/adm2/report.json','utf8'));
  expect(await digest(report.source)).toBe(report.sourceSha256);
  expect(new Set(hierarchy.territories.map(r=>r.id)).size).toBe(hierarchy.territories.length);
  const countries=new Set(hierarchy.adm0.map(r=>r.id)),parents=new Set(hierarchy.adm1.map(r=>r.id));
  expect(hierarchy.territories.every(r=>countries.has(r.adm0Id)&&(!r.adm1Id||parents.has(r.adm1Id)))).toBe(true);
  for(const id of ['modern','1700']){
    const files=['scenario','countries','ownership'];const before=await Promise.all(files.map(name=>fs.readFile(`scenarios/.atomic-backups/${id}/${name}.json`,'utf8')));
    const legacy=Object.fromEntries(files.map((name,i)=>[name,JSON.parse(before[i])]));const next=migrateLegacy(legacy,hierarchy);
    expect(next.scenario.version).toBe(3);
    if(legacy.scenario.version===1)expect(hierarchy.territories.every(r=>next.ownership[r.id]===(r.adm1Id?legacy.ownership[r.adm1Id]:null))).toBe(true);
    else if(legacy.scenario.version===2)for(const territory of hierarchy.territories.filter(t=>t.kind==='adm2'))expect(next.ownership[territory.id]).toBe(legacy.ownership[territory.id]);
    else expect(next.ownership).toEqual(legacy.ownership);
    expect(await Promise.all(files.map(name=>fs.readFile(`scenarios/.atomic-backups/${id}/${name}.json`,'utf8')))).toEqual(before);
  }
});
test('explicit v2 save preserves a v1 disk backup, capital provenance and independent controllers',async({request})=>{
  const id=`devlegacy-${Date.now()}`;
  const folder=`scenarios/${id}`,backup=`scenarios/.legacy-backups/${id}`;
  const data={};for(const name of ['scenario','countries','ownership'])data[name]=JSON.parse(await fs.readFile(`scenarios/.atomic-backups/modern/${name}.json`,'utf8'));
  data.scenario.id=id;
  const capital=Object.keys(data.ownership).find(key=>data.ownership[key]===data.countries[0].id);
  data.countries[0].capitalRegionId=capital;data.controllers={[capital]:data.countries[1].id};
  try{
    expect((await request.put(`/api/scenarios/${id}?geography=atomic-debug`,{data})).status()).toBe(200);
    const before={};for(const name of ['scenario','countries','ownership','controllers'])before[name]=await fs.readFile(`${folder}/${name}.json`,'utf8');
    const migrated=await(await request.get(`/api/scenarios/${id}?geography=atomic-debug`)).json();
    expect(migrated.scenario.version).toBe(3);expect(migrated.countries[0].legacyCapitalRegionId).toBe(capital);
    const target=migrated.countries[0].capitalRegionId;expect(migrated.ownership[target]).toBe(data.countries[0].id);expect(migrated.controllers[target]).toBe(data.countries[1].id);
    expect((await request.put(`/api/scenarios/${id}?geography=atomic-debug`,{data:migrated})).status()).toBe(200);
    for(const name of Object.keys(before))expect(await fs.readFile(`${backup}/${name}.json`,'utf8')).toBe(before[name]);
    const loaded=await(await request.get(`/api/scenarios/${id}?geography=atomic-debug`)).json();expect(JSON.stringify(loaded)).toBe(JSON.stringify(migrated));
  }finally{
    if(!/^devlegacy-\d+$/.test(id))throw new Error('Invalid cleanup ID');
    await fs.rm(folder,{recursive:true,force:true});await fs.rm(backup,{recursive:true,force:true});
  }
});
