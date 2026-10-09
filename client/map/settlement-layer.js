import {interiorAnchors} from './geometry.js';
// Presentation anchors belong to the map, not to authoritative settlement geography.
export class SettlementLayer {
  constructor(map,simulation){
    this.map=map;this.simulation=simulation;this.enabled=true;this.anchors=new Map();this.regions=new Map(map.geometry.regions.map(r=>[r.id,r]));
    this.panel=document.createElement('section');this.panel.id='settlement-info';this.panel.hidden=true;
    Object.assign(this.panel.style,{position:'fixed',right:'16px',top:'110px',background:'#142b35',color:'#f4ead0',padding:'14px',maxWidth:'320px',zIndex:5});
    this.toggle=document.createElement('button');this.toggle.id='settlement-toggle';this.toggle.textContent='Процедурные города';
    Object.assign(this.toggle.style,{position:'fixed',right:'16px',top:'76px',zIndex:5});this.toggle.onclick=()=>{this.enabled=!this.enabled;this.panel.hidden=true;map.invalidate();};
    document.body.append(this.toggle,this.panel);
    this.removeLayer=map.addLayer(ctx=>this.draw(ctx));const previous=map.objectSelect;map.objectSelect=(x,y)=>this.selectAt(x,y)||previous?.(x,y);
    this.unsubscribe=simulation.subscribe(event=>{if(['economyUpdated','gameLoaded'].includes(event.type)||event.type==='stateChanged'&&['ownership','countries'].includes(event.kind))this.refresh();});this.refresh();
  }
  refresh(){
    this.rows=(this.simulation.settlementSummary()||[]).filter(r=>r.type==='large-city'||r.capitalOf.length).sort((a,b)=>b.capitalOf.length-a.capitalOf.length||b.population-a.population||(a.id<b.id?-1:1));
    this.points=[];
    for(const row of this.rows){
      if(!this.anchors.has(row.provinceId)){const region=this.regions.get(row.provinceId);this.anchors.set(row.provinceId,region?interiorAnchors(region)[0]:null);}
      const point=this.anchors.get(row.provinceId);if(point)this.points.push({row,point});
    }
    this.toggle.hidden=!this.points.length;this.map.invalidate();
  }
  draw(ctx){
    this.visible=[];if(!this.enabled)return;const m=this.map,occupied=new Set();
    ctx.setTransform(m.canvas.width/m.width,0,0,m.canvas.height/m.height,0,0);
    for(const entry of this.points){
      const x=entry.point[0]*m.scale+m.x,y=entry.point[1]*m.scale+m.y,key=Math.floor(x/20)+':'+Math.floor(y/20);
      if(x<0||y<0||x>m.width||y>m.height||occupied.has(key))continue;occupied.add(key);if(this.visible.length>=80)break;
      this.visible.push({...entry,x,y});ctx.fillStyle=entry.row.capitalOf.length?'#ffdc7e':'#eee6d3';ctx.strokeStyle='#122d39';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(x,y,entry.row.capitalOf.length?5:3,0,Math.PI*2);ctx.fill();ctx.stroke();
      if(m.zoom>=6){ctx.fillStyle='#faf1d8';ctx.font='11px system-ui';ctx.textAlign='left';ctx.fillText(entry.row.name,x+8,y-6);}
    }
  }
  selectAt(x,y){
    const entry=this.visible?.find(p=>Math.abs(x-p.x)<9&&Math.abs(y-p.y)<9);if(!entry)return false;
    const row=entry.row;this.panel.replaceChildren();this.panel.hidden=false;
    const close=document.createElement('button');close.textContent='Закрыть';close.onclick=()=>this.panel.hidden=true;this.panel.append(close);
    for(const text of [row.name,'Процедурная метка; точка отображения внутри провинции, координаты города не подтверждены.',`Население: ${row.population}`,`Провинция: ${row.provinceId}`,`Рынок: ${row.marketId||'нет'}`,`Предприятия: ${row.enterprises.length}; активны: ${row.activeEnterprises}`,`Труд: ${row.usedLabor} / ${row.availableLabor} (провинциальный пул)`,`Выручка: ${row.revenue}`,`Отрасли: ${row.industries.join(', ')}`]){const p=document.createElement('p');p.textContent=text;this.panel.append(p);}
    return true;
  }
}
