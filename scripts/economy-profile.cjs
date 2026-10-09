// Read-only wall-clock instrumentation outside GameState and simulation decisions.
const {performance}=require('node:perf_hooks');
function profile(){
  const measurements={},restore=[];
  for(const [moduleName,names]of [['economy',['prepareEconomyMonth']],['autonomous-economy',['begin','finish','develop']],['population',['preparePopulationMonth']],['settlements',['prepareSettlementsMonth']]]){
    const module=require('../shared/'+moduleName+'.cjs');for(const name of names){const original=module[name],key=moduleName+'.'+name;measurements[key]={calls:0,totalMs:0};module[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{measurements[key].calls++;measurements[key].totalMs+=performance.now()-start;}};restore.push(()=>{module[name]=original;});}
  }
  return {measurements,stop(){for(const reset of restore)reset();return measurements;}};
}
module.exports={profile};
