// Audit only. Area-weighted centroid in cylindrical equal-area coordinates,
// returned as longitude/latitude. Ring winding does not affect hole subtraction.
const {polygons}=require('./adm2-spatial.cjs');
function auditCentroid(geometry){
  const parts=polygons(geometry),anchor=parts[0]?.[0]?.[0];
  if(!anchor)throw Error('Empty audit centroid geometry');
  const [originLon,originLat]=anchor,originY=Math.sin(originLat*Math.PI/180);
  let weight=0,momentX=0,momentY=0;
  for(const part of parts)for(let j=0;j<part.length;j++){
    const ring=part[j],points=[];let previous=originLon;
    for(const [longitude,latitude]of ring){
      const lon=longitude+360*Math.round((previous-longitude)/360);previous=lon;
      points.push([lon-originLon,Math.sin(latitude*Math.PI/180)-originY]);
    }
    let twiceArea=0,xMoment=0,yMoment=0;
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],cross=a[0]*b[1]-b[0]*a[1];
      twiceArea+=cross;xMoment+=(a[0]+b[0])*cross;yMoment+=(a[1]+b[1])*cross;
    }
    if(!twiceArea)continue;
    const ringWeight=(j===0?1:-1)*Math.abs(twiceArea);
    weight+=ringWeight;momentX+=ringWeight*xMoment/(3*twiceArea);momentY+=ringWeight*yMoment/(3*twiceArea);
  }
  if(!(weight>0)||![weight,momentX,momentY].every(Number.isFinite))throw Error('Invalid audit centroid geometry');
  const lon=originLon+momentX/weight,lat=Math.asin(Math.max(-1,Math.min(1,originY+momentY/weight)))*180/Math.PI;
  return [((lon+180)%360+360)%360-180,lat];
}
module.exports={auditCentroid};
