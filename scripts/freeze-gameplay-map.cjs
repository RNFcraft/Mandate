// Explicit freeze only: relabel existing geometry; never generate or simplify it.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {unpackTopology}=require('./topology-codec.cjs');
const {feature}=require('topojson-client');
const {bounds}=require('./adm2-spatial.cjs');
const {visit}=require('./gameplay-topology.cjs');
const DIRECTORY='client/data/map-v2',GEOGRAPHY='mandate-provinces-v1';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const encode=x=>JSON.stringify(x);
function rekey(value){if(typeof value==='string')return /^preview:\d{5}$/.test(value)?value.replace('preview:','province:'):value;
  if(Array.isArray(value))return value.map(rekey);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[rekey(k),rekey(v)]));return value;}
function geometryDigest(packed){const t=unpackTopology(packed);return sha(encode({arcs:t.arcs,transform:t.transform,provinces:t.objects.provinces.geometries.map(g=>({type:g.type,arcs:g.arcs})),land:t.objects.land}));}
async function verifyFrozen(directory=DIRECTORY){
  const manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json')));
  if(manifest.geographyId!==GEOGRAPHY||manifest.provinceCount!==5001||manifest.geometryVersion!==1)throw Error('Unsupported frozen geography');
  for(const [file,expected]of Object.entries(manifest.files))if(sha(await fs.readFile(path.join(directory,file)))!==expected)throw Error(`Frozen file hash mismatch: ${file}`);
  const t=JSON.parse(await fs.readFile(path.join(directory,'provinces.topo.json')));if(geometryDigest(t)!==manifest.geometrySha256)throw Error('Frozen geometry changed');return manifest;
}
async function freeze(directory=DIRECTORY){
  try{await fs.access(path.join(directory,'manifest.json'));return verifyFrozen(directory);}catch(e){if(e.code!=='ENOENT')throw e;}
  const entries=await fs.readdir(directory),assets={};for(const name of entries.filter(n=>n.endsWith('.json')))assets[name]=JSON.parse(await fs.readFile(path.join(directory,name)));
  const records=assets['provinces.json'],before=geometryDigest(assets['provinces.topo.json']);
  if(records.length!==5001||records.some((r,i)=>r.id!==`preview:${String(i+1).padStart(5,'0')}`)||assets['qa.json'].structuralFailures.length)throw Error('Freeze requires accepted ordered 5001-province candidate');
  for(const name of Object.keys(assets))assets[name]=rekey(assets[name]);
  if(geometryDigest(assets['provinces.topo.json'])!==before)throw Error('Freeze changed geometry');
  const t=unpackTopology(assets['provinces.topo.json']),gs=t.objects.provinces.geometries,owners=t.arcs.map(()=>new Set());gs.forEach(g=>visit(g.arcs,n=>owners[n].add(g.id)));
  const adjacency=Object.fromEntries(gs.map(g=>[g.id,[]]));owners.forEach(ids=>{const rows=[...ids];if(rows.length>2)throw Error('Non-manifold province edge');if(rows.length===2){adjacency[rows[0]].push(rows[1]);adjacency[rows[1]].push(rows[0]);}});
  for(const id of Object.keys(adjacency))adjacency[id]=[...new Set(adjacency[id])].sort();
  for(const r of assets['provinces.json']){if(encode(adjacency[r.id])!==encode(r.adjacency))throw Error('Existing adjacency differs from shared topology');}
  assets['adjacency.json']={schema:'mandate-province-adjacency-v1',geographyId:GEOGRAPHY,landOnly:true,neighbors:adjacency};
  assets['hierarchy.json']={id:GEOGRAPHY,geometryVersion:1,adm0:[],adm1:[],territories:gs.map((g,i)=>({id:g.id,kind:'province',areaKm2:records[i].areaKm2,bounds:bounds(feature(t,g).geometry),geometryIndex:i,seed:records[i].seed,archipelago:records[i].archipelago}))};
  const mappingHash=sha(encode(assets['mapping.json']));assets['qa.json'].provenance.mappingSha256=mappingHash;
  assets['uncovered-atoms.json']={schema:'mandate-uncovered-atom-qa-v1',policy:'outside-clean-mask-nearest-province',count:assets['qa.json'].uncoveredAtoms.length,totalPopulation:assets['qa.json'].uncoveredAtoms.reduce((s,r)=>s+r.population,0),maxDistanceKm:Math.max(...assets['qa.json'].uncoveredAtoms.map(r=>r.distanceKm)),populationPositive:assets['qa.json'].uncoveredAtoms.filter(r=>r.population>0),atoms:assets['qa.json'].uncoveredAtoms};
  const files=Object.fromEntries(Object.entries(assets).filter(([name])=>!['timing.json','qa-recheck.json'].includes(name)).map(([name,data])=>[name,sha(encode(data))]));
  files['source-land.geojson']=sha(await fs.readFile(path.join(directory,'source-land.geojson')));
  const manifest={schema:'mandate-frozen-geography-v1',geographyId:GEOGRAPHY,geometryVersion:1,provinceCount:5001,sourceGeography:'mandate-atomic-v1',landMaskSource:assets['qa.json'].provenance.landMaskSource,tuning:assets['qa.json'].provenance.config,seed:assets['qa.json'].provenance.config.seed,frozenOn:'2026-10-08',freezeVersion:1,generatorSchema:'mandate-independent-gameplay-preview-v2',freezeSchemaVersion:1,geometrySha256:before,topologySha256:files['provinces.topo.json'],provinceMetadataSha256:files['provinces.json'],mappingSha256:mappingHash,adjacencySha256:files['adjacency.json'],populationSourceSha256:assets['qa.json'].provenance.populationSha256,landMaskSha256:files['source-land.geojson'],files};
  manifest.sources={atomicTopologySha256:assets['qa.json'].provenance.atomicSha256,atomicPopulationSha256:assets['qa.json'].provenance.populationSha256,decodedLandMaskSha256:assets['qa.json'].provenance.landMaskSha256};
  const absolute=path.resolve(directory),parent=path.dirname(absolute),stage=path.join(parent,'.freeze-stage'),backup=path.join(parent,'.freeze-backup');
  await fs.mkdir(stage);let backed=false;
  try{await fs.cp(absolute,stage,{recursive:true});for(const [name,value]of Object.entries({...assets,'manifest.json':manifest}))await fs.writeFile(path.join(stage,name),encode(value));await verifyFrozen(stage);
    await fs.rename(absolute,backup);backed=true;try{await fs.rename(stage,absolute);}catch(e){await fs.rename(backup,absolute);backed=false;throw e;}
  }finally{if(path.dirname(stage)!==parent||path.dirname(backup)!==parent)throw Error('Unsafe freeze cleanup');await fs.rm(stage,{recursive:true,force:true});if(backed)await fs.rm(backup,{recursive:true,force:true});}
  return manifest;
}
module.exports={freeze,verifyFrozen,geometryDigest,rekey};
if(require.main===module)freeze().then(m=>console.log(JSON.stringify({geography:m.geographyId,count:m.provinceCount,topologySha256:m.topologySha256}))).catch(e=>{console.error(e);process.exitCode=1;});
