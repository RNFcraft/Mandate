const {Worker}=require('node:worker_threads');
const os=require('node:os');
const {performance}=require('node:perf_hooks');
const {sameGrid}=require('./population-raster.cjs');
const {compare}=require('./population-baseline.cjs');
const CHUNK_ROWS=32;
const defaultWorkers=()=>Math.max(1,Math.min(4,os.availableParallelism?.()||os.cpus().length||1));
function chunksOf(nrows){return Array.from({length:Math.ceil(nrows/CHUNK_ROWS)},(_,chunkIndex)=>({chunkIndex,startRow:chunkIndex*CHUNK_ROWS,endRow:Math.min(nrows,(chunkIndex+1)*CHUNK_ROWS)}));}
function accumulator(){let value=0,correction=0;return {add(n){const y=n-correction,t=value+y;correction=(t-value)-y;value=t;},get value(){return value;}};}
function mergeChunks(partials){
  const ordered=partials.slice().sort((a,b)=>a.chunkIndex-b.chunkIndex);
  if(!ordered.length||ordered.some((p,i)=>p.chunkIndex!==i))throw Error('Incomplete/duplicate spatial chunks');
  const audit={...ordered[0].partial.audit},totals=new Map(),sums=new Map();
  for(const [key,value]of Object.entries(audit))if(Array.isArray(value))audit[key]=[];else if(typeof value==='number'){sums.set(key,accumulator());}
  for(const {partial}of ordered){
    for(const [key,value]of Object.entries(partial.audit))if(Array.isArray(value)){for(const row of value)audit[key].push(row);}else if(sums.has(key)&&!key.endsWith('Pct'))sums.get(key).add(value);
    for(const row of partial.rows){if(!totals.has(row.id))totals.set(row.id,{total:accumulator(),urban:accumulator()});const t=totals.get(row.id);t.total.add(row.total);t.urban.add(row.urban);}
  }
  for(const [key,s]of sums)audit[key]=s.value;
  audit.unresolvedPct=audit.cleanedSourceTotal?100*audit.unresolvedPopulation/audit.cleanedSourceTotal:0;
  audit.anomalyPct=audit.cleanedSourceTotal?100*audit.anomalyPopulation/audit.cleanedSourceTotal:audit.anomalyPopulation>0?100:0;
  return {rows:[...totals].sort((a,b)=>compare(a[0],b[0])).map(([id,t])=>({id,total:t.total.value,urban:t.urban.value})),audit};
}
const duration=ms=>{const seconds=Math.floor(Math.max(0,ms)/1000);return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');};
function progressOf(completedRows,totalRows,completedChunks,totalChunks,elapsedMs,workers){
  const etaMs=completedRows&&elapsedMs>0?Math.max(0,(totalRows-completedRows)*elapsedMs/completedRows):completedRows===totalRows?0:null;
  const percentage=totalRows?100*completedRows/totalRows:100;
  return {percentage,completedRows,totalRows,completedChunks,totalChunks,elapsedMs,etaMs,workers,text:`SPATIAL: ${percentage.toFixed(1)}% | ${completedRows}/${totalRows} rows | ${completedChunks}/${totalChunks} chunks | ${duration(elapsedMs)} elapsed | ETA ${etaMs===null?'calculating...':duration(etaMs)} | ${workers} workers`};
}
async function allocateParallel(rasters,options={}){
  sameGrid(Object.values(rasters));
  const workers=options.workers??defaultWorkers();if(!Number.isInteger(workers)||workers<1||workers>16)throw Error('Invalid workers: expected integer 1..16');
  const shared={};for(const [key,raster]of Object.entries(rasters)){
    let values=raster.values;if(!(values.buffer instanceof SharedArrayBuffer)){const copy=new Float64Array(new SharedArrayBuffer(values.byteLength));copy.set(values);values=copy;}
    shared[key]={...raster,values};
  }
  const chunks=chunksOf(rasters.total.nrows),count=Math.min(workers,chunks.length),pool=[],partials=[],started=performance.now();
  let next=0,completedRows=0,peakRssMiB=process.memoryUsage().rss/1048576,timer;
  const report=()=>{peakRssMiB=Math.max(peakRssMiB,process.memoryUsage().rss/1048576);options.onProgress?.(progressOf(completedRows,rasters.total.nrows,partials.length,chunks.length,performance.now()-started,count));};
  try{
    await new Promise((resolve,reject)=>{
      let settled=false;
      const fail=error=>{if(!settled){settled=true;reject(Error(`Spatial worker failed: ${error.message}`));}};
      const dispatch=worker=>{if(next<chunks.length)worker.postMessage(chunks[next++]);};
      for(let i=0;i<count;i++){
        const worker=new Worker(options.workerPath||require.resolve('./population-worker.cjs'),{workerData:{rasters:shared,features:options.features,geographyHash:options.geographyHash,hierarchyHash:options.hierarchyHash}});pool.push(worker);
        let assigned;
        worker.on('error',fail);worker.on('exit',code=>{if(!settled)fail(Error(`unexpected exit (${code})`));});
        worker.on('message',message=>{
          if(settled)return;
          try{
            if(message.type==='ready'){assigned=chunks[next];dispatch(worker);return;}
            if(message.type!=='chunkComplete'||!assigned||message.chunkIndex!==assigned.chunkIndex||message.startRow!==assigned.startRow||message.endRow!==assigned.endRow)throw Error('Invalid spatial worker response');
            partials.push(message);completedRows+=message.endRow-message.startRow;peakRssMiB=Math.max(peakRssMiB,message.rssMiB||0);
            if(partials.length===chunks.length){report();settled=true;resolve();}else{assigned=chunks[next];dispatch(worker);}
          }catch(error){fail(error);}
        });
      }
      report();timer=setInterval(()=>{try{report();}catch(error){fail(error);}},3000);
    });
    return {allocation:mergeChunks(partials),performance:{workers:count,chunks:chunks.length,chunkRows:CHUNK_ROWS,spatialSeconds:(performance.now()-started)/1000,peakRssMiB}};
  }finally{clearInterval(timer);await Promise.all(pool.map(worker=>worker.terminate()));}
}
module.exports={CHUNK_ROWS,defaultWorkers,chunksOf,mergeChunks,progressOf,allocateParallel};
