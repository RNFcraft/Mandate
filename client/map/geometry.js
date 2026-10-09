import {geoArea,geoEquirectangular,geoPath} from 'd3-geo';
export const projection=geoEquirectangular().scale(180/Math.PI).translate([180,90]).precision(.05);
export const path=geoPath(projection);
export function prepare(f){
  const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  for(const rings of polygons)if(geoArea({type:'Polygon',coordinates:rings})>2*Math.PI)rings.forEach(r=>r.reverse());
  const svg=path(f);
  return {id:f.id,path:new Path2D(svg),svg,bounds:path.bounds(f),feature:f};
}

// Scan the projected path, including clipping at the date line and holes.
// Even-odd scanline intervals always provide interior candidates, unlike a
// centroid (which can fall in a hole, ocean or between islands).
export function interiorAnchors(region,count=24){
  if(region.anchorCache?.has(count))return region.anchorCache.get(count);
  const rings=[];let ring;
  // Use the exact rounded coordinates consumed by Path2D, so candidates near
  // a coast cannot disagree with the map because of SVG serialization precision.
  const tokens=(region.svg||path(region.feature)).match(/[MLZ]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi)||[];
  for(let i=0;i<tokens.length;){
    const command=tokens[i++];
    if(command==='M'){ring=[[Number(tokens[i++]),Number(tokens[i++])]];rings.push(ring);}
    else if(command==='L')ring.push([Number(tokens[i++]),Number(tokens[i++])]);
  }
  const edges=rings.flatMap(r=>r.map((p,i)=>[p,r[(i+1)%r.length]]));
  const [[x0,y0],[x1,y1]]=region.bounds,ys=[(y0+y1)/2];
  for(let i=0;i<32;i++)ys.push(y0+(y1-y0)*(i+.5)/32);
  // A small island can lie between grid rows. Include each ring's vertical
  // midpoint without scanning every vertex ordinate against every edge.
  for(const r of rings){let lo=Infinity,hi=-Infinity;for(const p of r){lo=Math.min(lo,p[1]);hi=Math.max(hi,p[1]);}if(hi>lo)ys.push((lo+hi)/2);}
  const candidates=[];
  for(const y of ys){
    const xs=[];
    for(const [[ax,ay],[bx,by]]of edges)if((ay>y)!==(by>y))xs.push(ax+(y-ay)*(bx-ax)/(by-ay));
    xs.sort((a,b)=>a-b);
    for(let i=0;i+1<xs.length;i+=2)if(xs[i+1]>xs[i]){
      const width=xs[i+1]-xs[i];
      for(const t of [.5,.25,.75])candidates.push({point:[xs[i]+width*t,y],room:width*Math.min(t,1-t)});
    }
  }
  candidates.sort((a,b)=>b.room-a.room||a.point[1]-b.point[1]||a.point[0]-b.point[0]);
  // Keep work bounded after scanline generation; select well-spaced anchors.
  const pool=candidates.slice(0,2048),selected=[];
  if(pool.length)selected.push(pool.shift().point);
  while(selected.length<count&&pool.length){
    let best=-1,score=-1;
    for(let i=0;i<pool.length;i++){
      const p=pool[i].point,d=Math.min(...selected.map(q=>(p[0]-q[0])**2+(p[1]-q[1])**2));
      if(d>score){score=d;best=i;}
    }
    if(score<=1e-16)break;selected.push(pool.splice(best,1)[0].point);
  }
  (region.anchorCache??=new Map()).set(count,selected);return selected;
}
