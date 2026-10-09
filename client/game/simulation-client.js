import kernel from '../../shared/simulation.cjs';
async function freezeView(value){
  const stack=[value];let start=performance.now(),count=0;
  while(stack.length){const item=stack.pop();if(item&&typeof item==='object'&&!Object.isFrozen(item)){stack.push(...Object.values(item));Object.freeze(item);}if(++count%128===0&&performance.now()-start>4){await new Promise(resolve=>setTimeout(resolve,0));start=performance.now();}}
  return value;
}
const mapView=get=>Object.freeze({get size(){return get().size;},get:id=>get().get(id),has:id=>get().has(id),keys:()=>get().keys(),values:()=>get().values(),entries:()=>get().entries(),[Symbol.iterator]:()=>get().entries()});
export class SimulationClient{
  constructor(worker){
    this.worker=worker;this.pending=new Map();this.listeners=new Set();this.sequence=0;this.view={};this.owners=new Map();this.countryRows=new Map();
    this.ownership=mapView(()=>this.owners);this.countries=mapView(()=>this.countryRows);this.polities=this.countries;
    this.responses=Promise.resolve();
    const receive=async data=>{
      const pending=this.pending.get(data.id);if(!pending)return;
      if(pending.start!==undefined)window.mandatePerf?.record('workerRoundTrip',performance.now()-pending.start);
      for(const [name,value]of Object.entries(data.metrics||{}))window.mandatePerf?.record(name,value);
      const viewStart=window.mandatePerf?performance.now():0;
      await this.install(data.view);
      for(const event of data.events||[])for(const listener of this.listeners)try{listener(event);}catch{}
      if(data.view?.economy!==undefined||data.view?.economyPatch)for(const listener of this.listeners)try{listener({type:'viewUpdated'});}catch{}
      if(window.mandatePerf)window.mandatePerf.record('workerView',performance.now()-viewStart);
      this.pending.delete(data.id);if(data.type==='Error')pending.reject(Error(data.error));else pending.resolve(data.result);
    };
    worker.onmessage=({data})=>{this.responses=this.responses.then(()=>receive(data)).catch(error=>{for(const p of this.pending.values())p.reject(error);this.pending.clear();this.failed=true;});};
    worker.onerror=()=>{this.failed=true;for(const p of this.pending.values())p.reject(Error('Simulation worker stopped'));this.pending.clear();for(const listener of this.listeners)try{listener({type:'workerError'});}catch{}};
  }
  async install(view){
    if(!view)return;
    if(view.economyPatch){const p=view.economyPatch,e=this.view.economy,firms=new Map([...e.enterprises,...p.added].map(f=>[f.id,f])),markets=new Map(p.markets);view.economy={...e,stats:p.stats,enterprises:p.enterprises.map(([id,capacityBatches,cashMinor,stats])=>({...firms.get(id),capacityBatches,cashMinor,stats})),markets:e.markets.map(m=>({...m,goods:markets.get(m.id)}))};delete view.economyPatch;}
    if(view.settlementPatch){const p=view.settlementPatch,rows=new Map([...this.view.settlements,...p.added].map(r=>[r.id,r]));view.settlements=p.rows.map(([id,type,population,capitalOf,enterprises,availableLabor,usedLabor,revenue,activeEnterprises,industries])=>({...rows.get(id),type,population,capitalOf,enterprises,availableLabor,usedLabor,revenue,activeEnterprises,industries}));delete view.settlementPatch;}
    await freezeView(view);Object.assign(this.view,view);if(view.ownership)this.owners=new Map(Object.entries(view.ownership));if(view.countries)this.countryRows=new Map(view.countries.map(c=>[c.id,c]));
  }
  request(type,payload={}){if(this.failed)return Promise.reject(Error('Simulation worker unavailable'));const id=++this.sequence;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject,...(window.mandatePerf?{start:performance.now()}: {})});this.worker.postMessage({version:1,id,type,payload});});}
  get clock(){return this.view.clock;}get scenario(){return this.view.scenario;}get controllers(){return this.view.controllers;}
  subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  start(){return this.request('Start');}pause(){return this.request('Pause');}setSpeed(speed){return this.request('SetSpeed',{speed});}
  step(count=1){return this.request('Step',{count});}submit(command){return this.request('SubmitCommand',{command});}
  snapshot(){return this.request('RequestSnapshot');}serialize(){return this.request('Serialize');}save(){return this.request('Save');}
  load(value){this.loading=(this.loading||0)+1;return this.request('Load',{value}).finally(()=>this.loading--);}
  enableAutonomy(rules={}){return this.request('EnableAutonomy',{rules});}economicReport(){return this.request('RequestSummary');}
  economySummary(){return this.view.economy;}economyView(){return this.view.economy;}
  enterpriseSummary(id){return this.request('RequestSummary',{kind:'enterprise',id});}
  settlementSummary(provinceId){return this.view.settlements===null?null:provinceId?this.view.settlements.filter(r=>r.provinceId===provinceId):this.view.settlements;}
  populationSummary(id){return this.view.population?.[id??'total']||{total:0,urban:0,rural:0};}
  territoryPoliticalState(id){return this.request('RequestSummary',{kind:'political',id});}
  dispose(){this.worker.terminate();this.failed=true;for(const p of this.pending.values())p.reject(Error('Simulation disposed'));this.pending.clear();}
}
export async function createSimulation(scenario,hierarchy,options){
  const params=new URLSearchParams(location.search),direct=()=>{const simulation=new kernel.Simulation(scenario,hierarchy,options);if(params.get('autonomous')==='1')simulation.enableAutonomy();return simulation;};
  if(typeof Worker==='undefined'||params.get('simulation')==='direct')return direct();
  let worker;try{worker=new Worker('/simulation-worker.bundle.js',{type:'module'});}catch{return direct();}
  const client=new SimulationClient(worker);
  try{const workers=params.get('workers')==='auto'?0:Number(params.get('workers')||0);if(!Number.isInteger(workers)||workers<0||workers>8)throw Error('Invalid worker count');await client.request('Initialize',{scenario,hierarchy,options,workers,perf:params.get('perf')==='1',autonomous:params.get('autonomous')==='1'});return client;}
  catch(error){client.dispose();throw error;}
}
