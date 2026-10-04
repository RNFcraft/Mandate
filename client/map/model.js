import schema from '../../shared/scenario.cjs';
export class MapModel extends EventTarget {
  constructor(geography, scenario) {
    super();
    this.hierarchy = geography;
    this.territories = new Map(geography.territories.map(r => [r.id, Object.freeze({ ...r })]));
    this.adm1 = new Map(geography.adm1.map(r => [r.id, Object.freeze({ ...r })]));
    this.regions = new Map([...this.adm1,...this.territories]);
    this.children = new Map();
    for(const r of geography.territories){if(!this.children.has(r.adm1Id))this.children.set(r.adm1Id,[]);this.children.get(r.adm1Id).push(r.id);}
    this.loadScenario(scenario);
  }
  loadScenario(data) {
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
    if (!this.countries.has(countryId) || this.owners.get(regionId) !== countryId) throw new Error('Столичный регион должен принадлежать выбранному государству');
    this.countries.get(countryId).capitalRegionId = regionId; this.changed();
  }
  addCountry(country) {
    const data = this.exportScenario(); data.countries.push({ ...country });
    schema.validateScenario(data, new Set(this.territories.keys()));
    this.countries.set(country.id, { ...country }); this.changed();
  }
  setColor(countryId, color) {
    if (!this.countries.has(countryId) || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Invalid country or color');
    this.countries.get(countryId).color = color; this.changed();
  }
}
