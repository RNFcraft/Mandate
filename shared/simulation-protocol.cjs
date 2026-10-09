// Versioned serialized request queue shared by browser and Node worker harnesses.
const {Simulation}=require('./simulation.cjs'),save=require('./save.cjs');
const VERSION=1;
function createEndpoint(send,{createPool}={}){
  let simulation,hierarchy,pool,queue=Promise.resolve(),events=[],lastId=0,knownFirms=new Set(),knownSettlements=new Set();
  const execute=async request=>{
    const {version,id,type,payload={}}=request||{};
    events=[];
    try{
      if(version!==VERSION||!Number.isSafeInteger(id)||id<=lastId)throw Error('Invalid or repeated simulation request');lastId=id;
      let result,metadata=false,monthly=false;
      if(type==='Initialize'){
        if(simulation)throw Error('Simulation already initialized');
        const workers=payload.workers??0;if(!Number.isInteger(workers)||workers<0||workers>8||workers&&!createPool)throw Error('Invalid or unavailable economy pool');
        const nextHierarchy=payload.hierarchy,next=new Simulation(payload.scenario,nextHierarchy,payload.options);
        if(payload.autonomous)next.enableAutonomy();const nextPool=workers?createPool(workers):null;
        hierarchy=nextHierarchy;simulation=next;pool=nextPool;simulation.subscribe(event=>events.push(event));metadata=true;
      }else{
        if(!simulation)throw Error('Simulation not initialized');
        switch(type){
          case 'Start':result=simulation.start();break;
          case 'Pause':result=simulation.pause();break;
          case 'SetSpeed':result=simulation.setSpeed(payload.speed);break;
          case 'Step':await simulation.stepAsync(payload.count,pool);break;
          case 'SubmitCommand':result=simulation.submit(payload.command);break;
          case 'RequestSummary':result=payload.kind==='enterprise'?simulation.enterpriseSummary(payload.id):payload.kind==='political'?simulation.territoryPoliticalState(payload.id):simulation.economicReport();break;
          case 'RequestSnapshot':result=simulation.snapshot();break;
          case 'Serialize':result=simulation.serialize();break;
          case 'Save':result=simulation.serializeSave();break;
          case 'Load':{
            const value=typeof payload.value==='string'?JSON.parse(payload.value):payload.value;
            if(value.format){save.validateSave(value,hierarchy);simulation.load(value.state);}else simulation.load(value);
            pool?.reset();
            simulation.pause();metadata=true;break;
          }
          case 'EnableAutonomy':simulation.enableAutonomy(payload.rules);metadata=true;break;
          default:throw Error('Unknown simulation request');
        }
      }
      monthly=events.some(e=>e.type==='economyUpdated'||e.type==='populationUpdated');
      metadata ||= events.some(e=>e.type==='stateChanged'&&!['time','clock'].includes(e.kind));
      const view=simulation.presentationView({metadata,monthly});
      if(monthly&&!metadata){
        if(view.economy){const e=view.economy;view.economyPatch={stats:e.stats,enterprises:e.enterprises.map(f=>[f.id,f.capacityBatches,f.cashMinor,f.stats]),added:e.enterprises.filter(f=>!knownFirms.has(f.id)),markets:e.markets.map(m=>[m.id,m.goods])};delete view.economy;}
        if(view.settlements){view.settlementPatch={added:view.settlements.filter(r=>!knownSettlements.has(r.id)),rows:view.settlements.map(r=>[r.id,r.type,r.population,r.capitalOf,r.enterprises,r.availableLabor,r.usedLabor,r.revenue,r.activeEnterprises,r.industries])};delete view.settlements;}
      }
      if(view.economy)knownFirms=new Set(view.economy.enterprises.map(f=>f.id));else for(const f of view.economyPatch?.added||[])knownFirms.add(f.id);
      if(view.settlements)knownSettlements=new Set(view.settlements.map(r=>r.id));else for(const r of view.settlementPatch?.added||[])knownSettlements.add(r.id);
      send({version:VERSION,id,type:'Result',result,events,view});
    }catch(error){send({version:VERSION,id,type:'Error',error:error.message,events,view:simulation?.presentationView({metadata:events.some(e=>['populationUpdated','economyUpdated'].includes(e.type))})});}
  };
  return request=>{queue=queue.then(()=>execute(request));return queue;};
}
module.exports={VERSION,createEndpoint};
