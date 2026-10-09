const economy=require('./economy.cjs'),partitions=require('./economy-partitions.cjs');
// Transport-independent persistent pool. Browser and worker_threads supply factory.
class EconomyPool{
  constructor({size=1,createWorker,timeoutMs=60000}={}){if(!Number.isInteger(size)||size<1||size>8||typeof createWorker!=='function')throw Error('Invalid economy pool');this.size=size;this.createWorker=createWorker;this.timeoutMs=timeoutMs;this.workers=[];this.sequence=0;this.generation=0;this.metrics={months:0,elapsedMs:0,workerPrepareMs:0,mergeMs:0,peakWorkerHeapBytes:0};}
  async call(worker,type,payload){const id=++this.sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{worker.pending.delete(id);reject(Error('Economy worker timeout'));},this.timeoutMs);worker.pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});worker.transport.postMessage({id,type,payload});});}
  makeWorker(){const transport=this.createWorker(),worker={transport,pending:new Map()};const receive=data=>{const p=worker.pending.get(data.id);if(!p)return;worker.pending.delete(data.id);if(data.error)p.reject(Error(data.error));else p.resolve(data.result);};const fail=()=>{for(const p of worker.pending.values())p.reject(Error('Economy worker stopped'));worker.pending.clear();};if(transport.on){transport.on('message',receive);transport.on('error',fail);transport.on('exit',fail);}else{transport.onmessage=({data})=>receive(data);transport.onerror=fail;}return worker;}
  reset(){this.generation++;for(const w of this.workers){for(const p of w.pending.values())p.reject(Error('Economy preparation cancelled'));w.pending.clear();w.transport.terminate();}this.workers=[];this.last=null;}
  dispose(){this.reset();this.disposed=true;}
  cancel(){this.reset();}
  async prepare(state,population,hierarchy,period){
    if(this.disposed||this.busy)throw Error('Economy pool unavailable or busy');this.busy=true;const start=performance.now();
    try{
      economy.validateEconomyState(state,hierarchy);
      const signature=JSON.stringify(state.markets.map(m=>[m.id,m.provinceIds]));
      if(!this.last||this.last.month!==state.stats.monthsProcessed||this.last.stateRef!==state||this.signature!==signature){
        this.reset();this.signature=signature;this.groups=partitions.partitionMarkets(state,this.size);this.workers=this.groups.map(()=>this.makeWorker());
        this.provinces=this.groups.map(ids=>new Set(state.markets.filter(m=>ids.includes(m.id)).flatMap(m=>m.provinceIds)));
        await Promise.all(this.workers.map((w,i)=>this.call(w,'Initialize',{state:partitions.project(state,this.groups[i]),hierarchy:{id:hierarchy.id,territories:hierarchy.territories.filter(t=>this.provinces[i].has(t.id))}})));
        this.last={month:state.stats.monthsProcessed,stateRef:state,cash:new Map(state.households.map(h=>[h.id,h.cashMinor])),firms:new Set(state.enterprises.map(e=>e.id))};
      }
      const token=this.generation,results=await Promise.all(this.workers.map((w,i)=>{
        const provinces=this.provinces[i],added=state.enterprises.filter(e=>provinces.has(e.provinceId)&&!this.last.firms.has(e.id)),ids=new Set(added.map(e=>e.id));
        return this.call(w,'Prepare',{period,expectedPeriod:period.year*12+period.month,cohorts:population.cohorts.filter(c=>provinces.has(c.territoryId)),cash:Object.fromEntries(state.households.filter(h=>provinces.has(h.provinceId)&&this.last.cash.get(h.id)!==h.cashMinor).map(h=>[h.id,h.cashMinor])),enterprises:added,firms:state.autonomy?.firms.filter(f=>ids.has(f.enterpriseId))});
      }));
      if(token!==this.generation)throw Error('Economy preparation cancelled');
      const mergeStart=performance.now(),prepared=partitions.merge(state,results.map(r=>r.state),hierarchy,period);
      this.metrics.months++;this.metrics.elapsedMs+=performance.now()-start;this.metrics.mergeMs+=performance.now()-mergeStart;this.metrics.workerPrepareMs+=results.reduce((n,r)=>n+r.metrics.prepareMs,0);this.metrics.peakWorkerHeapBytes=Math.max(this.metrics.peakWorkerHeapBytes,results.reduce((n,r)=>n+(r.metrics.heapUsedBytes||0),0));
      this.last={month:prepared.state.stats.monthsProcessed,stateRef:prepared.state,cash:new Map(prepared.state.households.map(h=>[h.id,h.cashMinor])),firms:new Set(prepared.state.enterprises.map(e=>e.id))};return prepared;
    }catch(error){this.reset();throw error;}finally{this.busy=false;}
  }
}
module.exports={EconomyPool};
