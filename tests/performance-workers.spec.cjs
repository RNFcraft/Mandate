const {test,expect}=require('@playwright/test'),crypto=require('node:crypto');
test('browser coordinator with pooled economy keeps rendering live and matches the full reference month',async({page})=>{
  test.setTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?scenario=1700&worldEconomy=1&autonomous=1&workers=4&perf=1');await page.waitForFunction(()=>window.mandateSettlementLayer&&mandateMap.background);
  const result=await page.evaluate(async()=>{
    let frames=0,active=true;const frame=()=>{if(!active)return;frames++;requestAnimationFrame(frame);};requestAnimationFrame(frame);
    const step=mandateSimulation.step(31);mandateMap.x+=30;mandateMap.invalidate();await step;active=false;
    const state=await mandateSimulation.snapshot();return {frames,state,worker:!!mandateSimulation.worker,monitor:mandatePerf.summary()};
  });
  expect(result.worker).toBe(true);expect(result.frames).toBeGreaterThan(2);expect(result.monitor.timing.workerRoundTrip.count).toBeGreaterThan(0);
  const {loadWorldData}=require('../scripts/world-economy-data.cjs'),{Simulation}=require('../shared/simulation.cjs'),{scenario,hierarchy,adjacency}=await loadWorldData();
  const reference=new Simulation(scenario,hierarchy,{seed:1700,proceduralWorld:{adjacency}});reference.enableAutonomy();reference.step(31);
  const hash=s=>crypto.createHash('sha256').update(JSON.stringify(s)).digest('hex');expect(hash(result.state)).toBe(hash(reference.snapshot()));
  const selected=await page.evaluate(()=>{const p=mandateSettlementLayer.visible[0];mandateSettlementLayer.selectAt(p.x,p.y);return p.row.id;});await expect(page.locator('#settlement-info')).toBeVisible();await expect(page.locator('#economy-info')).toBeHidden();
  await page.locator('[data-tab="province"]').click();await expect(page.locator('#settlement-info')).toBeHidden();expect(selected).toBeTruthy();expect(errors).toEqual([]);
});
for(const dpr of [1,2])test(`Canvas fallback and raster worker preserve map colors and exact hits at DPR ${dpr}`,async({browser})=>{
  test.setTimeout(180000);const context=await browser.newContext({viewport:{width:1000,height:700},deviceScaleFactor:dpr}),page=await context.newPage();
  const capture=()=>page.evaluate(()=>{const m=mandateMap,data=m.ctx.getImageData(0,0,m.canvas.width,m.canvas.height).data,points=[];for(let y=100;y<600;y+=23)for(let x=100;x<900;x+=23){const i=(Math.floor(y*m.dpr)*m.canvas.width+Math.floor(x*m.dpr))*4;points.push({hit:m.hit(x,y),color:[...data.slice(i,i+4)]});}return points;});
  try{
    await page.goto('/?scenario=1700&raster=canvas&simulation=direct');await page.waitForFunction(()=>window.mandateMap?.background&&mandateMap.frames>0);const expected=await capture();
    await page.goto('/?scenario=1700');await page.waitForFunction(()=>window.mandateMap?.background);await page.waitForTimeout(100);const actual=await capture();
    expect(actual.map(p=>p.hit)).toEqual(expected.map(p=>p.hit));let close=0;for(let i=0;i<actual.length;i++)if(actual[i].color.every((v,k)=>Math.abs(v-expected[i].color[k])<8))close++;expect(close/actual.length).toBeGreaterThan(.98);
    const world=await page.evaluate(()=>mandateMap.screenToWorld(500,350));await page.mouse.move(500,350);await page.mouse.wheel(0,-120);await expect.poll(()=>page.evaluate(()=>mandateMap.zoom)).toBeGreaterThan(1);const after=await page.evaluate(()=>mandateMap.screenToWorld(500,350));expect(after[0]).toBeCloseTo(world[0],8);expect(after[1]).toBeCloseTo(world[1],8);
    await page.evaluate(()=>{mandateMap.disableRaster();mandateMap.invalidate();});await page.waitForFunction(()=>mandateMap.background&& !mandateMap.rasterWorker);
  }finally{await context.close();}
});
test('unavailable workers use the portable direct kernel and Canvas fallback',async({page})=>{
  await page.addInitScript(()=>{window.Worker=undefined;});await page.goto('/?scenario=1700');await page.waitForFunction(()=>window.mandateSimulation&&mandateMap.background);
  const result=await page.evaluate(()=>{mandateSimulation.step(31);return {worker:!!mandateSimulation.worker,raster:!!mandateMap.rasterWorker,date:mandateSimulation.clock.date,population:mandateSimulation.populationSummary().total};});
  expect(result).toEqual({worker:false,raster:false,date:{year:1700,month:2,day:1},population:591714189});
});
