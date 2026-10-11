// Read-only wall-clock instrumentation outside GameState and simulation decisions.
const {performance}=require('node:perf_hooks');
function profile(){
  const measurements={},restore=[];
  for(const [moduleName,names]of [['economy',['prepareEconomyMonth']],['autonomous-economy',['begin','finish','develop']],['population',['preparePopulationMonth']],['settlements',['prepareSettlementsMonth']]]){
    const module=require('../shared/'+moduleName+'.cjs');for(const name of names){const original=module[name],key=moduleName+'.'+name;measurements[key]={calls:0,totalMs:0};module[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{measurements[key].calls++;measurements[key].totalMs+=performance.now()-start;}};restore.push(()=>{module[name]=original;});}
  }
  return {measurements,stop(){for(const reset of restore)reset();return measurements;}};
}
// Inclusive exported-call timings supplement the disjoint core phase boundaries.
function instrument(){
  const diagnostics=require('../shared/economy-diagnostics.cjs'),restore=[];
  for(const [moduleName,names]of [['economy',['prepareEconomyMonth','validateEconomyState']],['economy-trade',['coordinate','validate']],['economy-routes',['validate']],['autonomous-economy',['develop']],['population',['preparePopulationMonth']],['settlements',['prepareSettlementsMonth']],['economy-history',['append']],['economy-observations',['summarize']]]){
    const module=require('../shared/'+moduleName+'.cjs');for(const name of names){const original=module[name];module[name]=function(...args){const trace=diagnostics.current();if(!trace)return original.apply(this,args);const start=trace.now();try{return original.apply(this,args);}finally{const e=args[0]?.systems?.economy||args[0],objects=(e?.enterprises?.length||0)+(e?.households?.length||0)+(e?.trade?.routing?.cargo?.length||0);trace.phase('inclusive.'+moduleName+'.'+name,start,objects);if(moduleName==='economy-routes'&&name==='validate'){trace.count('routeValidationCalls');trace.count('routeValidationCargoRows',e?.trade?.routing?.cargo?.length||0);}}};restore.push(()=>{module[name]=original;});}
  }
  return ()=>{for(const reset of restore.reverse())reset();};
}
module.exports={profile,instrument};
