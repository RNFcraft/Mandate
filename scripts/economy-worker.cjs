const {parentPort}=require('node:worker_threads');
const receive=require('../shared/economy-partitions.cjs').createPartitionEndpoint(message=>parentPort.postMessage(message));
parentPort.on('message',receive);
