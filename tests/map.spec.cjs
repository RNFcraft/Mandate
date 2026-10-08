const { test, expect } = require('@playwright/test');
test('world geometry, interaction, resize and ownership', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.waitForFunction(() => window.mandateMap?.frames > 0);
  expect(await page.evaluate(() => ({ countries: mandateMap.model.countries.size, regions: mandateMap.model.adm1.size }))).toEqual({ countries: 258, regions: 0 });
  expect(await page.evaluate(()=>mandateMap.model.territories.size)).toBe(5001);
  // Central Pacific must remain ocean, including after spherical projection.
  expect(await page.evaluate(() => {
    const m=mandateMap, x=(m.x+40*m.scale)*m.canvas.width/m.width, y=(m.y+90*m.scale)*m.canvas.height/m.height;
    return [...m.ctx.getImageData(Math.floor(x),Math.floor(y),1,1).data];
  })).toEqual([24,44,57,255]);
  // Paris is inside an Admin 1 region. Use geographic position, not a mocked hit.
  const paris = await page.evaluate(() => ({ x: mandateMap.x+182.35*mandateMap.scale, y: mandateMap.y+41.14*mandateMap.scale }));
  await page.mouse.move(paris.x, paris.y);
  await expect.poll(() => page.evaluate(() => mandateMap.hoveredId)).toBeTruthy();
  const first = await page.evaluate(() => mandateMap.hoveredId);
  await page.mouse.click(paris.x, paris.y);
  expect(await page.evaluate(() => mandateMap.selectedId)).toBe(first);
  await page.mouse.move(10, 10);
  expect(await page.evaluate(() => mandateMap.selectedId)).toBe(first);
  const cursor = { x: 800, y: 400 };
  await page.mouse.move(cursor.x, cursor.y);
  const before = await page.evaluate(p => mandateMap.screenToWorld(p.x,p.y), cursor);
  await page.mouse.wheel(0,-500);
  await expect.poll(() => page.evaluate(() => mandateMap.zoom)).toBeGreaterThan(1);
  const after = await page.evaluate(p => mandateMap.screenToWorld(p.x,p.y), cursor);
  expect(after[0]).toBeCloseTo(before[0], 8); expect(after[1]).toBeCloseTo(before[1],8);
  const old = await page.evaluate(() => ({x:mandateMap.x,y:mandateMap.y,selected:mandateMap.selectedId}));
  await page.mouse.move(700,500); await page.mouse.down(); await page.mouse.move(780,540,{steps:5}); await page.mouse.up();
  const moved = await page.evaluate(() => ({x:mandateMap.x,y:mandateMap.y,selected:mandateMap.selectedId}));
  expect(moved.x-old.x).toBeCloseTo(80);expect(moved.y-old.y).toBeCloseTo(40);expect(moved.selected).toBe(old.selected);
  const center = await page.evaluate(() => mandateMap.screenToWorld(innerWidth/2, innerHeight/2));
  await page.setViewportSize({width:1000,height:700});
  await expect.poll(() => page.evaluate(() => mandateMap.width)).toBe(1000);
  const resized = await page.evaluate(() => ({ center:mandateMap.screenToWorld(innerWidth/2,innerHeight/2), canvas:[mandateMap.canvas.width,mandateMap.canvas.height] }));
  expect(resized.center[0]).toBeCloseTo(center[0],8);expect(resized.center[1]).toBeCloseTo(center[1],8);expect(resized.canvas).toEqual([1000,700]);
  // Change selection through an actual click on the visible geometry of another region.
  const another = await page.evaluate(first => {
    const m=mandateMap;
    for(let y=30;y<innerHeight;y+=8)for(let x=30;x<innerWidth;x+=8){const id=m.hit(x,y);if(id&&id!==first)return {x,y,id};}
  },first);
  expect(another).toBeTruthy();await page.mouse.click(another.x,another.y);
  expect(await page.evaluate(() => mandateMap.selectedId)).toBe(another.id);
  const transfer = await page.evaluate(id => {
    const m=mandateMap, old=m.model.ownerOf(id), target=[...m.model.countries.keys()].find(c=>c!==old);
    m.model.setOwner(id,target);
    const result={owner:m.model.ownerOf(id),target,borders:!!m.ownershipBorders};
    m.model.setOwner(id,old);return result;
  },first);
  expect(transfer.owner).toBe(transfer.target);expect(transfer.borders).toBe(true);
  await page.evaluate(()=>{for(let i=0;i<20;i++)mandateMap.canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:-10000,clientX:500,clientY:350,cancelable:true}));});
  expect(await page.evaluate(()=>mandateMap.zoom)).toBe(64);
  await page.evaluate(()=>{for(let i=0;i<20;i++)mandateMap.canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:10000,clientX:500,clientY:350,cancelable:true}));});
  expect(await page.evaluate(()=>mandateMap.zoom)).toBe(1);
  await page.evaluate(()=>{const m=mandateMap;m.selectedId=null;m.hoveredId=null;m.zoom=1;m.resize();m.x=(m.width-360*m.scale)/2;m.y=(m.height-180*m.scale)/2;m.invalidate();});
  await page.waitForTimeout(100);
  await page.screenshot({path:'test-results/world-map.png'});
  const timing = await page.evaluate(() => {
    const times=[];for(let i=0;i<10;i++){mandateMap.render();times.push(mandateMap.lastRenderMs);}return times.sort((a,b)=>a-b)[5];
  });
  console.log(`World map median render: ${timing.toFixed(1)} ms`);
  expect(timing).toBeLessThan(150);
  expect(errors).toEqual([]);
});
