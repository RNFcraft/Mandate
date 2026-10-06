const {parentPort,workerData}=require('node:worker_threads');
const {performance}=require('node:perf_hooks');
const {allocate,spatialIndex}=require('./population-baseline.cjs');
(async()=>{
  let features=workerData.features;
  if(!features){
    const geography=await require('./import-population-1700.cjs').loadGeography();
    if(geography.geographyHash!==workerData.geographyHash||geography.hierarchyHash!==workerData.hierarchyHash)throw Error('Canonical geography changed during import');
    features=geography.features;
  }
  const query=spatialIndex(features);
  parentPort.on('message',chunk=>{
    const started=performance.now(),partial=allocate(workerData.rasters,features,{query,startRow:chunk.startRow,endRow:chunk.endRow});
    parentPort.postMessage({type:'chunkComplete',...chunk,partial,sourceCells:partial.audit.sourceCells,positiveCells:partial.audit.positiveSourceCells,elapsedMs:performance.now()-started,rssMiB:process.memoryUsage().rss/1048576});
  });
  parentPort.postMessage({type:'ready'});
})().catch(error=>{throw error;});
