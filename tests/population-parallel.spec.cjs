const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path');
const {allocate,createBaseline}=require('../scripts/population-baseline.cjs');
const {allocateParallel,chunksOf,mergeChunks,progressOf,defaultWorkers}=require('../scripts/population-parallel.cjs');
const {argsOf,publishPopulation}=require('../scripts/import-population-1700.cjs');
const {hierarchy}=require('./fixtures/population.cjs');
const features=[{id:'gb:A:1',geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,80],[0,80],[0,0]]]}}];
const options={sanity:false,maxAnomalyPct:100,geographyHash:'a'.repeat(64),hierarchyHash:'b'.repeat(64)};
function inputs(nrows=128){
  return Object.fromEntries(['total','urban','rural'].map((key,k)=>[key,{ncols:1,nrows,x:0,y:0,cellsize:0.5,nodata:-9999,sha256:String(k+1).repeat(64),values:Float64Array.from({length:nrows},(_,i)=>key==='total'?100+i/13:key==='urban'?i%3:90)}]));
}
test('1, 2 and 4 workers produce identical authoritative bytes and semantic audits',async()=>{
  const rasters=inputs(),results=[];
  for(const workers of [1,2,4]){
    const progress=[],spatial=await allocateParallel(rasters,{workers,features,onProgress:p=>progress.push(p)});
    results.push(createBaseline(rasters,features,hierarchy,{...options,allocation:spatial.allocation}));
    expect(progress.at(-1)).toMatchObject({percentage:100,completedRows:128,completedChunks:4,etaMs:0});
    expect(progress.every(p=>p.etaMs===null||Number.isFinite(p.etaMs)&&p.etaMs>=0)).toBe(true);
    expect(spatial.performance.chunks).toBe(4);expect(spatial.performance.chunkRows).toBe(32);
  }
  expect(JSON.stringify(results[0])).toBe(JSON.stringify(results[1]));expect(JSON.stringify(results[0])).toBe(JSON.stringify(results[2]));
  const serial=createBaseline(rasters,features,hierarchy,options);
  expect(results[0].population).toEqual(serial.population);
});
test('fixed row chunks and canonical merge ignore reverse and shuffled completion',()=>{
  const rasters=inputs(80),chunks=chunksOf(80);
  expect(chunks).toEqual([{chunkIndex:0,startRow:0,endRow:32},{chunkIndex:1,startRow:32,endRow:64},{chunkIndex:2,startRow:64,endRow:80}]);
  const partials=chunks.map(chunk=>({...chunk,partial:allocate(rasters,features,chunk)})),merged=mergeChunks(partials);
  expect(mergeChunks(partials.slice().reverse())).toEqual(merged);expect(mergeChunks([partials[1],partials[2],partials[0]])).toEqual(merged);
  expect(()=>mergeChunks([partials[0],partials[0]])).toThrow('Incomplete');
});
test('chunk audits preserve global cell indices and anomaly/fallback semantics',async()=>{
  const rasters=inputs();
  rasters.total.values[31]=0;rasters.urban.values[31]=2;rasters.rural.values[31]=3;
  rasters.total.values[32]=-2;rasters.urban.values[32]=NaN;
  rasters.urban.values[64]=0;rasters.rural.values[64]=0;
  rasters.total.values[96]=-9999;rasters.urban.values[96]=-9999;rasters.rural.values[96]=-9999;
  const a=await allocateParallel(rasters,{workers:1,features}),b=await allocateParallel(rasters,{workers:4,features});
  expect(a.allocation).toEqual(b.allocation);
  expect(a.allocation.audit.invalidSourceValues.map(r=>r.index)).toEqual([32,32]);
  expect(a.allocation.audit.settlementWithoutTotalCells.map(r=>r.index)).toEqual([31,32]);
  expect(a.allocation.audit.ruralFallbackCells.map(r=>r.index)).toEqual([64]);
  expect(a.allocation.audit.sourceCells).toBe(128);
});
test('tiny workloads, zero elapsed time and progress ETA stay finite',async()=>{
  for(const rows of [1,2]){
    const progress=[];await allocateParallel(inputs(rows),{workers:4,features,onProgress:p=>progress.push(p)});
    expect(progress.at(-1).percentage).toBe(100);expect(progress.at(-1).workers).toBe(1);
  }
  expect(progressOf(0,1,0,1,0,1).etaMs).toBeNull();expect(progressOf(1,1,1,1,0,1).etaMs).toBe(0);
  expect(progressOf(0,0,0,0,0,1).percentage).toBe(100);
});
test('worker error rejects before publication and preserves existing assets',async()=>{
  const folder=path.resolve('tmp',`population-worker-test-${process.pid}`);
  expect(folder.startsWith(path.resolve('tmp')+path.sep)).toBe(true);
  try{
    await fs.mkdir(folder,{recursive:true});for(const name of ['population.json','population.meta.json'])await fs.writeFile(path.join(folder,name),'existing '+name);
    const run=async()=>{
      const spatial=await allocateParallel(inputs(),{workers:4,features,workerPath:require.resolve('./fixtures/population-worker-failure.cjs')});
      await publishPopulation(createBaseline(inputs(),features,hierarchy,{...options,allocation:spatial.allocation}),folder);
    };
    await expect(run()).rejects.toThrow('Injected chunk failure');
    for(const name of ['population.json','population.meta.json'])expect(await fs.readFile(path.join(folder,name),'utf8')).toBe('existing '+name);
    expect((await fs.readdir(folder)).length).toBe(2);
  }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('CLI validates workers and worker IPC occurs only at chunk level',async()=>{
  const base=['--total','t','--urban','u','--rural','r'];
  expect(defaultWorkers()).toBeGreaterThanOrEqual(1);expect(defaultWorkers()).toBeLessThanOrEqual(4);
  for(const workers of [1,2,4,8,16])expect(argsOf([...base,'--workers',String(workers)]).workers).toBe(workers);
  for(const workers of ['0','17','1.5','NaN'])expect(()=>argsOf([...base,'--workers',workers])).toThrow('Invalid workers');
  expect(()=>argsOf([...base,'--workers','1','--workers','2'])).toThrow('Duplicate');
  const source=await fs.readFile(path.resolve('scripts/population-worker.cjs'),'utf8');
  expect(source.match(/parentPort\.postMessage/g)).toHaveLength(2);
  expect(source).toContain("type:'chunkComplete'");
  expect(await fs.readFile(path.resolve('scripts/population-baseline.cjs'),'utf8')).not.toContain('postMessage');
});
