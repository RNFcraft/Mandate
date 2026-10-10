// Shared read-only inspector. Selection changes presentation, never simulation.
export class Inspector{
  constructor(map,simulation){
    this.map=map;this.simulation=simulation;this.panels=new Map();this.root=document.createElement('aside');this.root.id='world-inspector';this.root.hidden=true;
    Object.assign(this.root.style,{position:'fixed',right:'16px',top:'110px',width:'340px',maxHeight:'calc(100vh - 150px)',overflow:'auto',background:'#142b35',color:'#f4ead0',padding:'12px',zIndex:6});
    this.nav=document.createElement('nav');this.root.append(this.nav);document.body.append(this.root);
    for(const [key,title]of [['province','Провинция'],['settlement','Поселения'],['enterprise','Предприятия'],['market','Рынок']]){const button=document.createElement('button');button.textContent=title;button.dataset.tab=key;button.onclick=()=>this.selectTab(key);this.nav.append(button);}
    this.province=this.panel('province','province-info');
    map.canvas.addEventListener('regionselect',({detail})=>{this.provinceId=detail.regionId;if(detail.regionId&&this.active!=='economy')this.showProvince();});
    this.unsubscribe=simulation.subscribe(event=>{if(['viewUpdated','populationUpdated','gameLoaded'].includes(event.type)&&this.active==='province')this.showProvince();});
  }
  panel(kind,id){const panel=document.createElement('section');panel.id=id;panel.hidden=true;this.root.append(panel);this.panels.set(kind,panel);return panel;}
  show(kind){this.active=kind;this.root.hidden=false;const selected=this.panels.get(kind);for(const panel of new Set(this.panels.values()))panel.hidden=panel!==selected;for(const button of this.nav.children)button.setAttribute('aria-pressed',String(button.dataset.tab===kind));}
  hide(){this.root.hidden=true;for(const panel of this.panels.values())panel.hidden=true;}
  selectTab(kind){
    if(kind==='province'){this.showProvince();return;}
    if(kind==='settlement'){
      const layer=this.map.settlementLayer,rows=layer?.rows.filter(r=>r.provinceId===this.provinceId)||[];this.show(kind);const panel=this.panels.get(kind);if(!panel)return;panel.replaceChildren();
      for(const row of rows){const button=document.createElement('button');button.textContent=`${row.name} · ${row.population}`;button.onclick=()=>{layer.selectedId=row.id;layer.renderPanel(row);};panel.append(button);}return;
    }
    const layer=this.map.economyLayer,object=layer?.objects.find(o=>o.kind===kind&&(kind==='market'?o.record.provinceIds.includes(this.provinceId):o.provinceId===this.provinceId));
    if(object){layer.selectedKey=object.key;layer.selectedGroup=layer.objects.filter(o=>o.kind===kind&&o.provinceId===object.provinceId).map(o=>o.key);layer.panel.hidden=false;layer.updatePanel();this.map.invalidate();}
    else {this.show(kind);const panel=this.panels.get(kind);if(panel)panel.textContent='Нет объектов в выбранной провинции.';}
  }
  showProvince(){
    this.show('province');this.province.replaceChildren();const id=this.provinceId;if(!id){this.province.textContent='Выберите провинцию на карте.';return;}const p=this.simulation.populationSummary(id),owner=this.simulation.countries.get(this.simulation.ownership.get(id));
    for(const text of [id,owner?.name||'Нет владельца',`Население: ${p.total}; городское: ${p.urban}; сельское: ${p.rural}`]){const row=document.createElement('p');row.textContent=text;this.province.append(row);}
    const close=document.createElement('button');close.textContent='Закрыть';close.onclick=()=>this.hide();this.province.append(close);
  }
}
