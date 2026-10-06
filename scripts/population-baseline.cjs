// Offline source -> allocation -> normalization -> cohorts. No runtime map changes.
const {createHash}=require('node:crypto');
const {sameGrid,clean}=require('./population-raster.cjs');
const {bounds,polygons,intersection,area}=require('./adm2-spatial.cjs');
const {validatePopulationScenario}=require('../shared/population.cjs');
const compare=(a,b)=>a<b?-1:a>b?1:0;
const DEFAULTS=Object.freeze({maxUnresolvedPct:0.05,maxAnomalyPct:0.05,strict:false,sanity:true});
const SOURCE=Object.freeze({name:'HYDE 3.2 baseline',datasetDoi:'10.17026/DANS-25G-GEZ3',paperDoi:'10.5194/essd-9-927-2017',year:1700});
function sum(){let value=0,correction=0;return {add(n){const y=n-correction,t=value+y;correction=(t-value)-y;value=t;},get value(){return value;}};}
const box=(x,y,w)=>({type:'Polygon',coordinates:[[[x,y],[x+w,y],[x+w,y+w],[x,y+w],[x,y]]]});
function spatialIndex(features,size=1){
  const grid=new Map(),ids=new Set();
  for(const f of features){if(typeof f.id!=='string'||ids.has(f.id)||!f.geometry||!['Polygon','MultiPolygon'].includes(f.geometry.type))throw Error('Invalid/duplicate atomic polygon');ids.add(f.id);
    // Index polygon parts independently: islands never produce a world-sized bbox.
    for(const p of polygons(f.geometry)){const part={id:f.id,geometry:{type:'Polygon',coordinates:p}},b=bounds(part.geometry);if(b.some(n=>!Number.isFinite(n))||b[0]<-180||b[2]>180||b[1]<-90||b[3]>90)throw Error(`Invalid geographic bounds: ${f.id}`);part.bounds=b;
      for(let x=Math.floor(b[0]/size);x<=Math.floor(b[2]/size);x++)for(let y=Math.floor(b[1]/size);y<=Math.floor(b[3]/size);y++){const k=`${x},${y}`;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(part);}
    }
  }
  return b=>{
    const found=new Set();for(let x=Math.floor(b[0]/size);x<=Math.floor(b[2]/size);x++)for(let y=Math.floor(b[1]/size);y<=Math.floor(b[3]/size);y++)for(const part of grid.get(`${x},${y}`)||[]){const p=part.bounds;if(p[0]<=b[2]&&p[2]>=b[0]&&p[1]<=b[3]&&p[3]>=b[1])found.add(part);}
    return [...found].sort((a,c)=>compare(a.id,c.id)||compare(JSON.stringify(a.bounds),JSON.stringify(c.bounds)));
  };
}
function boundaryDistance(g,x,y,cos){
  let best=Infinity;for(const p of polygons(g))for(const ring of p)for(let i=1;i<ring.length;i++){
    const a=ring[i-1],b=ring[i],ax=(a[0]-x)*cos,ay=a[1]-y,bx=(b[0]-x)*cos,by=b[1]-y,dx=bx-ax,dy=by-ay;
    const length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/length)):0;best=Math.min(best,Math.hypot(ax+t*dx,ay+t*dy));
  }return best;
}
function nearest(query,x,y,w){
  const cx=x+w/2,cy=y+w/2,cos=Math.max(1e-6,Math.cos(cy*Math.PI/180)),limit=w*Math.hypot(cos,1);let best;
  for(const shift of [0,-360,360]){
    const px=cx+shift,dx=Math.min(180,limit/cos);
    for(const f of query([px-dx,cy-limit,px+dx,cy+limit])){const distance=boundaryDistance(f.geometry,px,cy,cos);if(distance<=limit&&(!best||distance<best.distance||(distance===best.distance&&compare(f.id,best.id)<0)))best={id:f.id,distance,distanceKm:distance*Math.PI/180*6371.0088,limitKm:limit*Math.PI/180*6371.0088};}
  }return best;
}
function allocate(rasters,features,options={}){
  sameGrid([rasters.total,rasters.urban,rasters.rural]);const g=rasters.total,query=options.query||spatialIndex(features);
  const totals=new Map(),raw=sum(),source=sum(),assigned=sum(),fallbackMass=sum(),unresolvedMass=sum(),anomalyMass=sum(),ruralFallbackMass=sum(),settlementWithoutTotalMass=sum();
  const audit={sourceCells:((options.endRow??g.nrows)-(options.startRow??0))*g.ncols,positiveSourceCells:0,fallbackCells:[],unresolvedCells:[],ruralFallbackCells:[],settlementWithoutTotalCells:[],invalidSourceValues:[],shareMismatchCells:0};
  audit.nodataCompatibility={rule:'identical semantics/value across total/urban/rural',value:g.nodata===null||Number.isFinite(g.nodata)?g.nodata:String(g.nodata)};
  for(let index=(options.startRow??0)*g.ncols;index<(options.endRow??g.nrows)*g.ncols;index++){
    const values={};let invalid=false;
    for(const key of ['total','urban','rural']){const cell=clean(rasters[key],index);values[key]=cell.value;if(cell.invalid){invalid=true;audit.invalidSourceValues.push({index,layer:key,value:cell.original,action:'replace with zero'});}}
    const original=g.values[index];if(Number.isFinite(original)&&!clean(g,index).nodata)raw.add(original);
    const total=values.total,settlement=values.urban+values.rural;
    if(!Number.isFinite(settlement))throw Error(`Source settlement overflow at cell ${index}`);
    if(total===0){
      if(settlement>0){
        const x=g.x+(index%g.ncols)*g.cellsize,y=g.y+(g.nrows-Math.floor(index/g.ncols)-1)*g.cellsize;
        audit.settlementWithoutTotalCells.push({index,x,y,urban:values.urban,rural:values.rural,reason:'cleaned total == 0 but urban or rural > 0'});
        settlementWithoutTotalMass.add(settlement);anomalyMass.add(settlement);
      }
      continue; // Settlement signal is audited, never added to authoritative mass.
    }
    source.add(total);audit.positiveSourceCells++;
    const row=Math.floor(index/g.ncols),col=index%g.ncols,x=g.x+col*g.cellsize,y=g.y+(g.nrows-row-1)*g.cellsize,w=g.cellsize;
    const urbanShare=settlement>0?values.urban/settlement:0;
    if(settlement===0){audit.ruralFallbackCells.push({index,x,y,population:total,reason:'urban + rural == 0'});ruralFallbackMass.add(total);invalid=true;}
    if(settlement!==total)audit.shareMismatchCells++;
    if(invalid)anomalyMass.add(total);
    const cell=box(x,y,w),weights=new Map();
    // Sort ourselves even when a caller supplies an index with another order.
    const candidates=[...query([x,y,x+w,y+w])].sort((a,b)=>compare(a.id,b.id)||compare(JSON.stringify(a.geometry),JSON.stringify(b.geometry)));
    for(const f of candidates){const overlap=area(intersection(cell,f.geometry));if(overlap>0)weights.set(f.id,(weights.get(f.id)||0)+overlap);}
    if(!weights.size){const fallback=nearest(query,x,y,w);if(fallback){weights.set(fallback.id,1);fallbackMass.add(total);audit.fallbackCells.push({index,x,y,population:total,...fallback});}else{unresolvedMass.add(total);audit.unresolvedCells.push({index,x,y,population:total,reason:'no game land within one cell diagonal'});continue;}}
    const sorted=[...weights].sort((a,b)=>compare(a[0],b[0])),weightSum=sorted.reduce((n,r)=>n+r[1],0);if(!Number.isFinite(weightSum)||weightSum<=0)throw Error('Invalid overlap weights');assigned.add(total);
    for(const [id,weight]of sorted){if(!totals.has(id))totals.set(id,{total:sum(),urban:sum()});const row=totals.get(id),mass=total*(weight/weightSum);row.total.add(mass);row.urban.add(mass*urbanShare);}
  }
  audit.rawSourceTotal=raw.value;audit.cleanedSourceTotal=source.value;audit.assignedSourceTotal=assigned.value;audit.fallbackPopulation=fallbackMass.value;audit.unresolvedPopulation=unresolvedMass.value;audit.anomalyPopulation=anomalyMass.value;audit.ruralFallbackPopulation=ruralFallbackMass.value;
  audit.settlementWithoutTotalPopulation=settlementWithoutTotalMass.value;
  audit.unresolvedPct=source.value?100*unresolvedMass.value/source.value:0;audit.anomalyPct=source.value?100*anomalyMass.value/source.value:anomalyMass.value>0?100:0;
  return {rows:[...totals].sort((a,b)=>compare(a[0],b[0])).map(([id,r])=>({id,total:r.total.value,urban:r.urban.value})),audit};
}
function apportion(rows,target){
  if(!Number.isSafeInteger(target)||target<0||rows.some(r=>!Number.isFinite(r.weight)||r.weight<0)||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Invalid apportionment');
  const sorted=rows.slice().sort((a,b)=>compare(a.id,b.id)),weightSum=sorted.reduce((n,r)=>n+r.weight,0);
  if(!weightSum){if(target)throw Error('Positive target with zero weights');return sorted.map(r=>({id:r.id,count:0}));}
  const result=sorted.map(r=>{const quota=target*(r.weight/weightSum),count=Math.floor(quota);return {id:r.id,count,remainder:quota-count};});
  const remaining=target-result.reduce((n,r)=>n+r.count,0);if(remaining<0||remaining>result.length)throw Error('Apportionment precision exceeded');
  const ranked=result.slice().sort((a,b)=>b.remainder-a.remainder||compare(a.id,b.id));for(let i=0;i<remaining;i++)ranked[i].count++;
  return result.map(({id,count})=>({id,count}));
}
function normalize(allocation,options={}){
  const settings={...DEFAULTS,...options},a=allocation.audit;
  for(const key of ['maxUnresolvedPct','maxAnomalyPct'])if(!Number.isFinite(settings[key])||settings[key]<0||settings[key]>100)throw Error(`Invalid ${key}`);
  const failures=[];if((settings.strict&&a.unresolvedPopulation>0)||a.unresolvedPct>settings.maxUnresolvedPct)failures.push(`unresolved population ${a.unresolvedPopulation} (${a.unresolvedPct}%) exceeds threshold`);
  if(a.anomalyPct>settings.maxAnomalyPct)failures.push(`settlement/invalid-source anomaly population ${a.anomalyPopulation} (${a.anomalyPct}%) exceeds threshold`);
  const target=Math.round(a.assignedSourceTotal);if(!Number.isSafeInteger(target)||target<0)failures.push('invalid normalized target');
  if(settings.sanity&&!(target>100000000&&target<2000000000))failures.push('global target must be >100 million and <2 billion: check year, units and input files');
  if(failures.length){const error=Error(failures.join('; '));error.audit=a;throw error;}
  const byId=new Map(allocation.rows.map(r=>[r.id,r]));
  const rows=apportion(allocation.rows.map(r=>({id:r.id,weight:r.total})),target).filter(r=>r.count>0).map(r=>{
    const source=byId.get(r.id),split=apportion([{id:'rural',weight:Math.max(0,source.total-source.urban)},{id:'urban',weight:source.urban}],r.count),bySettlement=Object.fromEntries(split.map(s=>[s.id,s.count]));
    return {territoryId:r.id,population:r.count,urban:bySettlement.urban,rural:bySettlement.rural};
  });
  const urban=rows.reduce((n,r)=>n+r.urban,0),rural=target-urban;
  if(settings.sanity&&(!rows.length||urban>=target||rural<=0)){const error=Error('Invalid settlement/global sanity totals');error.audit=a;throw error;}
  return {target,rows,urban,rural,settings};
}
const territoryHash=id=>createHash('sha256').update(id).digest('hex').slice(0,24);
function buildCohorts(rows,hash=territoryHash){
  const cohorts=[],ids=new Set();
  for(const row of rows.slice().sort((a,b)=>compare(a.territoryId,b.territoryId)))for(const settlement of ['rural','urban'])if(row[settlement]>0){
    const suffix=hash(row.territoryId);if(!/^[a-f0-9]{24}$/.test(suffix))throw Error('Invalid territory hash');const id=`p1700-${settlement[0]}-${suffix}`;if(ids.has(id))throw Error(`Cohort ID collision: ${id}`);ids.add(id);
    cohorts.push({id,territoryId:row.territoryId,cultureId:'unclassified',religionId:'unclassified',stratumId:'unclassified',settlement,count:row[settlement],literacyBps:null});
  }
  const registry=()=>[{id:'unclassified',name:'Unclassified (composition not generated yet)'}];return {version:1,cultures:registry(),religions:registry(),strata:registry(),cohorts};
}
function createBaseline(rasters,features,hierarchy,options={}){
  for(const value of [...['total','urban','rural'].map(key=>rasters[key].sha256),options.geographyHash,options.hierarchyHash])if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw Error('Baseline provenance requires source, geography and hierarchy SHA256 hashes');
  const allocation=options.allocation||allocate(rasters,features,options),normalized=normalize(allocation,options),population=buildCohorts(normalized.rows);validatePopulationScenario(population,hierarchy);
  const generated={total:normalized.target,urban:normalized.urban,rural:normalized.rural,cohorts:population.cohorts.length,territoriesWithPopulation:normalized.rows.length,urbanCohorts:population.cohorts.filter(c=>c.settlement==='urban').length,ruralCohorts:population.cohorts.filter(c=>c.settlement==='rural').length};
  const a=allocation.audit,meta={schema:'mandate-population-baseline-v1',scenario:'1700',source:SOURCE,sourceFiles:Object.fromEntries(['total','urban','rural'].map(key=>[key,{sha256:rasters[key].sha256}])),geography:{id:hierarchy.id,sha256:options.geographyHash,hierarchySha256:options.hierarchyHash},method:{spatialAllocation:'exact atomic polygon intersections; cylindrical equal-area overlap approximation',integerApportionment:'global territory Hamilton, then territory settlement Hamilton; ASCII ID ties',coastlineNormalization:'all cell population normalized over intersecting game land',fallbackAssignment:'cell-center to nearest polygon boundary within one local equirectangular cell diagonal; longitude wrap; ASCII ID ties',gameplayNormalizationVersion:1,normalizedTarget:'round(cleaned total assigned to game land); allowed unresolved mass excluded',thresholds:{maxUnresolvedPct:normalized.settings.maxUnresolvedPct,maxAnomalyPct:normalized.settings.maxAnomalyPct,strict:normalized.settings.strict}},generated,audit:{nodataCompatibility:a.nodataCompatibility,rawSourceTotal:a.rawSourceTotal,cleanedSourceTotal:a.cleanedSourceTotal,assignedSourceTotal:a.assignedSourceTotal,normalizedTarget:normalized.target,difference:generated.total-normalized.target,rawToGeneratedDifference:generated.total-a.rawSourceTotal,sourceCells:a.sourceCells,positiveSourceCells:a.positiveSourceCells,fallbackCells:a.fallbackCells.length,fallbackPopulation:a.fallbackPopulation,unresolvedCells:a.unresolvedCells.length,unresolvedPopulation:a.unresolvedPopulation,unresolvedPct:a.unresolvedPct,ruralFallbackCells:a.ruralFallbackCells.length,ruralFallbackPopulation:a.ruralFallbackPopulation,anomalyPopulation:a.anomalyPopulation,anomalyPct:a.anomalyPct,settlementWithoutTotalCells:a.settlementWithoutTotalCells.length,settlementWithoutTotalPopulation:a.settlementWithoutTotalPopulation,invalidSourceValues:a.invalidSourceValues.length,shareMismatchCells:a.shareMismatchCells},reference:{orderOfMagnitude:'about 600 million around 1700; reference only, no rescaling',paperUrl:'https://essd.copernicus.org/articles/9/927/2017/'}};
  return {population,meta,territories:normalized.rows,audit:a};
}
module.exports={DEFAULTS,SOURCE,box,spatialIndex,allocate,apportion,normalize,buildCohorts,createBaseline,compare};
