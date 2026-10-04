const {Worker}=require('node:worker_threads');
const path=require('node:path');
let worker,nextId=0;const pending=new Map();
function start(){
  worker=new Worker(path.resolve(__dirname,'political-worker.cjs'));
  worker.on('message',({id,result,error})=>{const p=pending.get(id);if(!p)return;pending.delete(id);error?p.reject(new Error(error)):p.resolve(result);});
  worker.on('error',e=>{for(const p of pending.values())p.reject(e);pending.clear();worker=null;});
}
module.exports=function political(ownership){if(!worker)start();return new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});worker.postMessage({id,ownership});});};
