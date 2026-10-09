const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path');
const {writeDemo}=require('../scripts/economy-visual-demo.cjs');
const demo='/?scenario=economy-visual-demo&economyDemo=1';
test.beforeAll(async()=>{await writeDemo();});
async function ready(page,url=demo){await page.goto(url);await page.waitForFunction(()=>window.mandateEconomyLayer&&mandateMap.frames>0);if(url===demo)await page.waitForFunction(()=>mandateEconomyLayer.objects.filter(o=>o.image).every(o=>o.image.status!=='loading')&&mandateEconomyLayer.drawnMarkers+mandateEconomyLayer.drawnSprites>0);}
async function itemPoint(page,key){return page.evaluate(key=>{const l=mandateEconomyLayer,item=l.buildLayout().find(i=>i.objects.some(o=>o.key===key));if(!item)throw Error('Missing visual '+key);return {x:item.x,y:item.y};},key);}
async function select(page,key){const point=await itemPoint(page,key);await page.mouse.click(point.x,point.y);const button=page.locator('.economy-group button').filter({hasText:key.split(':')[1]});if(await button.count())await button.click();}

test('all sprite URLs have matching magic bytes, MIME and decoded image format',async({request,page})=>{
  const mapping=JSON.parse(await fs.readFile('client/map/economy-visuals.json'));
  for(const url of [...Object.values(mapping.sprites),...Object.values(mapping.settlements)]){
    const response=await request.get(url);expect(response.status()).toBe(200);const bytes=await response.body();
    const jpeg=url.endsWith('.jpg');expect(response.headers()['content-type']).toBe(jpeg?'image/jpeg':'image/png');
    expect([...bytes.subarray(0,jpeg?3:8)]).toEqual(jpeg?[255,216,255]:[137,80,78,71,13,10,26,10]);
  }
  await ready(page);
  await expect.poll(()=>page.evaluate(()=>mandateEconomyLayer.objects.filter(o=>o.image).every(o=>o.image.status==='ready'))).toBe(true);
  expect(await page.evaluate(()=>mandateEconomyLayer.drawnSprites)).toBeGreaterThan(0);
});

test('synthetic objects use stable interior anchors; close layout groups collisions and selects actual records',async({page})=>{
  await ready(page);
  const before=await page.evaluate(()=>{
    const l=mandateEconomyLayer,m=mandateMap,c=m.ctx;c.save();c.resetTransform();
    const result={points:l.objects.map(o=>[o.key,o.provinceId,o.point]),inside:l.objects.every(o=>c.isPointInPath(l.regions.get(o.provinceId).path,...o.point,'evenodd')),count:l.objects.length,enterprises:mandateSimulation.economySummary().enterprises.length,
      noOverlap:l.buildLayout().every((a,i,items)=>items.slice(i+1).every(b=>Math.abs(a.x-b.x)>=48||Math.abs(a.y-b.y)>=48)),sprites:l.drawnSprites};c.restore();return result;
  });
  expect(before.inside).toBe(true);expect(before.noOverlap).toBe(true);expect(before.count).toBe(before.enterprises+2);expect(before.sprites).toBeGreaterThan(0);
  await page.reload();await page.waitForFunction(()=>window.mandateEconomyLayer&&mandateMap.frames>0);
  expect(await page.evaluate(()=>mandateEconomyLayer.objects.map(o=>[o.key,o.provinceId,o.point]))).toEqual(before.points);
  const selectedBefore=await page.evaluate(()=>mandateMap.selectedId);await select(page,'enterprise:demo-farm');
  await expect(page.locator('#economy-info')).toBeVisible();await expect(page.locator('#economy-info>strong')).toHaveText('demo-farm');
  expect(await page.evaluate(()=>mandateMap.selectedId)).toBe(selectedBefore);
  await expect(page.locator('[data-field="Capacity (batches)"]')).toHaveText('2');await expect(page.locator('[data-field="Revenue"]')).toHaveText('0');
  await page.screenshot({path:'tmp/economy-visuals-close.png'});
});

test('monthly panel update preserves politics and anchor cache; save/load restores visuals and toggle leaves state untouched',async({page})=>{
  await ready(page);await select(page,'enterprise:demo-farm');
  const values=await page.evaluate(async()=>{
    const m=mandateMap,l=mandateEconomyLayer,revision=m.model.revision,generation=m.politicalGeneration,borders=m.ownershipBorders,background=m.background,anchors=l.anchors.get('province:00001');
    await mandateSimulation.step(31);await new Promise(requestAnimationFrame);
    return {revision:m.model.revision===revision,generation:m.politicalGeneration===generation,borders:m.ownershipBorders===borders,background:m.background===background,anchors:l.anchors.get('province:00001')===anchors,record:mandateSimulation.economySummary().enterprises.find(e=>e.id==='demo-farm')};
  });
  for(const key of ['revision','generation','borders','background','anchors'])expect(values[key]).toBe(true);
  await expect(page.locator('[data-field="Revenue"]')).toHaveText(String(values.record.stats.revenue));await expect(page.locator('[data-field="Profit/loss"]')).toHaveText(String(values.record.stats.profit));await expect(page.locator('[data-field="Completed months"]')).toHaveText('1');
  const serialized=await page.evaluate(()=>mandateSimulation.serialize());await page.locator('#economy-toggle').click();
  expect(await page.evaluate(()=>mandateEconomyLayer.buildLayout().length)).toBe(0);expect(await page.evaluate(()=>mandateSimulation.serialize())).toBe(serialized);
  await page.locator('#economy-toggle').click();expect(await page.evaluate(()=>mandateSimulation.serialize())).toBe(serialized);
  const loaded=await page.evaluate(async()=>{const saved=JSON.parse(await mandateSimulation.serialize()),points=mandateEconomyLayer.objects.map(o=>[o.key,o.point]);await mandateSimulation.step(28);await mandateSimulation.load(saved);return {points,after:mandateEconomyLayer.objects.map(o=>[o.key,o.point]),months:mandateEconomyLayer.state.stats.monthsProcessed};});
  expect(loaded.after).toEqual(loaded.points);expect(loaded.months).toBe(1);
  await select(page,'market:market-local');const market=await page.evaluate(()=>mandateSimulation.economySummary().markets.find(m=>m.id==='market-local'));
  await expect(page.locator('[data-field="food price"]')).toHaveText(String(market.goods[0].priceMinor));await expect(page.locator('[data-field="food supply"]')).toHaveText(String(market.goods[0].stats.supply));
});

test('far and medium LOD, viewport filtering and mouse pan/zoom remain usable',async({page})=>{
  await ready(page);await page.evaluate(()=>{const m=mandateMap;m.zoom=1;m.resize();m.invalidate();});
  await expect.poll(()=>page.evaluate(()=>mandateEconomyLayer.level)).toBe('far');expect(await page.evaluate(()=>mandateEconomyLayer.buildLayout().length)).toBe(0);
  await page.evaluate(()=>{const m=mandateMap,l=mandateEconomyLayer,p=l.objects[0].point;m.zoom=6;m.scale=m.baseScale*m.zoom;m.x=m.width/2-p[0]*m.scale;m.y=m.height/2-p[1]*m.scale;m.invalidate();});
  await expect.poll(()=>page.evaluate(()=>mandateEconomyLayer.drawnSprites)).toBe(0);await expect.poll(()=>page.evaluate(()=>mandateEconomyLayer.drawnMarkers)).toBeGreaterThan(0);
  const old=await page.evaluate(()=>({x:mandateMap.x,zoom:mandateMap.zoom}));await page.mouse.move(700,450);await page.mouse.down();await page.mouse.move(780,490,{steps:5});await page.mouse.up();
  expect(await page.evaluate(()=>mandateMap.x)).toBeCloseTo(old.x+80);await page.mouse.wheel(0,-350);await expect.poll(()=>page.evaluate(()=>mandateMap.zoom)).toBeGreaterThan(old.zoom);
  await page.evaluate(()=>{mandateMap.x=100000;mandateMap.invalidate();});expect(await page.evaluate(()=>mandateEconomyLayer.buildLayout().length)).toBe(0);
});

test('missing assets use neutral markers and unknown recipes do not fail; no economy means no objects',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/sprites/*',route=>route.fulfill({status:404,body:''}));await ready(page);
  await expect.poll(()=>page.evaluate(()=>mandateEconomyLayer.objects.filter(o=>o.image).every(o=>o.image.status==='failed'))).toBe(true);
  expect(await page.evaluate(()=>mandateEconomyLayer.objects.find(o=>o.id==='demo-unknown').sprite)).toBeNull();expect(await page.evaluate(()=>mandateEconomyLayer.drawnSprites)).toBe(0);expect(errors).toEqual([]);
  await ready(page,'/?scenario=1700');expect(await page.evaluate(()=>mandateEconomyLayer.objects.length)).toBe(0);await expect(page.locator('#economy-toggle')).toBeHidden();
  await page.goto('/?scenario=1700&editor=1');await page.waitForFunction(()=>window.mandateEditor&&mandateMap.frames>0);expect(await page.evaluate(()=>!!mandateMap.editorGesture)).toBe(true);expect(await page.evaluate(()=>window.mandateEconomyLayer)).toBeUndefined();
});

test('scanline anchors stay inside concave, holed, disconnected and thin projected polygons',async({page})=>{
  await ready(page);
  const source=require('esbuild').buildSync({stdin:{contents:"import {prepare,interiorAnchors} from './client/map/geometry.js';window.testGeometry={prepare,interiorAnchors};",resolveDir:process.cwd()},bundle:true,write:false,format:'iife'}).outputFiles[0].text;
  await page.addScriptTag({content:source});
  const results=await page.evaluate(()=>{
    const shapes=[{type:'Polygon',coordinates:[[[0,0],[0,10],[3,10],[3,3],[10,3],[10,0],[0,0]]]},{type:'Polygon',coordinates:[[[20,0],[20,10],[30,10],[30,0],[20,0]],[[22,2],[28,2],[28,8],[22,8],[22,2]]]},{type:'MultiPolygon',coordinates:[[[[40,0],[40,2],[42,2],[42,0],[40,0]]],[[[50,0],[50,1],[51,1],[51,0],[50,0]]]]},{type:'Polygon',coordinates:[[[60,0],[60,0.01],[70,0.01],[70,0],[60,0]]]},{type:'Polygon',coordinates:[[[179,0],[179,2],[-179,2],[-179,0],[179,0]]]}];
    const ctx=mandateMap.ctx;ctx.save();ctx.resetTransform();const results=shapes.map((geometry,i)=>{const r=testGeometry.prepare({type:'Feature',id:'shape-'+i,geometry}),points=testGeometry.interiorAnchors(r);return {count:points.length,inside:points.every(p=>ctx.isPointInPath(r.path,...p,'evenodd')),stable:JSON.stringify(points)===JSON.stringify(testGeometry.interiorAnchors(r))};});ctx.restore();return results;
  });
  for(const result of results){expect(result.count).toBeGreaterThan(0);expect(result.inside).toBe(true);expect(result.stable).toBe(true);}
});

test('dense records group within the render cap, reuse images and react to additions and removals',async({page})=>{
  const requests=[];page.on('request',r=>{if(r.url().includes('/sprites/'))requests.push(r.url());});await ready(page);
  const countBefore=requests.length;
  const result=await page.evaluate(async()=>{
    const s=await mandateSimulation.snapshot(),template=s.systems.economy.enterprises[0];
    for(let i=0;i<500;i++)s.systems.economy.enterprises.push({...structuredClone(template),id:'dense-'+i});
    await mandateSimulation.load(s);await new Promise(requestAnimationFrame);
    const l=mandateEconomyLayer,items=l.buildLayout(),result={count:l.objects.length,drawn:items.length,cap:l.maxVisible,grouped:items.some(i=>i.objects.length>1),keys:new Set(items.flatMap(i=>i.objects.map(o=>o.key))).size};
    s.systems.economy.enterprises=s.systems.economy.enterprises.filter(e=>!e.id.startsWith('dense-'));await mandateSimulation.load(s);result.after=l.objects.length;return result;
  });
  expect(result.count).toBe(509);expect(result.drawn).toBeLessThanOrEqual(result.cap);expect(result.grouped).toBe(true);expect(result.keys).toBe(result.count);expect(result.after).toBe(9);expect(requests.length).toBe(countBefore);
});
