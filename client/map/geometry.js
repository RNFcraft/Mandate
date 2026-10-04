import {geoArea,geoEquirectangular,geoPath} from 'd3-geo';
export const projection=geoEquirectangular().scale(180/Math.PI).translate([180,90]).precision(.05);
export const path=geoPath(projection);
export function prepare(f){
  const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  for(const rings of polygons)if(geoArea({type:'Polygon',coordinates:rings})>2*Math.PI)rings.forEach(r=>r.reverse());
  return {id:f.id,path:new Path2D(path(f)),bounds:path.bounds(f)};
}
