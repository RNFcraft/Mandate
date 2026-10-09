// Opt-in repeatable benchmark, not a timing threshold in regular CI.
const {test,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path');
test('repeatable paused-map baseline with fixed viewport and DPR',async({page})=>{
  test.setTimeout(240000);const results=[];
  await page.goto('/?scenario=1700&worldEconomy=1&perf=1');await page.waitForFunction(()=>window.mandatePerf&&window.mandateSettlementLayer);await page.waitForTimeout(500);
  for(let run=0;run<3;run++)for(const action of ['idle','pan','zoom','combined','politicalOnly','economyOnly','cities','panel']){
    await page.evaluate(action=>{const m=mandateMap;m.zoom=3;m.scale=m.baseScale*m.zoom;m.x=m.width/2-180*m.scale;m.y=m.height/2-90*m.scale;m.background?.canvas.close?.();m.background=null;m.rasterTarget=null;mandateEconomyLayer.enabled=action!=='politicalOnly'&&action!=='cities';mandateSettlementLayer.enabled=action!=='politicalOnly'&&action!=='economyOnly';m.invalidate();mandatePerf.reset();},action);
    await page.waitForTimeout(250);const cold=await page.evaluate(()=>mandatePerf.summary());await page.evaluate(()=>mandatePerf.reset());
    if(action==='panel')await page.evaluate(()=>{const m=mandateMap;m.render();const p=mandateSettlementLayer.visible[0];if(p)mandateSettlementLayer.selectAt(p.x,p.y);});
    if(['pan','combined','politicalOnly','economyOnly','cities','panel'].includes(action)){await page.mouse.move(750,450);await page.mouse.down();}
    for(let i=0;i<40;i++){if(['pan','combined','politicalOnly','economyOnly','cities','panel'].includes(action))await page.mouse.move(750+Math.sin(i/8)*350,450+Math.cos(i/9)*120);if(['zoom','combined'].includes(action))await page.mouse.wheel(0,i<20?-25:25);await page.waitForTimeout(16);}
    if(['pan','combined','politicalOnly','economyOnly','cities','panel'].includes(action))await page.mouse.up();await page.waitForTimeout(250);
    results.push({run,action,cold,warm:await page.evaluate(()=>mandatePerf.summary())});
  }
  expect(results).toHaveLength(24);const filename=process.env.MANDATE_PERF_REPORT||path.join(require('node:os').tmpdir(),'mandate-render-baseline.json');await fs.writeFile(filename,JSON.stringify({viewport:[1440,900],deviceScaleFactor:1,results},null,2));console.log('Performance report:',filename);
});
test('worker simulation at 1x and maximum speed, monthly projection and save/load',async({page})=>{
  test.setTimeout(240000);await page.goto('/?scenario=1700&worldEconomy=1&autonomous=1&perf=1');await page.waitForFunction(()=>window.mandateSettlementLayer&&mandateMap.background);
  const results=[];
  for(const speed of [1,100]){
    await page.evaluate(async speed=>{await mandateSimulation.setSpeed(speed);await mandateSimulation.start();mandatePerf.reset();},speed);
    for(let i=0;i<80;i++){await page.mouse.move(500+i%20*10,400+i%10*10);await page.waitForTimeout(50);}await page.evaluate(()=>mandateSimulation.pause());
    results.push({speed,summary:await page.evaluate(()=>mandatePerf.summary()),date:await page.evaluate(()=>mandateSimulation.clock.date)});
  }
  const persistence=await page.evaluate(async()=>{mandatePerf.reset();const start=performance.now(),save=await mandateSimulation.save(),saved=performance.now();await mandateSimulation.load(save);return {saveMs:saved-start,loadMs:performance.now()-saved,saveBytes:new TextEncoder().encode(save).length,summary:mandatePerf.summary()};});
  const filename=process.env.MANDATE_PERF_SIM_REPORT||path.join(require('node:os').tmpdir(),'mandate-browser-simulation-performance.json');await fs.writeFile(filename,JSON.stringify({results,persistence},null,2));console.log('Simulation UI report:',filename);
});
