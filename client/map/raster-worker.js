// Disposable presentation cache. Never receives or mutates GameState.
let scene,geometry;
self.onmessage=({data})=>{
  try{
    if(data.type==='geometry'){
      const parse=r=>({bounds:r.bounds,path:new Path2D(r.svg)});geometry={land:data.land.map(parse),regions:new Map(data.regions.map(r=>[r.id,parse(r)]))};return;
    }
    if(data.type==='scene'){
      const groups=new Map();for(const [id,owner,color]of data.owners){const r=geometry.regions.get(id);let group=groups.get(owner);if(!group){group={color,path:new Path2D(),bounds:[[Infinity,Infinity],[-Infinity,-Infinity]]};groups.set(owner,group);}group.path.addPath(r.path);for(let axis=0;axis<2;axis++){group.bounds[0][axis]=Math.min(group.bounds[0][axis],r.bounds[0][axis]);group.bounds[1][axis]=Math.max(group.bounds[1][axis],r.bounds[1][axis]);}}
      scene={land:geometry.land,fills:[...groups.values()],borders:Object.fromEntries(Object.entries(data.borders).map(([k,v])=>[k,new Path2D(v)]))};return;
    }
    const {camera,id}=data,{width,height,scale,x,y,rx,ry,pad,level,key}=camera;
    const canvas=new OffscreenCanvas(Math.ceil(width*rx)+pad*2,Math.ceil(height*ry)+pad*2),c=canvas.getContext('2d');
    c.fillStyle='#182c39';c.fillRect(0,0,canvas.width,canvas.height);c.setTransform(rx*scale,0,0,ry*scale,x*rx+pad,y*ry+pad);
    const bounds=[(-pad/rx-x)/scale,(-pad/ry-y)/scale,(width+pad/rx-x)/scale,(height+pad/ry-y)/scale];
    const visible=r=>r.bounds[1][0]>=bounds[0]&&r.bounds[0][0]<=bounds[2]&&r.bounds[1][1]>=bounds[1]&&r.bounds[0][1]<=bounds[3];
    for(const r of scene.land)if(visible(r)){c.fillStyle='#727c78';c.fill(r.path,'evenodd');}
    if(!camera.audit)for(const r of scene.fills)if(visible(r)){c.fillStyle=r.color;c.fill(r.path,'evenodd');}
    c.lineJoin='round';const styles={province:['#475552',.55],political:['#202d32',2.2],coastline:['#202d32',1.3]};
    for(const [name,path]of Object.entries(scene.borders)){if(level==='far'&&name==='province')continue;const [color,width]=styles[name];c.strokeStyle=color;c.lineWidth=width/scale;c.stroke(path);}
    const bitmap=canvas.transferToImageBitmap();self.postMessage({id,key,bitmap,bounds,scale,x,y,pad,overview:camera.overview||false},[bitmap]);
  }catch(error){self.postMessage({error:error.message,id:data.id});}
};
