const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { neighbors } = require('topojson-client');

const hash = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
test('DEV scenario authoring, brush, history, ownership borders and disk persistence', async ({ page, request }) => {
  const id = `devtest-${Date.now()}`;
  const folder = path.resolve(__dirname, '../scenarios', id);
  const files = ['client/data/world.topo.json', 'data/map/regions/ne_10m_admin_1_states_provinces.shp', 'data/map/regions/ne_10m_admin_1_states_provinces.dbf', 'data/map/countries/ne_10m_admin_0_countries.shp', 'data/map/countries/ne_10m_admin_0_countries.dbf'];
  const hashes = await Promise.all(files.map(hash));
  const errors = []; page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('dialog', d => d.accept());
  try {
    await page.goto('/?editor=1&scenario=1700');
    await page.waitForFunction(()=>window.mandateEditor);
    await page.locator('#scenario-id').fill(id); await page.locator('#scenario-name').fill('Тестовый сценарий 1700');
    await page.locator('#new-scenario').click();
    expect(await page.evaluate(()=>mandateMap.model.countries.size)).toBe(0);
    expect(await page.evaluate(()=>[...mandateMap.model.owners.values()].every(x=>x===null))).toBe(true);
    await page.locator('summary').click();
    async function country(tag,name,color) {
      const form=page.locator('#country-form');
      await form.locator('[name=id]').fill(tag);await form.locator('[name=name]').fill(name);
      await form.locator('[name=shortName]').fill(tag);await form.locator('[name=color]').fill(color);
      await form.locator('[name=governmentType]').fill('absolute_monarchy');await form.getByRole('button').click();
    }
    await country('HFR','Королевство Франция','#b08070');
    await country('HEN','Королевство Англия','#789a83');
    await page.locator('#country-list').selectOption('HFR');
    const points = await page.evaluate(()=>{
      const m=mandateMap;
      return [[182.35,41.14],[176.3,49.58]].map(([x,y])=>{const sx=m.x+x*m.scale,sy=m.y+y*m.scale;return {x:sx,y:sy,id:m.hit(sx,sy)};});
    });
    expect(points.every(p=>p.id)).toBe(true);
    await page.mouse.move(points[1].x,points[1].y);await page.mouse.down();
    await page.mouse.move(points[0].x,points[0].y,{steps:15});await page.mouse.up();
    const painted=await page.evaluate(()=>[...mandateMap.model.owners.entries()].filter(([,owner])=>owner==='HFR').map(([id])=>id));
    expect(painted.length).toBeGreaterThan(1);
    expect(await page.evaluate(points=>points.every(p=>mandateMap.model.baseIds(p.id).every(id=>mandateMap.model.owners.get(id)==='HFR')),points)).toBe(true);
    await page.locator('#undo').click();expect(await page.evaluate(()=>[...mandateMap.model.owners.values()].every(v=>v===null))).toBe(true);
    await page.locator('#redo').click();expect(await page.evaluate(()=>[...mandateMap.model.owners.values()].filter(v=>v==='HFR').length)).toBe(painted.length);
    // Zoom into Paris and explicitly paint an adjacent polygon so transfer creates a new frontier.
    await page.mouse.move(points[0].x,points[0].y);
    for(let i=0;i<4;i++){await page.mouse.wheel(0,-500);await page.waitForTimeout(50);}
    await page.waitForFunction(()=>mandateMap.zoom>=8&&mandateMap.interactive.length===5001);
    points[0]=await page.evaluate(()=>{const m=mandateMap;const x=m.x+182.35*m.scale,y=m.y+41.14*m.scale;return {x,y,id:m.hit(x,y)};});
    const topo=require('../scripts/topology-codec.cjs').unpackTopology(JSON.parse(await fs.readFile('client/data/map-v2/provinces.topo.json','utf8')));
    const gs=topo.objects.provinces.geometries,index=gs.findIndex(g=>g.id===points[0].id),adjacent=neighbors(gs)[index].map(i=>gs[i].id);
    points[1]=await page.evaluate(ids=>{
      const m=mandateMap;
      for(let y=50;y<innerHeight-20;y+=2)for(let x=40;x<innerWidth-310;x+=2){const id=m.hit(x,y);if(ids.includes(id))return {x,y,id};}
    },adjacent);
    expect(points[1]).toBeTruthy();await page.mouse.click(points[1].x,points[1].y);
    await page.locator('#edit-mode').selectOption('capital');await page.mouse.click(points[0].x,points[0].y);
    expect(await page.evaluate(()=>mandateMap.model.countries.get('HFR').capitalRegionId)).toBe(points[0].id);
    await page.waitForFunction(()=>!mandateMap.politicalPending);
    const borders=await page.evaluate(()=>JSON.stringify(mandateMap.politicalBorders));
    await page.locator('#country-list').selectOption('HEN');await page.locator('#edit-mode').selectOption('territory');
    await page.mouse.click(points[0].x,points[0].y);
    expect(await page.evaluate(id=>mandateMap.model.owners.get(id),points[0].id)).toBe('HEN');
    expect(await page.evaluate(()=>mandateMap.model.countries.get('HFR').capitalRegionId)).toBe(null);
    await page.waitForFunction(()=>!mandateMap.politicalPending);expect(await page.evaluate(b=>JSON.stringify(mandateMap.politicalBorders)!==b,borders)).toBe(true);
    await page.locator('#undo').click();expect(await page.evaluate(()=>mandateMap.model.countries.get('HFR').capitalRegionId)).toBe(points[0].id);
    await page.waitForFunction(()=>!mandateMap.politicalPending);expect(await page.evaluate(b=>JSON.stringify(mandateMap.politicalBorders)===b,borders)).toBe(true);
    await page.locator('#redo').click();
    await page.locator('#edit-mode').selectOption('capital');await page.mouse.click(points[0].x,points[0].y);
    await page.locator('#edit-mode').selectOption('erase');await page.mouse.click(points[1].x,points[1].y);
    expect(await page.evaluate(id=>mandateMap.model.owners.get(id),points[1].id)).toBe(null);
    await page.locator('#undo').click();
    // Selection highlight is independent; inspect the owner's actual paint color.
    await page.evaluate(()=>{mandateMap.selectedId=null;mandateMap.hoveredId=null;mandateMap.render();});
    const rgb=await page.evaluate(p=>{const m=mandateMap;return [...m.ctx.getImageData(Math.floor(p.x*m.canvas.width/m.width),Math.floor(p.y*m.canvas.height/m.height),1,1).data];},points[0]);
    expect(rgb.slice(0,3)).toEqual([120,154,131]);
    await page.locator('#save-scenario').click();await expect(page.locator('#status')).toContainText(`Сохранено: scenarios/${id}/`);
    const data=await (await request.get(`/api/scenarios/${id}`)).json();
    expect(data.scenario.year).toBe(1700);expect(data.countries.find(c=>c.id==='HEN').capitalRegionId).toBe(points[0].id);
    expect(JSON.parse(await fs.readFile(path.join(folder,'ownership.json'),'utf8'))).toEqual(data.ownership);
    // Invalid ownership must be rejected without touching the saved scenario.
    const invalid=structuredClone(data);invalid.ownership[points[0].id]='MISSING';
    expect((await request.put(`/api/scenarios/${id}`,{data:invalid})).status()).toBe(400);
    expect((await (await request.get(`/api/scenarios/${id}`)).json()).ownership).toEqual(data.ownership);
    await page.reload();await page.waitForFunction(()=>window.mandateEditor);
    await page.locator('#scenario-list').selectOption(id);await page.locator('#load-scenario').click();await expect(page.locator('#status')).toHaveText('Сценарий загружен.');
    expect(await page.evaluate(()=>mandateMap.model.exportScenario())).toEqual(data);
    await page.mouse.move(500,400);const anchor=await page.evaluate(()=>mandateMap.screenToWorld(500,400));await page.mouse.wheel(0,-400);
    await expect.poll(()=>page.evaluate(()=>mandateMap.zoom)).toBeGreaterThan(1);
    expect((await page.evaluate(()=>mandateMap.screenToWorld(500,400)))[0]).toBeCloseTo(anchor[0],8);
    const x=await page.evaluate(()=>mandateMap.x);await page.mouse.down({button:'right'});await page.mouse.move(560,400,{steps:4});await page.mouse.up({button:'right'});
    expect(await page.evaluate(()=>mandateMap.x)).toBeCloseTo(x+60,8);
    await page.screenshot({path:'test-results/scenario-editor.png'});
    await page.goto(`/?scenario=${id}`);await page.waitForFunction(()=>window.mandateMap?.frames>0);
    await expect(page.locator('.dev-panel')).toHaveCount(0);expect(await page.evaluate(()=>mandateMap.model.exportScenario())).toEqual(data);
    // Start and stop a separate server twice against the same files: no browser or process state is needed.
    for(let i=0;i<2;i++) {
      const child=spawn(process.execPath,['scripts/serve-map.cjs'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:'3017'},windowsHide:true,stdio:'pipe'});
      try {
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timeout')),10000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('error',reject);});
        const response=await fetch(`http://127.0.0.1:3017/api/scenarios/${id}`);expect(await response.json()).toEqual(data);
      } finally { child.kill();await new Promise(resolve=>child.once('exit',resolve)); }
    }
    expect(await Promise.all(files.map(hash))).toEqual(hashes);expect(errors).toEqual([]);
  } finally {
    // Remove only this test's uniquely named scenario, never user-authored folders.
    if(path.dirname(folder)!==path.resolve(__dirname,'../scenarios')||!path.basename(folder).startsWith('devtest-'))throw new Error('Unsafe cleanup path');
    await fs.rm(folder,{recursive:true,force:true});
  }
});
