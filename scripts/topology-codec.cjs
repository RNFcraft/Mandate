// Lossless coordinate codec: source-grid indices when EXACT, Float64 otherwise.
const {gzipSync,gunzipSync}=require('node:zlib');
function packTopology(topology,arcGrids=[],level=9){
  const arcLengths=topology.arcs.map(a=>a.length),count=arcLengths.reduce((a,b)=>a+b,0);
  const buffer=Buffer.allocUnsafe(count*17);let offset=0;
  const put=n=>{n=n<0?-n*2-1:n*2;while(n>=128){buffer[offset++]=(n&127)|128;n=Math.floor(n/128);}buffer[offset++]=n;};
  for(const arc of topology.arcs){const last=arcGrids.map(()=>[0,0]);for(const p of arc){
    let found=false;for(let i=0;i<arcGrids.length;i++){const g=arcGrids[i],n=p.map((v,j)=>Math.round((v-g.translate[j])/g.scale[j]));
      if(n.every((v,j)=>v*g.scale[j]+g.translate[j]===p[j])){buffer[offset++]=i+1;put(n[0]-last[i][0]);put(n[1]-last[i][1]);last[i]=n;found=true;break;}}
    if(!found){buffer[offset++]=0;buffer.writeDoubleLE(p[0],offset);buffer.writeDoubleLE(p[1],offset+8);offset+=16;}
  }}
  const {arcs,...metadata}=topology;
  return {...metadata,arcEncoding:'exact-grid-float64-gzip-v1',arcGrids,arcLengths,packedArcs:gzipSync(buffer.subarray(0,offset),{level}).toString('base64')};
}
function unpackTopology(topology){
  if(!topology.arcEncoding)return topology;
  if(topology.arcEncoding!=='exact-grid-float64-gzip-v1')throw new Error('Unknown arc encoding');
  const buffer=gunzipSync(Buffer.from(topology.packedArcs,'base64'));let offset=0;
  const get=()=>{let n=0,m=1,b;do{if(offset>=buffer.length)throw new Error('Corrupt topology');b=buffer[offset++];n+=(b&127)*m;m*=128;}while(b&128);return n&1?-(n+1)/2:n/2;};
  const arcs=topology.arcLengths.map(n=>{const last=topology.arcGrids.map(()=>[0,0]);return Array.from({length:n},()=>{
    const tag=buffer[offset++];if(tag===0){const p=[buffer.readDoubleLE(offset),buffer.readDoubleLE(offset+8)];offset+=16;return p;}
    const g=topology.arcGrids[tag-1];if(!g)throw new Error('Corrupt topology grid');const p=last[tag-1];p[0]+=get();p[1]+=get();return p.map((v,j)=>v*g.scale[j]+g.translate[j]);
  });});
  if(offset!==buffer.length)throw new Error('Corrupt topology length');
  const {arcEncoding,arcGrids,arcLengths,packedArcs,...metadata}=topology;return {...metadata,arcs};
}
module.exports={packTopology,unpackTopology};
