// Synthetic records only. No historical economy or new production systems.
const fs=require('node:fs/promises'),path=require('node:path');
const fixture=require('../tests/fixtures/economy.cjs');
const id='economy-visual-demo';
function buildDemo(hierarchy){
  const scenario=structuredClone(fixture.scenario),e=scenario.economy;
  scenario.scenario={...scenario.scenario,id,name:'Synthetic Economy Visuals demo (not historical)'};
  scenario.ownership=Object.fromEntries(hierarchy.territories.map(t=>[t.id,['province:00001','province:00002'].includes(t.id)?'A':null]));
  e.households[0].cashMinor=10000;e.households.push({...structuredClone(e.households[0]),id:'household-second',provinceId:'province:00002'});
  e.markets.push({...structuredClone(e.markets[0]),id:'market-second',provinceIds:['province:00002']});
  scenario.population.cohorts.push({...structuredClone(scenario.population.cohorts[0]),id:'pop-second',territoryId:'province:00002'});
  const sprites=['farm','mill','manufacture','mine','wood','unknown'],template=structuredClone(e.enterprises[0]);
  e.recipes=[];e.enterprises=[];const recipeSprites={};
  for(let i=0;i<sprites.length;i++){
    const type=sprites[i],recipeId='synthetic-'+type;
    e.recipes.push({id:recipeId,inputs:[],output:{goodId:'food',quantity:5},workersPerBatch:1});
    if(type!=='unknown')recipeSprites[recipeId]=type;
    e.enterprises.push({...structuredClone(template),id:'demo-'+type,recipeId,capacityBatches:2,wagePerWorkerMinor:5,cashMinor:1000,inventories:[{goodId:'food',quantity:10,bookValueMinor:50}]});
  }
  e.enterprises.push({...structuredClone(e.enterprises[0]),id:'demo-second-farm',provinceId:'province:00002',ownerRef:{kind:'household',id:'household-second'}});
  return {scenario,presentation:{recipeSprites}};
}
async function writeDemo(){
  const hierarchy=JSON.parse(await fs.readFile(path.resolve(__dirname,'../client/data/map-v2/hierarchy.json'))),{scenario,presentation}=buildDemo(hierarchy);
  require('../shared/simulation.cjs').initializeGameState(scenario,hierarchy);
  const folder=path.resolve(__dirname,'../scenarios',id);await fs.mkdir(folder,{recursive:true});
  for(const key of ['scenario','countries','ownership','population','economy'])await fs.writeFile(path.join(folder,key+'.json'),JSON.stringify(scenario[key],null,2)+'\n');
  await fs.writeFile(path.join(folder,'economy-visuals.json'),JSON.stringify(presentation,null,2)+'\n');
  console.log('Synthetic demo: http://127.0.0.1:3000/?scenario=economy-visual-demo&economyDemo=1');
}
if(require.main===module)writeDemo().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={buildDemo,writeDemo,id};
