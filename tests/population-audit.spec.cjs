const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path');
const {writeDerived}=require('../scripts/import-population-1700.cjs');
const {area,polygons}=require('../scripts/adm2-spatial.cjs');
const {auditCentroid}=require('../scripts/population-audit-centroid.cjs');
test.beforeAll(async()=>{await fs.mkdir(path.resolve('tmp'),{recursive:true});});
const feature=(id,width)=>({id,geometry:{type:'Polygon',coordinates:[[[0,0],[width,0],[width,1],[0,1],[0,0]]]}});
test('population audit uses canonical areas, ranks density, excludes zero and preserves authoritative bytes',async()=>{
  const folder=await fs.mkdtemp(path.resolve('tmp')+path.sep+'population-density-');
  const targets=['scenarios/1700/population.json','scenarios/1700/population.meta.json'];
  const before=await Promise.all(targets.map(p=>fs.readFile(p).catch(e=>{if(e.code==='ENOENT')return null;throw e;})));
  const features=[feature('large',2),feature('dense-b',0.25),feature('dense-a',0.25),feature('empty',0.01)];
  features[0].geometry.coordinates.push([[0.5,0.2],[0.5,0.8],[1,0.8],[1,0.2],[0.5,0.2]]);
  features[1].geometry={type:'MultiPolygon',coordinates:[features[1].geometry.coordinates]};
  const result={population:{cohorts:[]},meta:{probe:'unchanged'},territories:features.map((f,i)=>({territoryId:f.id,population:[1000,500,500,0][i],urban:[100,100,100,0][i],rural:[900,400,400,0][i]}))};
  const original=JSON.stringify(result);
  try{
    await writeDerived(result,folder,features,{});
    const read=async name=>JSON.parse(await fs.readFile(path.join(folder,name+'.json'),'utf8'));
    const largest=await read('largest-territories'),density=await read('highest-density-territories');
    expect(largest.map(r=>r.territoryId)).toEqual(['large','dense-a','dense-b','empty']);
    expect(density.map(r=>r.territoryId)).toEqual(['dense-a','dense-b','large']);
    for(const row of [...largest,...density])expect(row.centroid).toEqual(auditCentroid(features.find(f=>f.id===row.territoryId).geometry));
    for(const row of largest){const f=features.find(f=>f.id===row.territoryId);expect(row.areaKm2).toBe(area(polygons(f.geometry)));expect(row.populationDensityPerKm2).toBe(row.population/row.areaKm2);expect(Number.isFinite(row.populationDensityPerKm2)).toBe(true);}
    expect(await read('territories')).toEqual(result.territories);expect(JSON.stringify(result)).toBe(original);
    const bytes=await fs.readFile(path.join(folder,'highest-density-territories.json'),'utf8');
    await writeDerived(result,folder,features.slice().reverse(),{});
    expect(await fs.readFile(path.join(folder,'highest-density-territories.json'),'utf8')).toBe(bytes);
    expect(await Promise.all(targets.map(p=>fs.readFile(p).catch(e=>{if(e.code==='ENOENT')return null;throw e;})))).toEqual(before);
  }finally{if(path.dirname(folder)!==path.resolve('tmp'))throw Error('Unsafe cleanup');await fs.rm(folder,{recursive:true,force:true});}
});
test('audit centroids account for holes, winding, weighted parts and longitude wrap',()=>{
  const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
  const outer=rect(0,0,4,2),hole=rect(0,0,1,2);
  const g={type:'Polygon',coordinates:[outer,hole]};
  expect(auditCentroid(g)[0]).toBeCloseTo(2.5,10);
  expect(auditCentroid(g)[1]).toBeCloseTo(Math.asin(Math.sin(2*Math.PI/180)/2)*180/Math.PI,10);
  const reversed={type:'Polygon',coordinates:g.coordinates.map(r=>r.slice().reverse())};
  for(let i=0;i<2;i++)expect(auditCentroid(reversed)[i]).toBeCloseTo(auditCentroid(g)[i],10);
  const multi={type:'MultiPolygon',coordinates:[[rect(0,0,1,2)],[rect(2,0,2,2)]]};
  expect(auditCentroid(multi)[0]).toBeCloseTo((0.5+2*3)/3,10);
  const wrapped={type:'Polygon',coordinates:[[[179,0],[-179,0],[-179,2],[179,2],[179,0]]]};
  expect(Math.abs(auditCentroid(wrapped)[0])).toBeCloseTo(180,10);
  expect(()=>auditCentroid({type:'Polygon',coordinates:[rect(0,0,0,0)]})).toThrow('Invalid');
});
test('both diagnostic rankings are limited to 100 populated territories',async()=>{
  const folder=await fs.mkdtemp(path.resolve('tmp')+path.sep+'population-density-');
  try{
    const features=Array.from({length:105},(_,i)=>feature(String(i).padStart(3,'0'),1));
    const territories=features.map((f,i)=>({territoryId:f.id,population:i+1,urban:0,rural:i+1}));
    await writeDerived({territories},folder,features,{});
    for(const name of ['largest-territories','highest-density-territories']){
      const rows=JSON.parse(await fs.readFile(path.join(folder,name+'.json'),'utf8'));
      expect(rows).toHaveLength(100);expect(rows[0].territoryId).toBe('104');expect(rows.at(-1).territoryId).toBe('005');
    }
  }finally{if(path.dirname(folder)!==path.resolve('tmp'))throw Error('Unsafe cleanup');await fs.rm(folder,{recursive:true,force:true});}
});
