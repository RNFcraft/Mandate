import partitions from '../../shared/economy-partitions.cjs';
const receive=partitions.createPartitionEndpoint(message=>self.postMessage(message));
self.onmessage=({data})=>receive(data);
