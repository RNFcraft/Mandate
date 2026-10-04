// Decompress prepared coordinates; this performs no GIS operation or rounding.
export async function unpackTopology(topology){
  if(!topology.arcEncoding)return topology;
  if(topology.arcEncoding!=='exact-grid-float64-gzip-v1')throw new Error('Unknown arc encoding');
  const packed=Uint8Array.from(atob(topology.packedArcs),c=>c.charCodeAt(0));
  const stream=new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const buffer=new Uint8Array(await new Response(stream).arrayBuffer()),view=new DataView(buffer.buffer);let offset=0;
  const get=()=>{let n=0,m=1,b;do{if(offset>=buffer.length)throw new Error('Corrupt topology');b=buffer[offset++];n+=(b&127)*m;m*=128;}while(b&128);return n&1?-(n+1)/2:n/2;};
  topology.arcs=topology.arcLengths.map(n=>{const last=topology.arcGrids.map(()=>[0,0]);return Array.from({length:n},()=>{
    const tag=buffer[offset++];if(tag===0){const p=[view.getFloat64(offset,true),view.getFloat64(offset+8,true)];offset+=16;return p;}
    const g=topology.arcGrids[tag-1];if(!g)throw new Error('Corrupt topology grid');const p=last[tag-1];p[0]+=get();p[1]+=get();return p.map((v,j)=>v*g.scale[j]+g.translate[j]);
  });});
  if(offset!==buffer.length)throw new Error('Corrupt topology length');
  delete topology.packedArcs;delete topology.arcLengths;delete topology.arcGrids;delete topology.arcEncoding;
  return topology;
}
