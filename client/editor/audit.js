const COLORS={confident:'#46b5a0',ambiguous:'#f5b642',unmatched:'#e45686',fallback:'#9463e0'};
export class ADM2Audit {
  constructor(editor){this.editor=editor;this.map=editor.map;this.panel=editor.el('audit-panel');this.enabled=false;this.filters=new Set(['confident','ambiguous','unmatched','fallback']);this.country='';this.index=-1;}
  async load(){
    const get=async name=>{const res=await fetch(`/api/adm2-audit/${name}`,{headers:{'X-Mandate-Dev':'1'}});if(!res.ok)throw new Error('Подготовьте audit: npm run audit:adm2');return res.json();};
    [this.summary,this.records]=await Promise.all(['summary','records'].map(get));
    this.byId=new Map(this.records.map(r=>[r.id,r]));
    this.panel.innerHTML='<h2>ADM2 AUDIT</h2><div id="audit-filters"></div><label>Source ADM0<select id="audit-country"><option value="">all</option></select></label><output id="audit-counts"></output><button id="audit-prev">← предыдущая</button><button id="audit-next">следующая →</button><button id="audit-center">Центрировать</button><p>Цвета доступны при zoom ≥ 8×. Проверка географии; владение не изменяется.</p><output id="audit-info"></output>';
    for(const [category,color]of Object.entries(COLORS)){const label=document.createElement('label');const input=document.createElement('input');input.type='checkbox';input.checked=this.filters.has(category);input.dataset.category=category;input.onchange=()=>{input.checked?this.filters.add(category):this.filters.delete(category);this.filter();};label.append(input,` ${category}`);label.style.color=color;this.el('audit-filters').append(label);}
    for(const id of Object.keys(this.summary.countries).sort())this.el('audit-country').add(new Option(id,id));
    this.el('audit-country').onchange=e=>{this.country=e.target.value;this.filter();};
    this.el('audit-prev').onclick=()=>this.navigate(-1);this.el('audit-next').onclick=()=>this.navigate(1);this.el('audit-center').onclick=()=>this.center(this.byId.get(this.map.selectedId));
    this.map.canvas.addEventListener('pointermove',()=>{if(this.enabled)this.inspect(this.map.hoveredId||this.map.selectedId);});
    this.map.canvas.addEventListener('regionselect',e=>{if(this.enabled)this.inspect(e.detail.regionId);});
    this.map.addLayer((ctx,m)=>{
      if(!this.enabled)return;
      const r=this.byId.get(m.selectedId);if(!r)return;
      // Existing ADM1 paths give a direct visual comparison without extra geometry loads.
      ctx.setLineDash([5/m.scale,4/m.scale]);ctx.lineWidth=2/m.scale;
      for(const [i,c]of r.candidates.slice(0,2).entries()){const region=m.geometry.regions.find(f=>f.id===c.id);if(region){ctx.strokeStyle=i?'#ff719d':'#ffffff';ctx.stroke(region.path);}}
      const selected=m.interactive.find(f=>f.id===r.id);if(selected){ctx.setLineDash([]);ctx.strokeStyle=COLORS[r.category];ctx.lineWidth=3/m.scale;ctx.stroke(selected.path);}
    });
    this.filter();
  }
  el(id){return this.panel.querySelector(`#${id}`);}
  toggle(){this.enabled=!this.enabled;this.panel.hidden=!this.enabled;this.editor.panel.classList.toggle('audit-active',this.enabled);this.editor.panel.scrollTop=0;this.map.audit=this;this.editor.el('audit-toggle').textContent=this.enabled?'Закрыть ADM2 AUDIT':'ADM2 AUDIT';this.map.invalidate();}
  filter(){const shown=this.records.filter(r=>this.filters.has(r.category)&&(!this.country||r.sourceAdm0Id===this.country));this.problems=shown.filter(r=>r.category!=='confident');this.index=-1;const counts={confident:0,ambiguous:0,unmatched:0,fallback:0};for(const r of shown)counts[r.category]++;this.el('audit-counts').textContent=Object.entries(counts).map(([k,v])=>`${k}: ${v}`).join('\n');this.map.invalidate();}
  color(id){const r=this.byId.get(id);return r&&this.filters.has(r.category)&&(!this.country||this.country===r.sourceAdm0Id)?COLORS[r.category]:'#515e61';}
  navigate(delta){if(!this.problems.length)return;this.index=this.index<0?(delta<0?this.problems.length-1:0):(this.index+delta+this.problems.length)%this.problems.length;const r=this.problems[this.index];this.map.selectedId=r.id;this.map.hoveredId=null;this.center(r);this.inspect(r.id);}
  center(r){if(!r)return;const [x0,y0,x1,y1]=r.bounds;const available=Math.max(150,this.map.width-310);const zoom=Math.min(64,Math.max(8,Math.min(available/(Math.max(.02,x1-x0)*this.map.baseScale),this.map.height/(Math.max(.02,y1-y0)*this.map.baseScale))*.65));const m=this.map;m.zoom=zoom;m.scale=m.baseScale*zoom;const [lon,lat]=r.representative;m.x=available/2-(lon+180)*m.scale;m.y=m.height/2-(90-lat)*m.scale;m.invalidate();}
  inspect(id){
    const r=this.byId.get(id);
    if(!r){this.el('audit-info').textContent=id?'ADM1: приблизьте для выбора ADM2.':'';return;}
    this.el('audit-info').textContent=[r.id,r.name,`source ADM0: ${r.sourceAdm0Id}`,`canonical ADM0: ${r.canonicalSourceAdm0Id}`,`ADM0: ${r.adm0Id}`,`ADM1: ${r.adm1Id||'unmatched'}`,`${r.category} · confidence: ${r.confidence??'n/a'}`,`Причина: ${r.reason}`,'Кандидаты (доля площади):',...r.candidates.slice(0,8).map(c=>`${c.id} · ${c.name}: ${(c.share*100).toFixed(2)}%`),...(r.foreignCandidates?.length?['Другие страны (только диагностика):',...r.foreignCandidates.slice(0,3).map(c=>`${c.adm0Id} / ${c.id}: ${(c.share*100).toFixed(2)}%`)]:[]),r.suggestion?`Предложение: ${r.suggestion.adm1Id} (${(r.suggestion.share*100).toFixed(2)}%). Не применено.`:'',`Существенных overlap: ${r.significantOverlaps?.length||0}`,...(r.significantOverlaps||[]).slice(0,5).map(o=>`${o.id}: ${o.areaKm2.toFixed(2)} км²`),r.geometryWarnings?.length?'Есть непроверенные геометрические операции; см. audit errors.':''].join('\n');
  }
}
