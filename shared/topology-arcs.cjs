// Subset a topology without modifying any coordinates.
function remap(topology,objects,neighbors){
  const map=new Map(),arcs=[];
  const visit=value=>Array.isArray(value)?value.map(visit):(()=>{const n=value<0?~value:value;if(!map.has(n)){map.set(n,arcs.length);arcs.push(topology.arcs[n]);}const id=map.get(n);return value<0?~id:id;})();
  const out={type:'Topology',transform:topology.transform,objects:{},arcs};
  for(const [name,geometries]of Object.entries(objects))out.objects[name]={type:'GeometryCollection',geometries:geometries.map(g=>({...g,arcs:visit(g.arcs)}))};
  if(neighbors){out.neighbors=[...map.keys()].map(i=>neighbors[i]);out.arcIds=[...map.keys()];}
  else out.sourceArcIds=[...map.keys()];
  return out;
}
module.exports={remap};
