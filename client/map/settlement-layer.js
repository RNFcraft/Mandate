import {interiorAnchors} from './geometry.js';
// Presentation anchors belong to the map, not to authoritative settlement geography.
export class SettlementLayer {
  constructor(map,simulation){
    this.map=map;this.simulation=simulation;this.enabled=true;this.anchors=new Map();this.regions=new Map(map.geometry.regions.map(r=>[r.id,r]));
    this.panel=map.inspector?map.inspector.panel('settlement','settlement-info'):document.createElement('section');this.panel.id='settlement-info';this.panel.hidden=true;
    if(!map.inspector)Object.assign(this.panel.style,{position:'fixed',right:'16px',top:'110px',background:'#142b35',color:'#f4ead0',padding:'14px',maxWidth:'320px',zIndex:5});
    this.toggle=document.createElement('button');this.toggle.id='settlement-toggle';this.toggle.textContent='Процедурные города';
    Object.assign(this.toggle.style,{position:'fixed',right:'16px',top:'76px',zIndex:5});this.toggle.onclick=()=>{this.enabled=!this.enabled;this.panel.hidden=true;map.invalidate();};
    document.body.append(this.toggle);if(!map.inspector)document.body.append(this.panel);
    this.removeLayer=map.addLayer(ctx=>this.draw(ctx));const previous=map.objectSelect;map.objectSelect=(x,y)=>this.selectAt(x,y)||previous?.(x,y);
    this.unsubscribe=simulation.subscribe(event=>{if(simulation.worker?event.type==='viewUpdated':['economyUpdated','gameLoaded'].includes(event.type)||event.type==='stateChanged'&&['ownership','countries'].includes(event.kind))this.refresh();});this.refresh();
  }
  refresh(){
    const current=this.simulation.settlementSummary()||[];
    if(this.byId&&current.length===this.rows.length&&current.every(r=>this.byId.has(r.id))){this.rows=current;const rows=new Map(current.map(r=>[r.id,r]));for(const entry of this.points)entry.row=rows.get(entry.row.id);if(this.selectedId&&!this.panel.hidden)this.renderPanel(rows.get(this.selectedId));this.map.invalidate();return;}
    this.rows=[...current].sort((a,b)=>b.capitalOf.length-a.capitalOf.length||b.population-a.population||(a.id<b.id?-1:1));this.byId=new Set(this.rows.map(r=>r.id));
    this.points=[];this.grid=new Map();
    for(const row of this.rows){
      if(!this.anchors.has(row.provinceId)){const region=this.regions.get(row.provinceId);this.anchors.set(row.provinceId,region?interiorAnchors(region):[]);}
      const anchors=this.anchors.get(row.provinceId);let hash=0;for(const char of row.id)hash=(hash*31+char.charCodeAt(0))>>>0;
      const point=anchors[hash%anchors.length];if(point){const entry={row,point};this.points.push(entry);const key=`${Math.floor(point[0]/5)},${Math.floor(point[1]/5)}`;if(!this.grid.has(key))this.grid.set(key,[]);this.grid.get(key).push(entry);}
    }
    this.toggle.hidden=!this.points.length;this.map.invalidate();
  }
  draw(ctx){
    this.visible=[];if(!this.enabled)return;const m=this.map,occupied=new Set();
    ctx.setTransform(m.canvas.width/m.width,0,0,m.canvas.height/m.height,0,0);
    const lo=m.screenToWorld(0,0),hi=m.screenToWorld(m.width,m.height),candidates=[];
    for(let x=Math.floor(lo[0]/5);x<=Math.floor(hi[0]/5);x++)for(let y=Math.floor(lo[1]/5);y<=Math.floor(hi[1]/5);y++)for(const entry of this.grid.get(`${x},${y}`)||[])if(entry.row.capitalOf.length||entry.row.type==='large-city'||m.zoom>=3&&entry.row.type==='city'||m.zoom>=12&&entry.row.classification==='urban'||m.zoom>=24)candidates.push(entry);
    candidates.sort((a,b)=>b.row.capitalOf.length-a.row.capitalOf.length||b.row.population-a.row.population||(a.row.id<b.row.id?-1:1));
    for(const entry of candidates){
      const x=entry.point[0]*m.scale+m.x,y=entry.point[1]*m.scale+m.y,key=Math.floor(x/20)+':'+Math.floor(y/20);
      if(x<0||y<0||x>m.width||y>m.height||occupied.has(key)||m.symbols?.some(p=>Math.abs(p.x-x)<p.radius+9&&Math.abs(p.y-y)<p.radius+9))continue;occupied.add(key);if(this.visible.length>=80||(m.symbols?.length||0)>=200)break;
      m.symbols?.push({x,y,radius:9});
      this.visible.push({...entry,x,y});ctx.fillStyle=entry.row.capitalOf.length?'#ffdc7e':'#eee6d3';ctx.strokeStyle='#122d39';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(x,y,entry.row.capitalOf.length?5:3,0,Math.PI*2);ctx.fill();ctx.stroke();
      if(m.zoom>=6){ctx.fillStyle='#faf1d8';ctx.font='11px system-ui';ctx.textAlign='left';ctx.fillText(entry.row.name,x+8,y-6);}
    }
  }
  selectAt(x,y){
    const entry=this.visible?.find(p=>Math.abs(x-p.x)<9&&Math.abs(y-p.y)<9);if(!entry)return false;
    this.selectedId=entry.row.id;this.renderPanel(entry.row);return true;
  }
  renderPanel(row){
    if(!row){this.panel.hidden=true;return;}
    this.panel.replaceChildren();this.panel.hidden=false;
    if(this.map.inspector){this.map.inspector.provinceId=row.provinceId;this.map.inspector.show('settlement');}
    const close=document.createElement('button');close.textContent='Закрыть';close.onclick=()=>this.panel.hidden=true;this.panel.append(close);
    for(const text of [row.name,'Процедурная метка; точка отображения внутри провинции, координаты города не подтверждены.',`Население: ${row.population}`,`Провинция: ${row.provinceId}`,`Рынок: ${row.marketId||'нет'}`,`Предприятия: ${row.enterprises.length}; активны: ${row.activeEnterprises}`,`Труд: ${row.usedLabor} / ${row.availableLabor} (провинциальный пул)`,`Выручка: ${row.revenue}`,`Отрасли: ${row.industries.join(', ')}`]){const p=document.createElement('p');p.textContent=text;this.panel.append(p);}
    return true;
  }
}
