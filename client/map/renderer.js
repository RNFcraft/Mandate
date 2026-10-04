const PIXEL = 2;
export class WorldMap {
  constructor(canvas, geometry, model) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.geometry = geometry; this.model = model; this.layers = [];
    this.hoveredId = null; this.selectedId = null; this.zoom = 1;
    this.frames = 0; this.lastRenderMs = 0;
    this.setInteractive(geometry.regions);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
  }
  setInteractive(regions) {
    const start=performance.now();
    this.interactive=regions;
    this.grid = new Map();
    for (const r of regions) {
      const [[x0,y0],[x1,y1]] = r.bounds;
      for (let x=Math.floor(x0/5);x<=Math.floor(x1/5);x++) for(let y=Math.floor(y0/5);y<=Math.floor(y1/5);y++) {
        const key=`${x},${y}`; if(!this.grid.has(key)) this.grid.set(key, []); this.grid.get(key).push(r);
      }
    }
    if(this.lod?.level==='close' && !regions.some(r=>r.id===this.hoveredId))this.hoveredId=null;
    this.maxIndexMs=Math.max(this.maxIndexMs||0,performance.now()-start);
  }
  resize() {
    const oldWidth=this.width, oldHeight=this.height;
    const center=oldWidth ? this.screenToWorld(oldWidth/2,oldHeight/2) : [180,90];
    this.width=innerWidth; this.height=innerHeight;
    this.canvas.width=Math.ceil(this.width/PIXEL); this.canvas.height=Math.ceil(this.height/PIXEL);
    this.baseScale=Math.min(this.width/360,this.height/180)*0.96;
    this.scale=this.baseScale*this.zoom;
    this.x=this.width/2-center[0]*this.scale; this.y=this.height/2-center[1]*this.scale;
    this.invalidate();
  }
  screenToWorld(x,y) { return [(x-this.x)/this.scale,(y-this.y)/this.scale]; }
  hit(x,y) {
    const [wx,wy]=this.screenToWorld(x,y);
    const list=this.grid.get(`${Math.floor(wx/5)},${Math.floor(wy/5)}`)||[];
    const ctx=this.ctx; ctx.save(); ctx.resetTransform();
    const region=list.find(r => wx>=r.bounds[0][0] && wx<=r.bounds[1][0] && wy>=r.bounds[0][1] && wy<=r.bounds[1][1] && ctx.isPointInPath(r.path,wx,wy,'evenodd'));
    ctx.restore(); return region?.id || null;
  }
  invalidate() {
    if(this.pending) return;
    this.pending=true;
    requestAnimationFrame(()=>{this.pending=false;this.render();});
  }
  addLayer(layer) { this.layers.push(layer); this.invalidate(); return ()=>{this.layers=this.layers.filter(l=>l!==layer);this.invalidate();}; }
  render() {
    const start=performance.now();
    this.lod?.update();
    const ctx=this.ctx;
    ctx.resetTransform();ctx.fillStyle='#182c39';ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
    ctx.setTransform(this.canvas.width/this.width*this.scale,0,0,this.canvas.height/this.height*this.scale,this.x*this.canvas.width/this.width,this.y*this.canvas.height/this.height);
    const visible=r=>r.bounds[1][0]*this.scale+this.x>=0 && r.bounds[0][0]*this.scale+this.x<=this.width && r.bounds[1][1]*this.scale+this.y>=0 && r.bounds[0][1]*this.scale+this.y<=this.height;
    const detailReady=this.lod?.level==='close'&&this.lod.active.length===this.lod.needed.size&&!this.lod.deferred;
    for(const c of this.geometry.countries) if(visible(c)) {ctx.fillStyle='#727c78';ctx.fill(c.path,'evenodd');}
    if(!detailReady)for(const r of this.politicalFeatures||[])if(visible(r)){ctx.fillStyle=this.model.countries.get(r.owner)?.color||'#727c78';ctx.fill(r.path,'evenodd');}
    if(this.lod?.level==='close')for(const chunk of this.lod.active)for(const r of chunk.regions)if(visible(r)){ctx.fillStyle=this.model.countries.get(this.model.owners.get(r.id))?.color||'#727c78';ctx.fill(r.path,'evenodd');}
    for(const r of this.interactive||[])if(visible(r)&&(r.id===this.selectedId||r.id===this.hoveredId)){ctx.fillStyle=r.id===this.selectedId?'rgba(255,226,164,0.38)':'rgba(255,247,217,0.19)';ctx.fill(r.path,'evenodd');}
    ctx.lineJoin='round';
    if(this.lod?.level!=='far'){
      ctx.strokeStyle='#394b4b';ctx.lineWidth=0.65/this.scale;
      if(this.lod?.level==='close'){for(const r of this.geometry.regions)if(visible(r))ctx.stroke(r.path);}
      else ctx.stroke(this.geometry.regionalBorders);
    }
    if(this.lod?.level==='close')for(const chunk of this.lod.active){const borders=this.lod.detailBorders(chunk);ctx.strokeStyle='#475552';ctx.lineWidth=.5/this.scale;ctx.stroke(borders.internal);}
    ctx.strokeStyle='#202d32';ctx.lineWidth=2.2/this.scale;if(this.ownershipBorders&&!this.politicalPending&&this.lod?.level!=='close')ctx.stroke(this.ownershipBorders);
    if(this.lod?.level==='close')for(const chunk of this.lod.active){ctx.stroke(this.lod.detailBorders(chunk).political);}
    const selected=(this.interactive||[]).find(r=>r.id===this.selectedId);
    if(selected){ctx.strokeStyle='#e5c990';ctx.lineWidth=2/this.scale;ctx.stroke(selected.path);}
    for(const layer of this.layers) {ctx.save();layer(ctx,this);ctx.restore();}
    this.lastRenderMs=performance.now()-start;this.frames++;
  }
  bindInput() {
    const canvas=this.canvas;
    canvas.addEventListener('contextmenu',e=>{if(this.editorGesture)e.preventDefault();});
    canvas.addEventListener('pointerdown', e=>{
      if(this.drag) return;
      if(e.button===0 && this.editorGesture && this.editMode!=='pan') {
        this.drag={id:e.pointerId,painting:true,lastX:e.clientX,lastY:e.clientY};
        canvas.setPointerCapture(e.pointerId);this.editorGesture('begin',this.hit(e.clientX,e.clientY));return;
      }
      if(e.button!==0 && !(this.editorGesture && (e.button===1 || e.button===2)))return;
      this.drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,x:this.x,y:this.y,moved:false};
      canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');
    });
    canvas.addEventListener('pointermove',e=>{
      if(this.drag && e.pointerId===this.drag.id) {
        if(this.drag.painting){
          const dx=e.clientX-this.drag.lastX,dy=e.clientY-this.drag.lastY,steps=Math.ceil(Math.hypot(dx,dy)/3);
          for(let i=1;i<=steps;i++)this.editorGesture('paint',this.hit(this.drag.lastX+dx*i/steps,this.drag.lastY+dy*i/steps));
          this.drag.lastX=e.clientX;this.drag.lastY=e.clientY;this.hoveredId=this.hit(e.clientX,e.clientY);this.invalidate();return;
        }
        const dx=e.clientX-this.drag.startX,dy=e.clientY-this.drag.startY;
        this.drag.moved ||= Math.hypot(dx,dy)>4;
        if(this.drag.moved){this.x=this.drag.x+dx;this.y=this.drag.y+dy;this.hoveredId=null;this.invalidate();}
      } else {const id=this.hit(e.clientX,e.clientY);if(id!==this.hoveredId){this.hoveredId=id;this.invalidate();}}
    });
    canvas.addEventListener('pointerup',e=>{
      if(!this.drag || e.pointerId!==this.drag.id)return;
      if(this.drag.painting){this.editorGesture('end');this.drag=null;canvas.releasePointerCapture(e.pointerId);this.invalidate();return;}
      if(!this.drag.moved){this.selectedId=this.hit(e.clientX,e.clientY);canvas.dispatchEvent(new CustomEvent('regionselect',{detail:{regionId:this.selectedId}}));}
      this.drag=null;canvas.classList.remove('dragging');canvas.releasePointerCapture(e.pointerId);
      this.hoveredId=this.hit(e.clientX,e.clientY);this.invalidate();
    });
    const cancel=()=>{if(this.drag?.painting)this.editorGesture('end');this.drag=null;canvas.classList.remove('dragging');this.invalidate();};
    canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);
    canvas.addEventListener('pointerleave',()=>{this.hoveredId=null;this.invalidate();});
    canvas.addEventListener('wheel',e=>{
      e.preventDefault();if(this.drag)return;
      const anchor=this.screenToWorld(e.clientX,e.clientY);
      const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?this.height:1);
      this.zoom=Math.max(1,Math.min(64,this.zoom*Math.exp(-Math.max(-500,Math.min(500,delta))*0.0015)));
      this.scale=this.baseScale*this.zoom;this.x=e.clientX-anchor[0]*this.scale;this.y=e.clientY-anchor[1]*this.scale;
      this.hoveredId=this.hit(e.clientX,e.clientY);this.invalidate();
    },{passive:false});
  }
}
