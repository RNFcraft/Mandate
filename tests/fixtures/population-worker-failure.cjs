const {parentPort}=require('node:worker_threads');
parentPort.on('message',()=>{throw Error('Injected chunk failure');});
parentPort.postMessage({type:'ready'});
