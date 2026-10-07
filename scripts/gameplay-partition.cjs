// Independent geometric partition. This module does not accept atomic geometry.
const clipping = require('polygon-clipping');
const {area, bounds} = require('./adm2-spatial.cjs');

// All geography tuning, including cleanup and diagnostic thresholds, lives here.
const DEFAULTS = Object.freeze(require('./map-v2-tuning.json'));
const sq=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2;
class PointIndex {
  constructor(points){this.points=points;const build=(ids,axis=0)=>{if(!ids.length)return null;ids.sort((a,b)=>points[a][axis]-points[b][axis]||a-b);const mid=ids.length>>1;return {id:ids[mid],axis,left:build(ids.slice(0,mid),1-axis),right:build(ids.slice(mid+1),1-axis)};};this.root=build(points.map((_,i)=>i));}
  nearest(point,k=1){const best=[];const walk=node=>{if(!node)return;const d=sq(point,this.points[node.id]);let i=0;while(i<best.length&&(best[i].d<d||best[i].d===d&&best[i].id<node.id))i++;if(i<k){best.splice(i,0,{id:node.id,d});if(best.length>k)best.pop();}const delta=point[node.axis]-this.points[node.id][node.axis];walk(delta<0?node.left:node.right);if(best.length<k||delta*delta<=best.at(-1).d)walk(delta<0?node.right:node.left);};walk(this.root);return best;}
}
function planarCentroid(polygon){let mass=0,x=0,y=0;for(let r=0;r<polygon.length;r++){const ring=polygon[r];let sum=0,sx=0,sy=0;for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i],c=a[0]*b[1]-b[0]*a[1];sum+=c;sx+=(a[0]+b[0])*c;sy+=(a[1]+b[1])*c;}if(!sum)continue;const w=Math.abs(sum)*(r? -1:1);mass+=w;x+=sx/(3*sum)*w;y+=sy/(3*sum)*w;}return mass>0?[x/mass,y/mass]:polygon[0][0];}
function boundedDensity(d,config=DEFAULTS){return Math.min(config.densityClamp,config.densityFloor+config.densityWeight*Math.log1p(Math.max(0,d)/config.densityReference));}
function jitter(i,seed){let x=(i^seed)>>>0;x=Math.imul(x^(x>>>16),0x45d9f3b);x=Math.imul(x^(x>>>16),0x45d9f3b);return ((x^(x>>>16))>>>0)/4294967296;}
function samples(component,density,config){
  const [x0,y0,x1,y1]=component.bounds,step=config.samplingStep,result=[];
  // Scanline spans include holes. Work scales with coastline vertices × rows,
  // not with every sample × every coastline segment.
  for(let row=0,y=y0+step*.43;y<y1;y+=step,row++){
    const cuts=[];for(const ring of component.polygon)for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i];if((a[1]>y)!==(b[1]>y))cuts.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}
    cuts.sort((a,b)=>a-b);
    for(let s=0;s+1<cuts.length;s+=2){const start=Math.ceil((cuts[s]-x0)/step);for(let col=start,x=x0+start*step+step*.13;x<cuts[s+1];x+=step,col++){
      const lon=x+step*(jitter(row*1048576+col,config.seed)-.5)*.18;if(lon<=cuts[s]||lon>=cuts[s+1])continue;
      // Equal target mass = geographic area times a bounded demand field.
      // Antarctic land is intentionally coarse; no coastline change is involved.
      const weight=boundedDensity(density(lon,y),config)*(y< -60?config.polarMassMultiplier:1)*Math.max(.001,Math.cos(y*Math.PI/180));
      result.push({point:[lon*component.scale,y],geo:[lon,y],weight});
    }}
  }
  if(!result.length){const p=planarCentroid(component.polygon);result.push({point:[p[0]*component.scale,p[1]],geo:p,weight:1});}
  return result;
}
function componentsFromMask(mask,density=()=>0,config=DEFAULTS){
  return mask.map((polygon,i)=>{const b=bounds({type:'Polygon',coordinates:polygon}),km2=area([polygon]);const c={id:`land:${String(i+1).padStart(5,'0')}`,polygon,bounds:b,areaKm2:km2,scale:Math.max(.15,Math.cos((b[1]+b[3])/2*Math.PI/180))};
    c.samples=km2>=config.islandProvinceArea?samples(c,density,config):[];
    const mean=c.samples.length?c.samples.reduce((s,p)=>s+p.weight,0)/c.samples.reduce((s,p)=>s+Math.max(.001,Math.cos(p.geo[1]*Math.PI/180)),0):1;c.mass=km2*mean;return c;});
}
function allocateBudgets(components,target,config=DEFAULTS){
  const eligible=components.filter(c=>c.areaKm2>=config.islandProvinceArea);if(!eligible.length){components.reduce((a,b)=>a.areaKm2>b.areaKm2?a:b).budget=1;return;}
  target=Math.max(target,eligible.length);const mass=eligible.reduce((s,c)=>s+c.mass,0),remaining=target-eligible.length;let assigned=eligible.length;
  for(const c of components)c.budget=0;
  for(const c of eligible){const exact=remaining*c.mass/mass;c.budget=1+Math.floor(exact);c.remainder=exact-Math.floor(exact);assigned+=c.budget-1;}
  const order=[...eligible].sort((a,b)=>b.remainder-a.remainder||a.id.localeCompare(b.id,'en'));for(let i=0;i<target-assigned;i++)order[i%order.length].budget++;
}
function seedPoints(sampleSet,count,config){
  // Weighted spatial stratification, followed by constrained Lloyd relaxation.
  // Each leaf receives a representative inside the land, never a random seed.
  const output=[];
  const split=(set,n)=>{if(n===1||set.length<2){const weight=set.reduce((s,p)=>s+p.weight,0),mean=[0,0],b=[Infinity,Infinity,-Infinity,-Infinity];for(const p of set){mean[0]+=p.point[0]*p.weight/weight;mean[1]+=p.point[1]*p.weight/weight;for(let k=0;k<2;k++){b[k]=Math.min(b[k],p.point[k]);b[k+2]=Math.max(b[k+2],p.point[k]);}}
      for(let k=0;k<2;k++)mean[k]+=(jitter(output.length*2+k,config.seed)-.5)*(b[k+2]-b[k])*config.seedJitter;
      output.push(set.reduce((a,b)=>sq(b.point,mean)<sq(a.point,mean)?b:a).point.slice());return;}
    const b=[Infinity,Infinity,-Infinity,-Infinity];for(const p of set)for(let k=0;k<2;k++){b[k]=Math.min(b[k],p.point[k]);b[k+2]=Math.max(b[k+2],p.point[k]);}const axis=b[2]-b[0]>b[3]-b[1]?0:1;set.sort((a,b)=>a.point[axis]-b.point[axis]||a.point[1-axis]-b.point[1-axis]);const left=Math.floor(n/2),total=set.reduce((s,p)=>s+p.weight,0);let mass=0,cut=1;for(;cut<set.length-1;cut++){mass+=set[cut-1].weight;if(mass>=total*left/n)break;}cut=Math.max(left,Math.min(set.length-(n-left),cut));split(set.slice(0,cut),left);split(set.slice(cut),n-left);};
  split(sampleSet.slice(),Math.min(count,sampleSet.length));return output;
}
function relaxSeeds(points,sampleSet,iterations,config=DEFAULTS){
  const anchors=points.map(p=>p.slice());
  for(let iter=0;iter<iterations;iter++){const index=new PointIndex(points),groups=points.map(()=>[]);for(const p of sampleSet)groups[index.nearest(p.point)[0].id].push(p);
    points=points.map((point,i)=>{const group=groups[i];if(!group.length)return point;let x=0,y=0,w=0;for(const p of group){x+=p.point[0]*p.weight;y+=p.point[1]*p.weight;w+=p.weight;}
      // Retain equal-demand-mass strata and their deterministic offsets. Full
      // unconstrained Lloyd drifts toward sqrt(demand) seed density instead.
      const strength=config.relaxationStrength*config.relaxationDecay**iter;
      const mean=[x/w,y/w].map((v,k)=>point[k]+strength*((1-config.relaxationAnchor)*v+config.relaxationAnchor*anchors[i][k]-point[k]));
      return group.reduce((a,b)=>sq(b.point,mean)<sq(a.point,mean)?b:a).point.slice();});
  }return points;
}
function halfPlane(polygon,a,b){const nx=b[0]-a[0],ny=b[1]-a[1],offset=(b[0]**2+b[1]**2-a[0]**2-a[1]**2)/2;const result=[];
  for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=p[0]*nx+p[1]*ny-offset,dq=q[0]*nx+q[1]*ny-offset;if(dp<=0)result.push(p);if((dp<0&&dq>0)||(dp>0&&dq<0)){const t=dp/(dp-dq);result.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}}
  return result;
}
function voronoiCell(i,points,index,b){
  let cell=[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]];const visited=new Set([i]);
  const clip=j=>{if(visited.has(j))return;visited.add(j);cell=halfPlane(cell,points[i],points[j]);};
  index.nearest(points[i],Math.min(20,points.length)).forEach(n=>clip(n.id));
  // A half-plane violation attains its maximum at a convex cell vertex.
  // This check makes the local-neighbor accelerator exact, not approximate.
  while(cell.length){const missing=new Set();for(const p of cell){const near=index.nearest(p)[0];if(!visited.has(near.id)&&near.d+1e-12<sq(p,points[i]))missing.add(near.id);}if(!missing.size)break;[...missing].sort((a,b)=>a-b).forEach(clip);}
  return cell;
}
function tileMask(component,config){
  const cache=new Map(),size=config.tileSize;
  return box=>{const parts=[];for(let x=Math.floor(box[0]/size);x<=Math.floor(box[2]/size);x++)for(let y=Math.floor(box[1]/size);y<=Math.floor(box[3]/size);y++){
    const key=`${x}:${y}`;if(!cache.has(key)){const ring=[[x*size,y*size],[(x+1)*size,y*size],[(x+1)*size,(y+1)*size],[x*size,(y+1)*size],[x*size,y*size]];cache.set(key,clipping.intersection([component.polygon],[[ring]]));}parts.push(...cache.get(key));
  }return parts;};
}
function partitionComponent(component,config=DEFAULTS){
  if(component.budget===1)return [{id:`${component.id}:seed:00001`,seedId:`${component.id}:seed:00001`,componentId:component.id,seed:planarCentroid(component.polygon),geometry:{type:'Polygon',coordinates:component.polygon}}];
  const seeds=relaxSeeds(seedPoints(component.samples,component.budget,config),component.samples,config.relaxationIterations,config),index=new PointIndex(seeds),mask=tileMask(component,config),features=[];
  const b=component.bounds,projected=[b[0]*component.scale,b[1],b[2]*component.scale,b[3]];
  for(let i=0;i<seeds.length;i++){
    const cell=voronoiCell(i,seeds,index,projected);if(!cell.length)continue;const ring=cell.map(p=>[p[0]/component.scale,p[1]]);ring.push(ring[0]);const geometry={type:'Polygon',coordinates:[ring]},parts=mask(bounds(geometry));
    const clipped=clipping.intersection(parts,[[ring]]);if(!clipped.length)continue;
    const id=`${component.id}:seed:${String(i+1).padStart(5,'0')}`;
    clipped.sort((a,b)=>area([b])-area([a]));
    clipped.forEach((p,j)=>features.push({id:`${id}:part:${j}`,seedId:id,componentId:component.id,seed:[seeds[i][0]/component.scale,seeds[i][1]],fragment:j>0,geometry:{type:'Polygon',coordinates:p}}));
  }return features;
}
module.exports={DEFAULTS,PointIndex,planarCentroid,boundedDensity,componentsFromMask,allocateBudgets,partitionComponent,voronoiCell};
