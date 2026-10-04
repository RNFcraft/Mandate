import {feature,mesh} from 'topojson-client';
import {prepare,path} from './geometry.js';
const CLOSE=8,MAX_CHUNKS=128,MAX_BYTES=12*1024*1024;
export class TerritoryLOD {
  constructor(map,manifest){
    this.map=map;this.manifest=manifest;this.cache=new Map();this.pending=new Map();this.needed=new Set();this.active=[];
    this.requests=0;this.cacheHits=0;this.bytes=0;this.level='far';this.error=null;this.failed=new Set();
  }
  update(){
    const m=this.map;this.level=m.zoom>=CLOSE?'close':m.zoom>=2.5?'medium':'far';
    const view=[...m.screenToWorld(0,m.height),...m.screenToWorld(m.width,0)];
    const box=[view[0]-180,90-view[1],view[2]-180,90-view[3]];
    let wanted=this.level==='close'?this.manifest.chunks.filter(c=>c.bounds[2]>=box[0]&&c.bounds[0]<=box[2]&&c.bounds[3]>=box[1]&&c.bounds[1]<=box[3]):[];
    const cx=(box[0]+box[2])/2,cy=(box[1]+box[3])/2;
    wanted.sort((a,b)=>Math.hypot((a.bounds[0]+a.bounds[2])/2-cx,(a.bounds[1]+a.bounds[3])/2-cy)-Math.hypot((b.bounds[0]+b.bounds[2])/2-cx,(b.bounds[1]+b.bounds[3])/2-cy));
    const count=wanted.length;let budget=0;
    wanted=wanted.filter((c,i)=>{if(i>=MAX_CHUNKS||budget+c.bytes>MAX_BYTES)return false;budget+=c.bytes;return true;});this.deferred=count-wanted.length;
    const key=this.level+':'+wanted.map(c=>c.id).join(',');if(key===this.viewKey)return;this.viewKey=key;this.failed.clear();
    this.wanted=wanted;this.needed=new Set(wanted.map(c=>c.id));
    for(const [id,request]of this.pending)if(!this.needed.has(id))request.controller.abort();
    this.sync();this.pump();
  }
  pump(){
    if(this.level!=='close')return;
    for(const c of this.wanted){
      if(this.cache.has(c.id)||this.pending.has(c.id)||this.failed.has(c.id))continue;
      if(this.pending.size>=4)break;
      const controller=new AbortController();this.pending.set(c.id,{controller});this.requests++;
      fetch(`/data/adm2/chunks/${c.id}.json`,{signal:controller.signal}).then(async response=>{
        if(!response.ok)throw new Error(`ADM2 chunk ${c.id}: ${response.status}`);
        const t=await response.json();if(controller.signal.aborted||!this.needed.has(c.id))return;
        const start=performance.now();
        const regions=feature(t,t.objects.territories).features.filter(f=>f.geometry).map(prepare);
        const dependencies=new Set(t.neighbors.flatMap(ids=>ids.map(index=>typeof index==='number'?this.map.model.hierarchy.territories[index].id:index)));
        const entry={regions,topology:t,bytes:c.bytes,dependencies,politicalDirty:true};
        this.detailBorders(entry);
        this.cache.set(c.id,entry);this.bytes+=c.bytes;this.evict();this.sync();this.map.invalidate();
        this.maxCompileMs=Math.max(this.maxCompileMs||0,performance.now()-start);
      }).catch(error=>{if(error.name!=='AbortError'){this.failed.add(c.id);this.error=error.message;this.map.canvas.dispatchEvent(new CustomEvent('maperror',{detail:error.message}));}}).finally(()=>{this.pending.delete(c.id);this.pump();});
    }
  }
  evict(){
    while(this.cache.size>MAX_CHUNKS||this.bytes>MAX_BYTES){
      const id=[...this.cache.keys()].find(id=>!this.needed.has(id));if(!id)break;
      this.bytes-=this.cache.get(id).bytes;this.cache.delete(id);
    }
  }
  sync(){
    this.active=[];
    for(const c of this.wanted||[]){const entry=this.cache.get(c.id);if(!entry)continue;
      this.cache.delete(c.id);this.cache.set(c.id,entry);this.active.push(entry);
    }
    if(this.level!=='close')this.active=[];
    this.map.setInteractive(this.level==='close'?this.active.flatMap(c=>c.regions):this.map.geometry.regions);
    this.evict();this.map.canvas.dispatchEvent(new CustomEvent('lodchange',{detail:this.stats()}));
  }
  detailBorders(entry){
    if(entry.politicalDirty){
      const t=entry.topology;
      // mesh includes each shared arc once, not thousands of overlaid polygon strokes.
      entry.internal ||= new Path2D(path(mesh(t,t.objects.territories)));
      const arcs=[];
      if(t.neighbors)for(let i=0;i<t.neighbors.length;i++){
        const ids=t.neighbors[i].map(index=>typeof index==='number'?this.map.model.hierarchy.territories[index].id:index),owner=this.map.model.owners.get(ids[0]);
        // Offline adjacency also records reserve overlaps; equal owners remain administrative.
        if(ids.length===1||ids.some(id=>this.map.model.owners.get(id)!==owner))arcs.push([i]);
      }
      entry.political=new Path2D(path(t.neighbors?feature(t,{type:'MultiLineString',arcs}).geometry:mesh(t,t.objects.territories,(a,b)=>a!==b&&this.map.model.owners.get(a.id)!==this.map.model.owners.get(b.id))));
      entry.politicalDirty=false;
    }
    return entry;
  }
  invalidateOwnership(ids){
    const changed=ids===null?null:new Set(ids);
    for(const entry of this.cache.values())if(changed===null||[...entry.dependencies].some(id=>changed.has(id)))entry.politicalDirty=true;
  }
  stats(){return {level:this.level,requests:this.requests,activeChunks:this.active.length,activeTerritories:this.active.reduce((n,c)=>n+c.regions.length,0),cachedChunks:this.cache.size,cacheBytes:this.bytes,pending:this.pending.size,needed:this.needed.size,deferred:this.deferred||0,error:this.error,maxCompileMs:this.maxCompileMs||0,maxIndexMs:this.map.maxIndexMs||0};}
}
