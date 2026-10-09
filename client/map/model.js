import schema from '../../shared/scenario.cjs';
import kernel from '../../shared/simulation.cjs';
export class MapModel extends EventTarget {
  constructor(geography, scenario, {simulation=null}={}) {
    super();
    this.hierarchy = geography;
    this.territories = new Map(geography.territories.map(r => [r.id, Object.freeze({ ...r })]));
    this.adm1 = new Map(geography.adm1.map(r => [r.id, Object.freeze({ ...r })]));
    this.regions = new Map([...this.adm1,...this.territories]);
    this.children = new Map();
    for(const r of geography.territories){if(!this.children.has(r.adm1Id))this.children.set(r.adm1Id,[]);this.children.get(r.adm1Id).push(r.id);}
    this.simulation=simulation;
    if(simulation){
      this.loadRuntime();
      this.unsubscribeSimulation=simulation.subscribe(event=>{
        if(event.type!=='stateChanged'||['time','clock'].includes(event.kind))return;
        if(event.kind==='loaded'){this.loadRuntime();return;}
        for(const parent of new Set((event.ownershipIds||[]).map(id=>this.territories.get(id).adm1Id))){const ids=this.children.get(parent),owner=this.owners.get(ids[0]);this.groupOwners.set(parent,ids.every(id=>this.owners.get(id)===owner)?owner:undefined);}
        this.changed(event.ownershipIds);
      });
    }else this.loadScenario(scenario);
  }
  loadRuntime(){
    this.scenario=this.simulation.scenario;this.countries=this.simulation.countries;this.owners=this.simulation.ownership;
    const controllers=this.simulation.controllers;this.controllers=Object.keys(controllers).length?controllers:undefined;
    this.refreshGroups();this.changed(null);
  }
  command(value){const check=result=>{if(!result.ok)throw new Error(result.error);return result;};const result=this.simulation.submit(value);return result?.then?result.then(check):check(result);}
  loadScenario(data) {
    if(this.simulation)return this.simulation.load(kernel.initializeGameState(data,this.hierarchy));
    data = schema.migrateLegacy(data,this.hierarchy);
    this.scenario = { ...data.scenario };
    this.countries = new Map(data.countries.map(c => [c.id, { ...c }]));
    const previous=this.owners;
    this.owners = new Map(Object.entries(data.ownership));
    this.refreshGroups();
    this.controllers = data.controllers ? { ...data.controllers } : undefined;
    this.changed(previous?[...this.owners].filter(([id,owner])=>previous.get(id)!==owner).map(([id])=>id):null);
  }
  exportScenario() {
    return { scenario: { ...this.scenario }, countries: [...this.countries.values()].map(c => ({ ...c })), ownership: Object.fromEntries(this.owners), ...(this.controllers ? { controllers: { ...this.controllers } } : {}) };
  }
  changed(owners=[]) { this.revision=(this.revision||0)+1;this.dispatchEvent(new CustomEvent('change',{detail:{owners}})); }
  refreshGroups() {
    this.groupOwners=new Map();
    for(const [id,children]of this.children){const owner=this.owners.get(children[0]);this.groupOwners.set(id,children.every(c=>this.owners.get(c)===owner)?owner:undefined);}
  }
  ownerOf(id) {return this.owners.has(id)?this.owners.get(id):this.groupOwners.get(id);}
  baseIds(id) {return this.territories.has(id)?[id]:this.children.get(id)||[];}
  setOwner(regionId, countryId) {
    if(this.simulation)return this.command({type:'SetOwnership',ids:this.baseIds(regionId),owner:countryId});
    if (!this.regions.has(regionId) || (countryId !== null && !this.countries.has(countryId))) throw new Error('Unknown region or country');
    const ids=this.baseIds(regionId),changed=[];
    for(const id of ids){if(this.owners.get(id)===countryId)continue;changed.push(id);this.owners.set(id,countryId);
      for(const c of this.countries.values())if(c.capitalRegionId===id&&c.id!==countryId)c.capitalRegionId=null;}
    if(!changed.length)return;
    const parents=new Set(ids.map(id=>this.territories.get(id).adm1Id));
    for(const parent of parents){const children=this.children.get(parent),owner=this.owners.get(children[0]);this.groupOwners.set(parent,children.every(c=>this.owners.get(c)===owner)?owner:undefined);}
    this.changed(changed);
  }
  setCapital(countryId, regionId) {
    if(this.adm1.has(regionId))regionId=this.baseIds(regionId).find(id=>this.owners.get(id)===countryId);
    if(this.simulation)return this.command({type:'SetCapital',countryId,territoryId:regionId});
    if (!this.countries.has(countryId) || this.owners.get(regionId) !== countryId) throw new Error('Столичный регион должен принадлежать выбранному государству');
    this.countries.get(countryId).capitalRegionId = regionId; this.changed();
  }
  addCountry(country) {
    if(this.simulation)throw new Error('Create countries in the DEV scenario editor');
    const data = this.exportScenario(); data.countries.push({ ...country });
    schema.validateScenario(data, new Set(this.territories.keys()));
    this.countries.set(country.id, { ...country }); this.changed();
  }
  setColor(countryId, color) {
    if(this.simulation)return this.command({type:'SetCountryColor',countryId,color});
    if (!this.countries.has(countryId) || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Invalid country or color');
    this.countries.get(countryId).color = color; this.changed();
  }
}
