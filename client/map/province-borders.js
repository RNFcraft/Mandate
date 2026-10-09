import {mesh} from 'topojson-client';
import {path} from './geometry.js';
// Both edge classification and fills use the same runtime ownership authority.
export function updateProvincePolitics(map,topology,regions){
  const object=topology.objects.provinces,owners=map.model.owners;
  const ownerKey=JSON.stringify([...owners]),colorKey=JSON.stringify([...map.model.countries].map(([id,c])=>[id,c.color]));
  if(map.ownerKey===ownerKey){
    if(map.colorKey!==colorKey){map.colorKey=colorKey;map.politicalGeneration=(map.politicalGeneration||0)+1;map.background?.canvas.close?.();map.background=null;map.setRasterScene?.();}
    map.invalidate();return;
  }
  map.ownerKey=ownerKey;map.colorKey=colorKey;
  map.politicalFeatures=regions.map(r=>({...r,owner:owners.get(r.id)??null}));
  // One Canvas fill per owner avoids antialias seams between equal-owner cells.
  // addPath only batches existing paths: no geometry merge or GIS operation.
  const fills=new Map();
  for(const r of map.politicalFeatures){
    let fill=fills.get(r.owner);
    if(!fill){fill={owner:r.owner,path:new Path2D(),bounds:[[Infinity,Infinity],[-Infinity,-Infinity]]};fills.set(r.owner,fill);}
    fill.path.addPath(r.path);
    for(let axis=0;axis<2;axis++){fill.bounds[0][axis]=Math.min(fill.bounds[0][axis],r.bounds[0][axis]);fill.bounds[1][axis]=Math.max(fill.bounds[1][axis],r.bounds[1][axis]);}
  }
  map.provinceFills=[...fills.values()];
  const border=mesh(topology,object,(a,b)=>a!==b&&(owners.get(a.id)??null)!==(owners.get(b.id)??null));
  const internal=mesh(topology,object,(a,b)=>a!==b&&(owners.get(a.id)??null)===(owners.get(b.id)??null));
  map.politicalBorders=border;
  map.borderSVG={province:path(internal),political:path(border),coastline:map.borderSVG?.coastline||path(mesh(topology,topology.objects.land))};
  map.classifiedBorders=Object.fromEntries(Object.entries(map.borderSVG).map(([k,v])=>[k,new Path2D(v)]));
  map.setRasterScene?.();
  map.ownershipBorders=map.classifiedBorders.political;map.politicalGeneration=(map.politicalGeneration||0)+1;map.politicalPending=false;map.background?.canvas.close?.();map.background=null;map.invalidate();
}
