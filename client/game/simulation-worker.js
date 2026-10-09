import protocol from '../../shared/simulation-protocol.cjs';
import pool from '../../shared/economy-pool.cjs';
import economy from '../../shared/economy.cjs';
import population from '../../shared/population.cjs';
import settlements from '../../shared/settlements.cjs';
import autonomy from '../../shared/autonomous-economy.cjs';
let profiling=false,metrics={};
const receive=protocol.createEndpoint(message=>{if(profiling){metrics.messageBytes=new TextEncoder().encode(JSON.stringify(message)).length;message.metrics=metrics;metrics={};}self.postMessage(message);},{createPool:size=>new pool.EconomyPool({size,createWorker:()=>new Worker('/economy-worker.bundle.js',{type:'module'})})});
self.onmessage=({data})=>{
  if(data.type==='Initialize'&&data.payload.perf&&!profiling){profiling=true;for(const [object,name,label]of [[economy,'prepareEconomyMonth','economy'],[population,'preparePopulationMonth','demography'],[settlements,'prepareSettlementsMonth','settlements'],[autonomy,'begin','planning'],[autonomy,'finish','investment'],[autonomy,'develop','development']]){const original=object[name];object[name]=(...args)=>{const start=performance.now();try{return original(...args);}finally{metrics[label]=(metrics[label]||0)+performance.now()-start;}};}}
  receive(data);
};
