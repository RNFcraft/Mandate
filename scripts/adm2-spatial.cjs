// Offline geometry diagnostics. Areas use a cylindrical equal-area transform.
const clipping = require('polygon-clipping');
const polygons = g => g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
function bounds(g) {
  const b=[Infinity,Infinity,-Infinity,-Infinity];
  for(const p of polygons(g))for(const r of p)for(const [x,y] of r){b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);}
  return b;
}
const intersects=(a,b)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
function area(mp){
  let total=0;
  for(const p of mp)for(let j=0;j<p.length;j++){
    const ring=p[j];let sum=0;
    for(let i=1;i<ring.length;i++)sum+=(ring[i-1][0]*Math.PI/180)*Math.sin(ring[i][1]*Math.PI/180)-(ring[i][0]*Math.PI/180)*Math.sin(ring[i-1][1]*Math.PI/180);
    total+=(j===0?1:-1)*Math.abs(sum)*6371.0088**2/2;
  }
  return Math.max(0,total);
}
function gridIndex(features, size=5){
  const grid=new Map();
  for(const f of features){f.bounds=bounds(f.geometry);for(let x=Math.floor(f.bounds[0]/size);x<=Math.floor(f.bounds[2]/size);x++)for(let y=Math.floor(f.bounds[1]/size);y<=Math.floor(f.bounds[3]/size);y++){const k=`${x},${y}`;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(f);}}
  return b=>{const found=new Map();for(let x=Math.floor(b[0]/size);x<=Math.floor(b[2]/size);x++)for(let y=Math.floor(b[1]/size);y<=Math.floor(b[3]/size);y++)for(const f of grid.get(`${x},${y}`)||[])if(intersects(b,f.bounds))found.set(f.id,f);return [...found.values()].sort((a,c)=>a.id.localeCompare(c.id,'en'));};
}
function intersection(a,b){return clipping.intersection(polygons(a),polygons(b));}
const COUNTRY_ALIASES={XKX:'KOS',SSD:'SDS'};
const countryOf=code=>COUNTRY_ALIASES[code]||code;
function assess(g,candidates,country,owners){
  const total=area(polygons(g)),scores=[],b=bounds(g);
  for(const f of candidates)if(owners[f.id]===country){const overlap=area(intersection(g,f.geometry));if(overlap>1e-8)scores.push({id:f.id,share:Math.min(1,total?overlap/total:0)});}
  scores.sort((a,b)=>b.share-a.share||a.id.localeCompare(b.id,'en'));
  const top=scores[0],runner=scores[1],margin=Math.max(0,(top?.share||0)-(runner?.share||0));
  return {scores,margin,strong:b[2]-b[0]<=180&&top?.share>=.995&&(runner?.share||0)<=.001&&margin>=.994};
}
module.exports={polygons,bounds,area,intersects,gridIndex,intersection,COUNTRY_ALIASES,countryOf,assess};
