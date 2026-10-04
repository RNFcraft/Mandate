import { listScenarios, loadScenario, saveScenario } from '../scenarios/store.js';

export class ScenarioEditor {
  constructor(map) {
    this.map = map; this.model = map.model; this.undoStack = []; this.redoStack = []; this.busy = false;
    this.selectedCountry = [...this.model.countries.keys()][0] || '';
    const style = document.createElement('style');
    style.textContent = `.dev-panel{position:fixed;right:12px;top:12px;bottom:12px;width:270px;box-sizing:border-box;padding:12px;overflow:auto;background:#20333f;color:#e2e2d0;font:13px system-ui;border:1px solid #72807d}.dev-panel h2{font-size:15px;margin:0 0 10px}.dev-panel label{display:block;margin:7px 0}.dev-panel input,.dev-panel select,.dev-panel button{box-sizing:border-box;max-width:100%;background:#314854;color:#eeeeDC;border:1px solid #778482;padding:5px;font:inherit}.dev-panel input:not([type=color]),.dev-panel select{width:100%}.dev-panel button{cursor:pointer;margin:3px 2px 3px 0}.dev-panel button:disabled{opacity:.45;cursor:default}.dev-panel hr{border:0;border-top:1px solid #61716f}.dev-panel p{font-size:12px;line-height:1.4}.dev-panel output{display:block;white-space:pre-wrap;margin:8px 0;font-size:12px}.dev-panel .error{color:#f0aaa0}`;
    style.textContent += '.dev-panel input[type=checkbox]{width:auto}.dev-panel.audit-active > :not(#audit-toggle):not(#audit-panel):not(#status){display:none}';
    document.head.append(style);
    this.panel = document.createElement('aside'); this.panel.className = 'dev-panel';
    this.panel.innerHTML = `<h2>DEV · Сценарии</h2>
      <label>ID сценария<input id="scenario-id" maxlength="64"></label>
      <label>Год<input id="scenario-year" type="number" min="1700" max="9999"></label>
      <label>Название<input id="scenario-name" maxlength="160"></label>
      <button id="new-scenario">Новый пустой</button><button id="save-scenario">Сохранить</button>
      <label>Сохранённые<select id="scenario-list"></select></label><button id="load-scenario">Загрузить</button>
      <hr><label>Государство<select id="country-list"></select></label>
      <output id="country-info"></output>
      <details><summary>+ государство</summary><form id="country-form">
      <label>ID / tag<input name="id" required pattern="[A-Za-z0-9](?:[A-Za-z0-9_]|-){0,63}" maxlength="64"></label>
      <label>Название<input name="name" required maxlength="160"></label>
      <label>Короткое название<input name="shortName" required maxlength="160"></label>
      <label>Цвет<input name="color" type="color" value="#9a7c64"></label>
      <label>Форма правления<input name="governmentType" required value="absolute_monarchy" maxlength="160"></label>
      <button type="submit">Создать государство</button></form></details>
      <hr><label>Режим<select id="edit-mode"><option value="territory">Территории</option><option value="capital">Столица</option><option value="erase">Удалить владение</option><option value="pan">Перемещение</option></select></label>
      <button id="undo">Undo</button><button id="redo">Redo</button>
      <p>ЛКМ / drag: покраска. Zoom ≥ 8×: ADM2; ниже — все дочерние ADM2 выбранного ADM1. ПКМ / средняя кнопка: перенос. Колесо: zoom. Столица на близком масштабе назначается точно.</p>
      <output id="lod-info"></output><output id="region-info"></output><button id="audit-toggle">ADM2 AUDIT</button><div id="audit-panel" hidden></div><output id="status" role="status"></output>`;
    document.body.append(this.panel);
    this.populateMetadata(); this.refreshCountries();
    this.map.editMode = 'territory';
    this.map.editorGesture = (phase, id) => this.gesture(phase, id);
    this.el('edit-mode').onchange = e => { this.map.editMode = e.target.value; };
    this.el('audit-toggle').onclick = async () => {
      try {
        if(!this.audit){const { ADM2Audit }=await import('/editor/audit.js');this.audit=new ADM2Audit(this);await this.audit.load();}
        this.audit.toggle();
      }catch(e){this.audit=null;this.message(e.message,true);}
    };
    this.el('country-list').onchange = e => { this.selectedCountry = e.target.value; this.refreshInfo(); };
    this.el('country-form').onsubmit = e => {
      e.preventDefault(); if (this.busy) return;
      const fields = Object.fromEntries(new FormData(e.target));
      for (const key of Object.keys(fields)) fields[key] = fields[key].trim();
      this.perform(() => { this.model.addCountry({ ...fields, capitalRegionId: null }); this.selectedCountry = fields.id; });
    };
    this.el('undo').onclick = () => this.history(false);
    this.el('redo').onclick = () => this.history(true);
    this.el('new-scenario').onclick = () => this.perform(() => {
      const meta = this.readMetadata();
      this.model.loadScenario({ scenario: meta, countries: [], ownership: Object.fromEntries([...this.model.territories.keys()].map(id => [id, null])) });
      this.selectedCountry = ''; this.map.selectedId = null;
    });
    this.el('save-scenario').onclick = () => this.save();
    this.el('load-scenario').onclick = () => this.load();
    map.canvas.addEventListener('pointermove', () => this.refreshRegion());
    map.canvas.addEventListener('lodchange',e=>{const s=e.detail;this.el('lod-info').textContent=`LOD: ${s.level} · ADM2: ${s.activeTerritories} · чанки: ${s.activeChunks}/${s.needed}${s.deferred?' · приблизьте для полной детализации':''}`;});
    map.canvas.addEventListener('maperror',e=>this.message(e.detail,true));
    this.savedState = JSON.stringify(this.model.exportScenario());
    window.addEventListener('beforeunload', e => { if (this.isDirty()) { e.preventDefault(); e.returnValue = ''; } });
    this.refreshList().catch(e => this.message(e.message, true));
    this.updateHistory(); this.message('DEV-редактор. Изменения сохраняются кнопкой «Сохранить».');
  }
  el(id) { return this.panel.querySelector(`#${id}`); }
  message(text, error = false) { this.el('status').textContent = text; this.el('status').classList.toggle('error', error); }
  snapshot() { return JSON.stringify(this.model.exportScenario()); }
  isDirty() { const data = this.model.exportScenario(); data.scenario = this.readMetadata(); return JSON.stringify(data) !== this.savedState; }
  populateMetadata() {
    const m = this.model.scenario; this.el('scenario-id').value = m.id; this.el('scenario-year').value = m.year; this.el('scenario-name').value = m.name;
  }
  readMetadata() { return { ...this.model.scenario, id: this.el('scenario-id').value.trim(), year: Number(this.el('scenario-year').value), name: this.el('scenario-name').value.trim() }; }
  refreshCountries() {
    const select = this.el('country-list'); select.replaceChildren();
    for (const c of this.model.countries.values()) { const option = new Option(`${c.shortName} · ${c.id}`, c.id); select.add(option); }
    if (!this.model.countries.has(this.selectedCountry)) this.selectedCountry = [...this.model.countries.keys()][0] || '';
    select.value = this.selectedCountry; this.refreshInfo();
  }
  refreshInfo() {
    const c = this.model.countries.get(this.selectedCountry);
    this.el('country-info').textContent = c ? `${c.name}\n${c.governmentType} · ${c.color}\nСтолица: ${c.capitalRegionId ? this.model.regions.get(c.capitalRegionId).name : 'не назначена'}` : 'Создайте государство для назначения территорий.';
    this.refreshRegion();
  }
  refreshRegion() {
    const id = this.map.hoveredId || this.map.selectedId, region = this.model.regions.get(id);
    const ownerId=this.model.ownerOf(id),owner=this.model.countries.get(ownerId);
    this.el('region-info').textContent = region ? `${this.model.territories.has(id)?'ADM2':'ADM1'} · ${region.name} · ${id}\nВладелец: ${owner?.shortName || (ownerId===undefined?'смешанное владение':'нет')}` : '';
  }
  record(before) {
    if (before === this.snapshot()) return;
    const a=JSON.parse(before),b=this.model.exportScenario(),changes=[];
    for(const [id,owner]of Object.entries(b.ownership))if(a.ownership[id]!==owner)changes.push([id,a.ownership[id],owner]);
    delete a.ownership;delete b.ownership;
    this.undoStack.push({a,b,changes}); if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = []; this.updateHistory();
  }
  updateHistory() { this.el('undo').disabled = this.busy || !this.undoStack.length; this.el('redo').disabled = this.busy || !this.redoStack.length; }
  perform(fn) {
    if (this.busy) return;
    const before = this.snapshot();
    try { fn(); this.record(before); this.refreshCountries(); this.message('Изменения не сохранены.'); } catch(e) { this.message(e.message, true); }
  }
  history(redo) {
    if (this.busy || this.map.drag) return;
    const source = redo ? this.redoStack : this.undoStack, target = redo ? this.undoStack : this.redoStack;
    if (!source.length) return;
    const operation=source.pop(),data=this.model.exportScenario();
    for(const [id,before,after]of operation.changes)data.ownership[id]=redo?after:before;
    this.model.loadScenario({...data,...(redo?operation.b:operation.a)});target.push(operation);
    this.populateMetadata(); this.refreshCountries(); this.updateHistory(); this.message(redo ? 'Операция повторена.' : 'Операция отменена.');
  }
  gesture(phase, id) {
    if(this.audit?.enabled){if(phase==='begin'){this.map.selectedId=id;this.audit.inspect(id);this.map.invalidate();}return;}
    if (this.busy) return;
    if (phase === 'begin') { this.gestureBefore = this.snapshot(); this.painted = new Set(); }
    if (phase === 'end') {
      if (this.gestureBefore) this.record(this.gestureBefore);
      this.gestureBefore = null; this.refreshInfo(); return;
    }
    if (!id || this.painted.has(id) || (this.map.editMode === 'capital' && phase !== 'begin')) return;
    this.painted.add(id); this.map.selectedId = id;
    try {
      if (this.map.editMode === 'erase') this.model.setOwner(id, null);
      else if (!this.selectedCountry) throw new Error('Сначала создайте и выберите государство');
      else if (this.map.editMode === 'capital') this.model.setCapital(this.selectedCountry, id);
      else this.model.setOwner(id, this.selectedCountry);
      this.message('Изменения не сохранены.');
    } catch(e) { this.message(e.message, true); }
    this.map.invalidate(); this.refreshInfo();
  }
  async refreshList(selected = this.model.scenario.id) {
    const list = await listScenarios(); this.el('scenario-list').replaceChildren();
    for (const s of list) this.el('scenario-list').add(new Option(`${s.year} · ${s.name} (${s.id})`, s.id));
    this.el('scenario-list').value = selected;
  }
  setBusy(busy) {
    this.busy = busy;
    for (const el of this.panel.querySelectorAll('button,input,select')) el.disabled = busy;
    this.updateHistory();
  }
  async save() {
    if (this.busy || this.map.drag) return;
    this.setBusy(true);
    try {
      const data = this.model.exportScenario(); data.scenario = this.readMetadata();
      await saveScenario(data); this.model.loadScenario(data); this.savedState = this.snapshot();
      await this.refreshList(); this.message(`Сохранено: scenarios/${data.scenario.id}/`);
    } catch(e) { this.message(e.message, true); } finally { this.setBusy(false); }
  }
  async load() {
    if (this.busy || this.map.drag) return;
    if (this.isDirty() && !window.confirm('Загрузить сценарий и отбросить несохранённые изменения?')) return;
    this.setBusy(true);
    try {
      const data = await loadScenario(this.el('scenario-list').value);
      this.model.loadScenario(data); this.savedState = this.snapshot(); this.undoStack = []; this.redoStack = [];
      this.populateMetadata(); this.refreshCountries(); this.map.selectedId = null;
      const url = new URL(location.href); url.searchParams.set('scenario', data.scenario.id); history.replaceState(null, '', url);
      this.message('Сценарий загружен.');
    } catch(e) { this.message(e.message, true); } finally { this.setBusy(false); }
  }
}
