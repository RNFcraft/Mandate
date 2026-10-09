import visuals from './economy-visuals.json';
import {interiorAnchors} from './geometry.js';

const compare=(a,b)=>a<b?-1:a>b?1:0;
const imageCache=new Map();
function imageFor(url,invalidate){
  if(!imageCache.has(url)){
    const image=new Image(),entry={image,status:'loading',listeners:new Set()};imageCache.set(url,entry);
    image.onload=()=>{entry.status='ready';for(const fn of entry.listeners)fn();entry.listeners.clear();};
    image.onerror=()=>{entry.status='failed';for(const fn of entry.listeners)fn();entry.listeners.clear();};image.src=url;
  }
  const entry=imageCache.get(url);if(entry.status==='loading')entry.listeners.add(invalidate);return entry;
}

export class EconomyLayer {
  constructor(map,simulation,{recipeSprites={}}={}){
    this.map=map;this.simulation=simulation;this.recipeSprites={...visuals.recipes,...recipeSprites};
    this.regions=new Map(map.geometry.regions.map(r=>[r.id,r]));this.anchors=new Map();this.enabled=true;
    this.objects=[];this.grid=new Map();this.layout=[];this.revision=0;this.maxVisible=120;
    this.invalidate=()=>map.invalidate();
    this.control=document.createElement('section');this.control.className='economy-control';
    this.toggle=document.createElement('button');this.toggle.id='economy-toggle';this.toggle.onclick=()=>{this.enabled=!this.enabled;this.panel.hidden=true;this.updateToggle();this.layoutKey=null;map.invalidate();};
    this.control.append(this.toggle);document.body.append(this.control);
    this.panel=map.inspector?map.inspector.panel('enterprise','economy-info'):document.createElement('section');this.panel.id='economy-info';this.panel.hidden=true;this.panel.setAttribute('aria-label','Economic object');if(!map.inspector)document.body.append(this.panel);else map.inspector.panels.set('market',this.panel);
    this.removeLayer=map.addLayer((ctx)=>this.draw(ctx));
    this.previousSelect=map.objectSelect;map.objectSelect=(x,y)=>this.selectAt(x,y)||this.previousSelect?.(x,y);
    this.unsubscribe=simulation.subscribe(event=>{if(simulation.worker?event.type==='viewUpdated':['economyUpdated','gameLoaded'].includes(event.type))this.refresh();});
    this.refresh();
  }
  updateToggle(){this.control.hidden=!this.objects.length;this.toggle.textContent=`Economic objects: ${this.enabled?'Show':'Hide'}`;this.toggle.setAttribute('aria-pressed',String(this.enabled));}
  refresh(){
    this.state=this.simulation.economyView?.()||this.simulation.economySummary();const objects=[];
    if(this.state&&this.byKey&&this.objects.length===this.state.enterprises.length+this.state.markets.length&&this.state.enterprises.every(e=>this.byKey.has('enterprise:'+e.id))&&this.state.markets.every(m=>this.byKey.has('market:'+m.id))){
      for(const record of this.state.enterprises)this.byKey.get('enterprise:'+record.id).record=record;
      for(const record of this.state.markets)this.byKey.get('market:'+record.id).record=record;
      this.updatePanel();this.map.invalidate();return;
    }
    if(this.state){
      for(const record of this.state.enterprises)objects.push({key:'enterprise:'+record.id,kind:'enterprise',id:record.id,provinceId:record.provinceId,sprite:this.recipeSprites[record.recipeId]||null,record});
      for(const record of this.state.markets)objects.push({key:'market:'+record.id,kind:'market',id:record.id,provinceId:[...record.provinceIds].sort(compare)[0],sprite:'market',record});
    }
    objects.sort((a,b)=>compare(a.provinceId,b.provinceId)||compare(a.key,b.key));
    const groups=new Map();for(const object of objects){if(!groups.has(object.provinceId))groups.set(object.provinceId,[]);groups.get(object.provinceId).push(object);}
    const previous=this.byKey||new Map(),oldKeys=this.objects.map(o=>o.key).join('|');this.objects=[];
    for(const [provinceId,rows]of groups){
      const region=this.regions.get(provinceId);if(!region)continue;
      if(!this.anchors.has(provinceId))this.anchors.set(provinceId,interiorAnchors(region));
      const anchors=this.anchors.get(provinceId);if(!anchors.length)continue;
      for(let i=0;i<rows.length;i++){
        const o=rows[i],old=previous.get(o.key);let hash=0;for(const char of o.key)hash=(hash*31+char.charCodeAt(0))>>>0;
        o.point=old?.point||anchors[hash%anchors.length];this.objects.push(o);
        const url=visuals.sprites[o.sprite];if(url)o.image=imageFor(url,this.invalidate);
      }
    }
    this.byKey=new Map(this.objects.map(o=>[o.key,o]));
    if(oldKeys!==this.objects.map(o=>o.key).join('|')){this.grid.clear();for(const o of this.objects){const key=`${Math.floor(o.point[0]/5)},${Math.floor(o.point[1]/5)}`;if(!this.grid.has(key))this.grid.set(key,[]);this.grid.get(key).push(o);}this.revision++;this.layoutKey=null;}
    else {for(const rows of this.grid.values())for(let i=0;i<rows.length;i++)rows[i]=this.byKey.get(rows[i].key);for(const item of this.layout)for(let i=0;i<item.objects.length;i++)item.objects[i]=this.byKey.get(item.objects[i].key);}
    this.updateToggle();this.updatePanel();this.map.invalidate();
  }
  get level(){return this.map.zoom<3?'far':this.map.zoom<12?'medium':'close';}
  visibleObjects(){
    const m=this.map,pad=48,lo=m.screenToWorld(-pad,-pad),hi=m.screenToWorld(m.width+pad,m.height+pad),out=[];
    for(let x=Math.floor(lo[0]/5);x<=Math.floor(hi[0]/5);x++)for(let y=Math.floor(lo[1]/5);y<=Math.floor(hi[1]/5);y++)for(const o of this.grid.get(`${x},${y}`)||[])if(o.point[0]>=lo[0]&&o.point[0]<=hi[0]&&o.point[1]>=lo[1]&&o.point[1]<=hi[1])out.push(o);
    return out.sort((a,b)=>compare(a.key,b.key));
  }
  buildLayout(){
    const m=this.map,key=[this.enabled,this.revision,m.x,m.y,m.scale,m.width,m.height,this.level].join(':');
    if(this.layoutKey===key)return this.layout;this.layoutKey=key;this.layout=[];this.hitGrid=new Map();
    if(!this.enabled||this.level==='far')return this.layout;
    const objects=this.visibleObjects(),groups=[];
    if(this.level==='medium'){
      const provinces=new Map();for(const o of objects){if(!provinces.has(o.provinceId))provinces.set(o.provinceId,[]);provinces.get(o.provinceId).push(o);}
      for(const rows of provinces.values())groups.push(rows);
    }else for(const o of objects)groups.push([o]);
    const cells=new Map(),size=this.level==='close'?48:26;
    for(const rows of groups){
      const first=rows[0],x=first.point[0]*m.scale+m.x,y=first.point[1]*m.scale+m.y;
      // Merge overlapping screen cells; never move an object's world anchor.
      let overlap;
      for(let cx=Math.floor((x-size)/size);cx<=Math.floor((x+size)/size);cx++)for(let cy=Math.floor((y-size)/size);cy<=Math.floor((y+size)/size);cy++)for(const item of cells.get(`${cx},${cy}`)||[])if(Math.abs(item.x-x)<size&&Math.abs(item.y-y)<size)overlap=item;
      if(overlap){overlap.objects.push(...rows);continue;}
      if(this.layout.length>=this.maxVisible)continue;
      const item={x,y,objects:[...rows],size};this.layout.push(item);
      const cell=`${Math.floor(x/size)},${Math.floor(y/size)}`;if(!cells.has(cell))cells.set(cell,[]);cells.get(cell).push(item);
    }
    for(const item of this.layout)for(let x=Math.floor((item.x-item.size/2)/32);x<=Math.floor((item.x+item.size/2)/32);x++)for(let y=Math.floor((item.y-item.size/2)/32);y<=Math.floor((item.y+item.size/2)/32);y++){
      const key=`${x},${y}`;if(!this.hitGrid.has(key))this.hitGrid.set(key,[]);this.hitGrid.get(key).push(item);
    }
    return this.layout;
  }
  draw(ctx){
    const m=this.map,items=this.buildLayout();this.drawnSprites=0;this.drawnMarkers=0;
    if(!items.length)return;
    ctx.setTransform(m.canvas.width/m.width,0,0,m.canvas.height/m.height,0,0);
    ctx.imageSmoothingEnabled=false;
    for(const item of items){
      m.symbols?.push({x:item.x,y:item.y,radius:item.size/2});
      const o=item.objects[0],image=o.image;
      if(this.level==='close'&&item.objects.length===1&&image?.status==='ready'){
        const width=44,height=width*image.image.naturalHeight/image.image.naturalWidth;
        ctx.drawImage(image.image,item.x-width/2,item.y-height/2,width,height);this.drawnSprites++;
      }else{
        ctx.fillStyle=item.objects.some(o=>o.kind==='market')?'#d9b976':'#b6c9a0';ctx.strokeStyle='#203640';ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(item.x,item.y,this.level==='close'?13:9,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.fillStyle='#172c35';ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(item.objects.length>1?String(item.objects.length):o.kind==='market'?'M':'E',item.x,item.y);this.drawnMarkers++;
      }
      if(item.objects.some(o=>o.key===this.selectedKey)){ctx.strokeStyle='#ffe0a0';ctx.lineWidth=2;ctx.strokeRect(item.x-item.size/2,item.y-item.size/2,item.size,item.size);}
    }
  }
  selectAt(x,y){
    this.buildLayout();const item=(this.hitGrid.get(`${Math.floor(x/32)},${Math.floor(y/32)}`)||[]).find(item=>Math.abs(item.x-x)<=item.size/2&&Math.abs(item.y-y)<=item.size/2);
    if(!item){if(!this.panel.hidden){this.panel.hidden=true;this.selectedKey=null;this.map.invalidate();}return false;}
    this.selectedKey=item.objects[0].key;this.selectedGroup=item.objects.map(o=>o.key);this.panel.hidden=false;this.updatePanel();this.map.invalidate();return true;
  }
  updatePanel(){
    if(!this.selectedKey)return;
    const o=this.byKey.get(this.selectedKey);if(!o){this.panel.hidden=true;this.selectedKey=null;return;}
    if(this.map.inspector&&!this.panel.hidden){this.map.inspector.provinceId=o.provinceId;this.map.inspector.show(o.kind);}
    this.panel.replaceChildren();
    const heading=document.createElement('strong');heading.textContent=o.id;this.panel.append(heading);
    const close=document.createElement('button');close.textContent='Close';close.onclick=()=>{this.selectedKey=null;this.panel.hidden=true;this.map.invalidate();};this.panel.append(close);
    if(this.selectedGroup?.length>1){const list=document.createElement('div');list.className='economy-group';for(const key of this.selectedGroup){const member=this.byKey.get(key);if(!member)continue;const button=document.createElement('button');button.textContent=member.id;button.onclick=()=>{this.selectedKey=key;this.updatePanel();this.map.invalidate();};list.append(button);}this.panel.append(list);}
    const dl=document.createElement('dl');this.panel.append(dl);
    const field=(name,value)=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=value??'Unavailable';dd.dataset.field=name;dl.append(dt,dd);};
    const r=o.record;field('Province',o.provinceId);
    if(o.kind==='enterprise'){
      const recipe=this.state.recipes.find(row=>row.id===r.recipeId);field('Production type',r.recipeId);field('Capacity (batches)',r.capacityBatches);field('Workers',r.stats?.workers);
      field('Production',recipe&&r.stats?`${r.stats.batches*recipe.output.quantity} ${recipe.output.goodId}`:null);
      const inventory=document.createElement('table');inventory.dataset.field='Inventories';this.panel.append(inventory);
      Promise.resolve(this.simulation.enterpriseSummary(r.id)).then(detail=>{if(this.selectedKey!==o.key||!inventory.isConnected)return;for(const stock of detail?.inventories||[]){const tr=document.createElement('tr');for(const value of [this.state.goods.find(g=>g.id===stock.goodId)?.name||stock.goodId,stock.quantity,stock.bookValueMinor]){const cell=document.createElement('td');cell.textContent=value;tr.append(cell);}inventory.append(tr);}}).catch(()=>{});
      field('Revenue',r.stats?.revenue);field('Profit/loss',r.stats?.profit);
    }else{
      field('Covered provinces',r.provinceIds.join(', '));
      for(const g of r.goods){field(`${g.goodId} price`,g.priceMinor);field(`${g.goodId} supply`,g.stats?.supply);field(`${g.goodId} demand`,g.stats?g.stats.affordableDemand+g.stats.inputDemand:null);field(`${g.goodId} shortage/surplus`,g.stats?`${g.stats.shortage} / ${g.stats.surplus}`:null);}
    }
    field('Completed months',this.state.stats.monthsProcessed);
  }
  dispose(){this.unsubscribe();this.removeLayer();this.map.objectSelect=this.previousSelect;this.control.remove();this.panel.remove();}
}
