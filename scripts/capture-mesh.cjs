const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('@playwright/test');
const cases=[['central-asia',65,51],['central-europe',15,50],['balkans',21,43],['italy',11,44],['usa-canada',-90,47],['norway',9,62],['russia',40,55],['romania',25,46]];
async function main(){
  const phase=process.argv[2]||'after',folder=`data/processed/canonical-baseline/screenshots/${phase}`;
  await fs.mkdir(folder,{recursive:true});
  const browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:3000/?scenario=1700');await page.waitForFunction(()=>window.mandateMap);
  for(const [name,lon,lat]of cases)for(const zoom of [4,16]){
    await page.evaluate(({lon,lat,zoom})=>{const m=mandateMap;m.zoom=zoom;m.scale=m.baseScale*zoom;m.x=m.width/2-(lon+180)*m.scale;m.y=m.height/2-(90-lat)*m.scale;m.invalidate();},{lon,lat,zoom});
    await page.waitForFunction(()=>mandateMap.lod.pending.size===0&&mandateMap.lod.active.length===mandateMap.lod.needed.size);
    await page.screenshot({path:path.join(folder,`${name}-${zoom}.png`)});
  }
  await fs.writeFile(path.join(folder,'errors.json'),JSON.stringify(errors));await browser.close();if(errors.length)throw new Error(errors.join('\n'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
