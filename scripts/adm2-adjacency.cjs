const fs=require('node:fs/promises');
const {feature}=require('topojson-client');
async function writeChunk(file,json){
  for(let attempt=0;attempt<5;attempt++)try{await fs.writeFile(file,json);return;}catch(error){
    if(!['UNKNOWN','EBUSY','EPERM','EACCES'].includes(error.code)||attempt===4)throw error;
    await new Promise(resolve=>setTimeout(resolve,100*(attempt+1)));
  }
}
function inRing(r,x,y){let hit=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
const inside=(g,x,y)=>(g.type==='Polygon'?[g.coordinates]:g.coordinates).some(p=>inRing(p[0],x,y)&&!p.slice(1).some(r=>inRing(r,x,y)));
module.exports=async function adjacency(work,out){
  const topology=JSON.parse(await fs.readFile(`${work}/detail.topo.json`,'utf8'));
  const metadata=JSON.parse(await fs.readFile(`${work}/matching.json`,'utf8'));
  const indices=new Map(metadata.map((r,i)=>[r.id,i])),grid=new Map();
  const geometries=feature(topology,topology.objects.territories).features;
  for(const f of geometries)if(f.geometry&&!metadata[indices.get(f.id)].id.startsWith('fallback:')){
    const b=metadata[indices.get(f.id)].bounds;
    for(let x=Math.floor(b[0]/5);x<=Math.floor(b[2]/5);x++)for(let y=Math.floor(b[1]/5);y<=Math.floor(b[3]/5);y++){
      const key=`${x},${y}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(f);
    }
  }
  const neighbors=topology.arcs.map(()=>[]);
  const visit=(arcs,id)=>{for(const a of arcs)if(Array.isArray(a))visit(a,id);else{const index=a<0?~a:a;if(!neighbors[index].includes(id))neighbors[index].push(id);}};
  for(const g of topology.objects.territories.geometries)if(g.arcs)visit(g.arcs,indices.get(g.id));
  let overlapArcs=0;
  for(let i=0;i<neighbors.length;i++)if(neighbors[i].some(index=>metadata[index].id.startsWith('fallback:'))){
    const arc=topology.arcs[i];let x=0,y=0;
    for(let p=0;p<=Math.floor(arc.length/2);p++){x+=arc[p][0];y+=arc[p][1];}
    x=x*topology.transform.scale[0]+topology.transform.translate[0];y=y*topology.transform.scale[1]+topology.transform.translate[1];
    let matched=false;
    for(const f of grid.get(`${Math.floor(x/5)},${Math.floor(y/5)}`)||[])if(inside(f.geometry,x,y)){
      const id=indices.get(f.id);if(!neighbors[i].includes(id)){neighbors[i].push(id);matched=true;}
    }
    if(matched)overlapArcs++;
  }
  const lookup=new Map(topology.arcs.map((arc,i)=>[JSON.stringify(arc),neighbors[i]]));
  let bytes=0,maxBytes=0;
  const files=(await fs.readdir(`${out}/chunks`)).filter(f=>/^\d+-\d+-\d+\.json$/.test(f));
  const sizes=new Map();
  for(const file of files){const chunk=JSON.parse(await fs.readFile(`${out}/chunks/${file}`,'utf8'));
    chunk.neighbors=chunk.arcs.map(arc=>lookup.get(JSON.stringify(arc))||[]);
    const json=JSON.stringify(chunk),size=Buffer.byteLength(json);await writeChunk(`${out}/chunks/${file}`,json);bytes+=size;maxBytes=Math.max(maxBytes,size);sizes.set(file.slice(0,-5),size);
  }
  return {bytes,maxBytes,sizes,overlapArcs};
};
