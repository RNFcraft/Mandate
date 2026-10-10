const fs=require('node:fs/promises'),path=require('node:path'),{performance}=require('node:perf_hooks');
const {Simulation,ordinal,validateGameState}=require('../shared/simulation.cjs');
const {generateWorld}=require('../shared/world-economy.cjs');
const {makeSave,validateSave}=require('../shared/save.cjs');
const {loadWorldData}=require('./world-economy-data.cjs');
function options(args){
  const result={seed:1700,months:12,workers:0,foodFeedback:null,province:null,benchmark:false,save:null,load:null,autonomous:false,enableAutonomy:false,enableTrade:false,summaryEvery:12,checkpointEvery:0,checkpointDir:null,stats:null};
  const flags={'--benchmark':'benchmark','--trade':'enableTrade','--autonomous':'autonomous','--enable-autonomy':'enableAutonomy'},values={'--food-feedback':'foodFeedback','--workers':'workers','--seed':'seed','--months':'months','--province':'province','--save':'save','--load':'load','--summary-every':'summaryEvery','--checkpoint-every':'checkpointEvery','--checkpoint-dir':'checkpointDir','--stats':'stats'};
  for(let i=0;i<args.length;i++){const key=args[i];if(flags[key]){result[flags[key]]=true;continue;}if(!values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Unknown/missing option: '+key);const field=values[key],value=args[++i];result[field]=['seed','months','summaryEvery','checkpointEvery'].includes(field)?Number(value):value;}
  if(!Number.isInteger(result.seed)||result.seed<0||result.seed>0xffffffff||!Number.isInteger(result.months)||result.months<0||result.months>6000||!Number.isInteger(result.summaryEvery)||result.summaryEvery<1||!Number.isInteger(result.checkpointEvery)||result.checkpointEvery<0||result.checkpointEvery&&!result.checkpointDir)throw Error('Invalid seed/months/intervals');
  if(result.workers==='auto')result.workers=0;else result.workers=Number(result.workers);if(!Number.isInteger(result.workers)||result.workers<0||result.workers>8)throw Error('Invalid workers');
  if(result.foodFeedback!==null&&!['on','off'].includes(result.foodFeedback))throw Error('Invalid food feedback; use on/off');
  if(result.province&&!/^province:\d{5}$/.test(result.province))throw Error('Invalid province');
  if(result.enableAutonomy&&!result.load||result.autonomous&&result.load)throw Error('Use --enable-autonomy explicitly to upgrade a loaded legacy campaign');return result;
}
function outputPath(filename){
  const target=path.resolve(filename),roots=['scenarios','client','shared','scripts','tests','ROADMAP','docs'].map(v=>path.resolve(__dirname,'..',v).toLowerCase());
  if(roots.some(root=>target.toLowerCase()===root||target.toLowerCase().startsWith(root+path.sep)))throw Error('Refusing to write into source assets');return target;
}
async function atomicWrite(filename,text){
  const target=outputPath(filename);let ancestor=path.dirname(target),suffix=[];
  for(;;){try{outputPath(path.join(await fs.realpath(ancestor),...suffix,path.basename(target)));break;}catch(error){if(error.code!=='ENOENT')throw error;suffix.unshift(path.basename(ancestor));ancestor=path.dirname(ancestor);}}
  await fs.mkdir(path.dirname(target),{recursive:true});const temporary=target+'.tmp-'+process.pid;let handle,created=false;
  try{handle=await fs.open(temporary,'wx');created=true;await handle.writeFile(text);await handle.sync();await handle.close();handle=null;await fs.link(temporary,target);}
  finally{if(handle)await handle.close();if(created)await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}return target;
}
async function checkpoint(s,filename){return atomicWrite(filename,JSON.stringify(makeSave(JSON.parse(s.serialize()))));}
async function main(args){
  const settings=options(args),{scenario,hierarchy,adjacency}=await loadWorldData(),times={};let start=performance.now(),s;
  if(settings.save)outputPath(settings.save);if(settings.stats)outputPath(settings.stats);if(settings.checkpointDir)outputPath(path.join(settings.checkpointDir,'world.json'));
  if(settings.load){s=new Simulation(scenario,hierarchy,{landAdjacency:adjacency});const save=JSON.parse(await fs.readFile(settings.load,'utf8'));validateSave(save,hierarchy);s.load(save.state);if(settings.enableAutonomy)s.enableAutonomy();}
  else{const generated=generateWorld(scenario,hierarchy,adjacency,settings.seed);times.generationMs=performance.now()-start;start=performance.now();s=new Simulation({...scenario,...generated},hierarchy,{seed:settings.seed,landAdjacency:adjacency});if(settings.autonomous)s.enableAutonomy();times.initializationMs=performance.now()-start;}
  if(settings.enableTrade&&!s.snapshot().systems.economy?.trade)s.enableTrade();
  if(settings.foodFeedback!==null)s.configureFoodFeedback(settings.foodFeedback==='on');
  const pool=settings.workers?new (require('../shared/economy-pool.cjs').EconomyPool)({size:settings.workers,createWorker:()=>new (require('node:worker_threads').Worker)(path.join(__dirname,'economy-worker.cjs'))}):null;
  try{
  let report=s.economicReport(settings.province||undefined);const profiler=settings.benchmark?require('./economy-profile.cjs').profile():null;console.log('SYNTHETIC CAMPAIGN: not a historical reconstruction.');console.log(JSON.stringify({date:report.date,population:report.population,enterprises:report.enterprises,cash:report.cash,...times}));
  if(settings.province){if(!hierarchy.territories.some(t=>t.id===settings.province))throw Error('Unknown province');console.table(s.settlementSummary(settings.province));}
  const samples=[],annual=[],totals={opened:0,closed:0,reactivated:0,expanded:0,contracted:0,investment:0,maintenance:0};let annualFlows={wages:0,revenue:0,profit:0,payout:0,tradeQuantity:0,freight:0,household:{naturalFoodProduced:0,naturalFoodConsumed:0,marketFoodConsumed:0,householdIncome:0,ownerIncome:0,householdSalesIncome:0,householdWorkers:0,transportWorkers:0,investmentsCompletedValue:0},produced:{},purchased:{},capitalAdded:{},capitalRetired:{},inUseRetired:{}};const initialCash=report.cash;let peakHeap=process.memoryUsage().heapUsed;const wallStart=performance.now(),cpuStart=process.cpuUsage();let peakRss=process.memoryUsage().rss;
  for(let i=0;i<settings.months;i++){
    const d=s.clock.date,next={year:d.year+(d.month===12?1:0),month:d.month===12?1:d.month+1,day:1};start=performance.now();await s.stepAsync(ordinal(next)-ordinal(d),pool);samples.push(performance.now()-start);
    start=performance.now();report=s.economicReport(settings.province||undefined);times.analyticsMs=(times.analyticsMs||0)+performance.now()-start;if(report.cash!==initialCash)throw Error('Money conservation failed');
    for(const key of Object.keys(totals))totals[key]+=report.events[key]||0;for(const key of ['wages','revenue','profit','payout'])annualFlows[key]+=report[key];annualFlows.tradeQuantity+=report.trade.quantity;annualFlows.freight+=report.trade.freight;for(const key of Object.keys(annualFlows.household))annualFlows.household[key]+=report[key];
    for(const [id,g]of Object.entries(report.goods)){annualFlows.produced[id]=(annualFlows.produced[id]||0)+g.produced;annualFlows.purchased[id]=(annualFlows.purchased[id]||0)+g.householdPurchased;for(const flow of ['capitalAdded','capitalRetired','inUseRetired'])annualFlows[flow][id]=(annualFlows[flow][id]||0)+(g[flow]||0);}
    if((i+1)%12===0||i+1===settings.months){annual.push({...report,annualFlows,eventsTotal:{...totals}});annualFlows={wages:0,revenue:0,profit:0,payout:0,tradeQuantity:0,freight:0,household:{naturalFoodProduced:0,naturalFoodConsumed:0,marketFoodConsumed:0,householdIncome:0,ownerIncome:0,householdSalesIncome:0,householdWorkers:0,transportWorkers:0,investmentsCompletedValue:0},produced:{},purchased:{},capitalAdded:{},capitalRetired:{},inUseRetired:{}};}
    if((i+1)%settings.summaryEvery===0||i+1===settings.months)console.log(`${report.date.year}-${String(report.date.month).padStart(2,'0')}: population=${report.population} urban=${report.urban} active=${report.active} dormant=${report.dormant} firms=${report.enterprises} food=${report.goods.food.produced} clothingBought=${report.goods.clothing.householdPurchased} capital=${report.capitalQuantity} cash=${report.cash} foodNeed=${report.goods.food.need} foodAffordable=${report.goods.food.affordableDemand} foodBought=${report.goods.food.householdPurchased} foodUnpaid=${report.goods.food.unaffordable} foodRationed=${report.goods.food.rationedDemand} wages=${report.wages} payout=${report.payout} householdCash=${report.householdCash} enterpriseCash=${report.enterpriseCash} naturalFood=${report.naturalFoodConsumed} householdWorkers=${report.householdWorkers} cargo=${report.cargoQuantity} imports=${report.trade.quantity} freight=${report.trade.freight}`);
    if(settings.province&&((i+1)%settings.summaryEvery===0||i+1===settings.months))console.log('REGION:',JSON.stringify(report.diagnostics.region));
    if(settings.checkpointEvery&&(i+1)%settings.checkpointEvery===0){start=performance.now();console.log('Checkpoint:',await checkpoint(s,path.join(settings.checkpointDir,`world-${report.date.year}-${String(report.date.month).padStart(2,'0')}.json`)));times.checkpointMs=(times.checkpointMs||0)+performance.now()-start;}peakHeap=Math.max(peakHeap,process.memoryUsage().heapUsed);peakRss=Math.max(peakRss,process.memoryUsage().rss);
  }
  times.elapsedMs=performance.now()-wallStart;times.cpu=process.cpuUsage(cpuStart);times.sampledPeakRssBytes=peakRss;if(pool)times.pool={...pool.metrics};if(profiler)times.stages=profiler.stop();start=performance.now();const serialized=s.serialize();times.serializeMs=performance.now()-start;const state=JSON.parse(serialized);start=performance.now();validateGameState(state,hierarchy);times.validationMs=performance.now()-start;start=performance.now();s.load(state);times.loadMs=performance.now()-start;
  times.monthP95Ms=samples.length?[...samples].sort((a,b)=>a-b)[Math.min(samples.length-1,Math.floor(samples.length*.95))]:0;times.workers=settings.workers;
  times.gameStateBytes=Buffer.byteLength(serialized);times.heapUsedBytes=process.memoryUsage().heapUsed;times.sampledPeakHeapBytes=peakHeap;times.monthMedianMs=samples.length?[...samples].sort((a,b)=>a-b)[Math.floor(samples.length/2)]:0;times.monthMaxMs=Math.max(0,...samples);
  console.log('COMPLETE:',JSON.stringify({date:report.date,months:settings.months,totals,...times}));if(settings.save)console.log('Save:',await atomicWrite(settings.save,JSON.stringify(makeSave(state))));if(settings.stats)console.log('Statistics:',await atomicWrite(settings.stats,JSON.stringify({synthetic:true,settings,times,totals,annual},null,2)));
  }finally{pool?.dispose();}
}
module.exports={options,atomicWrite,outputPath,main};
