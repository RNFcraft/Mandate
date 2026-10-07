const clipping=require('polygon-clipping');
const {area,polygons,gridIndex,bounds}=require('./adm2-spatial.cjs');
const {PointIndex,planarCentroid}=require('./gameplay-partition.cjs');
const {distance}=require('./gameplay-provinces.cjs');
function convexStatus(ps,points){
  if(ps.length!==1||ps[0].length!==1)return null;const r=ps[0][0];let sign=0;
  for(let i=0;i<r.length-1;i++){const a=r[i],b=r[(i+1)%(r.length-1)],c=r[(i+2)%(r.length-1)],cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);if(Math.abs(cross)<1e-14)continue;const s=Math.sign(cross);if(sign&&s!==sign)return null;sign=s;}
  if(!sign)return null;let contained=true;
  for(let i=1;i<r.length;i++){const a=r[i-1],b=r[i];let outside=0;for(const p of points){const c=((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))*sign;if(c< -1e-12)outside++;}if(outside===points.length)return 0;if(outside)contained=false;}
  return contained?1:null;
}

function populationTotals(population){const totals=new Map();for(const c of population.cohorts)totals.set(c.territoryId,(totals.get(c.territoryId)||0)+c.count);return totals;}
function densityField(atoms,totals,config={densityGridDegrees:2,densitySmoothingRadius:1}){
  const bins=new Map(),size=config.densityGridDegrees,radius=config.densitySmoothingRadius;
  for(const f of atoms){const ps=polygons(f.geometry),km2=area(ps),largest=ps.reduce((a,b)=>area([a])>area([b])?a:b),p=planarCentroid(largest),key=`${Math.floor(p[0]/size)}:${Math.floor(p[1]/size)}`;if(!bins.has(key))bins.set(key,{area:0,population:0});const bin=bins.get(key);bin.area+=km2;bin.population+=totals.get(f.id)||0;}
  return (x,y)=>{const ix=Math.floor(x/size),iy=Math.floor(y/size);let mass=0,pop=0;for(let dx=-radius;dx<=radius;dx++)for(let dy=-radius;dy<=radius;dy++){const b=bins.get(`${ix+dx}:${iy+dy}`);if(!b)continue;const w=(radius+1-Math.abs(dx))*(radius+1-Math.abs(dy));mass+=b.area*w;pop+=b.population*w;}return mass?pop/mass:0;};
}
function apportion(total,rows){
  const sum=rows.reduce((s,r)=>s+r.overlapAreaKm2,0);let assigned=0;
  for(const r of rows){r.allocationFraction=sum?r.overlapAreaKm2/sum:1/rows.length;const exact=total*r.allocationFraction;r.population=Math.floor(exact);r.remainder=exact-r.population;assigned+=r.population;}
  const order=[...rows].sort((a,b)=>b.remainder-a.remainder||(a.provinceId<b.provinceId?-1:1));for(let i=0;i<total-assigned;i++)order[i%order.length].population++;
  rows.forEach(r=>delete r.remainder);return rows;
}
function atomicOverlay(atoms,provinces,totals,log=()=>{}){
  const query=gridIndex(provinces,2),centers=provinces.map(f=>planarCentroid(polygons(f.geometry).reduce((a,b)=>area([a])>area([b])?a:b)));
  const copies=centers.flatMap((p,i)=>[-360,0,360].map(offset=>({point:[p[0]+offset,p[1]],id:i}))),nearest=new PointIndex(copies.map(p=>p.point));
  const mapping={},sums=new Map(provinces.map(p=>[p.id,{population:0,atomCount:0,uncoveredAssignments:0}])),uncovered=[],tileCache=new Map(),tileFallbacks=[];let tested=0,partial=0,inputTotal=0,exactContainments=0,separatingAxisSkips=0;
  const localGeometry=(province,b)=>{const ps=polygons(province.geometry);if(b[2]-b[0]>3||b[3]-b[1]>3||ps.reduce((s,p)=>s+p.reduce((s,r)=>s+r.length,0),0)<30)return ps;
    const parts=[];for(let x=Math.floor(b[0]/2);x<=Math.floor(b[2]/2);x++)for(let y=Math.floor(b[1]/2);y<=Math.floor(b[3]/2);y++){const key=`${province.id}:${x}:${y}`;if(!tileCache.has(key)){const square=[[[x*2,y*2],[x*2+2,y*2],[x*2+2,y*2+2],[x*2,y*2+2],[x*2,y*2]]];tileCache.set(key,clipping.intersection(ps,[square]));}parts.push(...tileCache.get(key));}return parts;};
  for(let i=0;i<atoms.length;i++){
    const f=atoms[i],ps=polygons(f.geometry),km2=area(ps),rows=[],points=ps.flat(2);
    for(const p of query(bounds(f.geometry))){tested++;const status=convexStatus(polygons(p.geometry),points);if(status===0){separatingAxisSkips++;continue;}if(status===1)exactContainments++;
      let overlapAreaKm2=km2;
      if(status!==1){try{overlapAreaKm2=area(clipping.intersection(ps,localGeometry(p,bounds(f.geometry))));}catch(error){
        // The cached tile accelerator can expose near-collinear numerical
        // degeneracies. Retry the original, unmodified vector polygons; if
        // that also fails, generation fails rather than inventing an overlap.
        overlapAreaKm2=area(clipping.intersection(ps,polygons(p.geometry)));tileFallbacks.push({atomId:f.id,provinceId:p.id,reason:error.message});
      }}
      if(overlapAreaKm2>1e-10)rows.push({provinceId:p.id,overlapAreaKm2,areaFraction:km2?overlapAreaKm2/km2:0});}
    rows.sort((a,b)=>a.provinceId<b.provinceId?-1:1);const total=totals.get(f.id)||0;inputTotal+=total;
    const covered=rows.reduce((s,r)=>s+r.overlapAreaKm2,0);
    if(covered<km2*.999)partial++;
    if(!rows.length){
      // Natural Earth and the atomic substrate have different shorelines and
      // island inventories. Do not fabricate an intersection for absent land.
      const point=planarCentroid(ps.reduce((a,b)=>area([a])>area([b])?a:b));const candidates=nearest.nearest(point,24).map(r=>copies[r.id].id);const id=candidates.reduce((a,b)=>distance(point,centers[b])<distance(point,centers[a])?b:a);
      rows.push({provinceId:provinces[id].id,overlapAreaKm2:0,areaFraction:0,fallback:'outside-clean-mask-nearest-province'});
      uncovered.push({atomId:f.id,population:total,areaKm2:km2,provinceId:provinces[id].id,distanceKm:distance(point,centers[id])});
    }
    apportion(total,rows);mapping[f.id]={areaKm2:km2,coveredAreaKm2:covered,intersections:rows};
    for(const row of rows){const s=sums.get(row.provinceId);s.population+=row.population;s.atomCount+=row.overlapAreaKm2>0?1:0;s.uncoveredAssignments+=row.fallback?1:0;}
    if((i+1)%5000===0)log(`Overlay ${i+1}/${atoms.length} (${tested} bbox-filtered intersections)`);
  }
  return {mapping,sums,qa:{atomCount:atoms.length,testedIntersections:tested,exactContainments,separatingAxisSkips,overlayTileFallbacks:tileFallbacks,partiallyCoveredAtoms:partial,uncoveredAtoms:uncovered,populationInputTotal:inputTotal,populationOutputTotal:[...sums.values()].reduce((s,r)=>s+r.population,0)}};
}
module.exports={populationTotals,densityField,apportion,atomicOverlay};
