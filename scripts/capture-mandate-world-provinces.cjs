// Real normal/explicit-preview browser screenshots, never changes scenario data.
const fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright');
const VIEWS={world:[0,0,1],europe:[12,49,9],hre:[10,51,17],italy:[12.5,43,20],balkans:[23,43,15],baltic:[25,57,13],scandinavia:[17,64,8],british_isles:[-4,55,14],iberia:[-4,40,13],russia:[65,57,5],ukraine_crimea:[34,47,15],caucasus:[43,43,18],middle_east:[44,30,8],india:[80,23,8],bengal:[89,25,18],china:[105,35,5],tibet_dzungaria:[86,36,9],japan:[138,36,16],central_asia:[64,42,9],southeast_asia:[112,7,7],indonesia:[119,-4,9],philippines:[122,12,14],north_america:[-105,43,4],caribbean:[-70,18,12],mexico:[-100,22,8],south_america:[-63,-18,4],africa:[20,3,4],north_africa:[15,29,7],west_africa:[0,11,9],horn_africa:[43,7,10],southern_africa:[25,-26,8],oceania:[148,-24,4]};
async function capture({preview=false,port=3000,output='data/generated/political-geography/1700/mandate-world-v1/screenshots'}={}){
  await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({channel:'chrome'}),context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:2}),page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  try{await page.goto(`http://127.0.0.1:${port}/?scenario=1700${preview?'&politicalPreview=mandate-world-v1':''}`);await page.waitForFunction(()=>window.mandateSimulation&&mandateMap.frames>0);
    const runtime=await page.evaluate(()=>({geography:mandateSimulation.snapshot().geography,polities:mandateSimulation.countries.size,provinces:mandateSimulation.ownership.size,population:mandateSimulation.populationSummary().total,capitals:[...mandateSimulation.countries].filter(([,c])=>c.capitalRegionId).length}));
    for(const [name,[lon,lat,zoom]]of Object.entries(VIEWS)){
      await page.evaluate(({lon,lat,zoom})=>{const m=mandateMap;m.zoom=zoom;m.scale=m.baseScale*zoom;m.x=m.width/2-(lon+180)*m.scale;m.y=m.height/2-(90-lat)*m.scale;m.selectedId=null;m.hoveredId=null;m.background=null;m.invalidate();},{lon,lat,zoom});await page.waitForTimeout(180);await page.screenshot({path:path.join(output,name+'.png')});
    }
    if(errors.length||requests.some(u=>/\/data\/adm2\/|\/api\/political/.test(u)))throw Error('Browser/atomic network failure: '+JSON.stringify(errors));
    const report={url:page.url(),runtime,errors,requests,views:Object.keys(VIEWS)};await fs.writeFile(path.join(output,'browser-smoke.json'),JSON.stringify(report,null,2));return report;
  }finally{await browser.close();}
}
module.exports={capture,VIEWS};if(require.main===module)capture({preview:process.argv.includes('--preview')}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1;});
