import economy from '../../shared/economy.cjs';
import population from '../../shared/population.cjs';
import settlements from '../../shared/settlements.cjs';
import autonomy from '../../shared/autonomous-economy.cjs';
const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))]:0;
export class PerformanceMonitor {
  constructor(map){
    this.map=map;this.samples=new Map();this.counters={cacheRebuilds:0,longTasks50:0,longTasks100:0};this.restores=[];this.enabled=true;
    this.panel=document.createElement('output');this.panel.id='performance-monitor';Object.assign(this.panel.style,{position:'fixed',left:'12px',bottom:'12px',padding:'10px',whiteSpace:'pre',font:'11px monospace',background:'#10242de8',color:'#e6e5cd',zIndex:20,pointerEvents:'none'});document.body.append(this.panel);
    for(const [object,method,label]of [[map,'render','render'],[map,'hit','hit'],[map,'strokeBorders','borderDraw'],[economy,'prepareEconomyMonth','economy'],[population,'preparePopulationMonth','demography'],[settlements,'prepareSettlementsMonth','settlements'],[autonomy,'begin','planning'],[autonomy,'finish','investment'],[autonomy,'develop','development']])this.wrap(object,method,label);
    const original=map.globalBackground;map.globalBackground=(...args)=>{const before=map.background?.canvas,start=performance.now();try{return original.apply(map,args);}finally{this.record('background',performance.now()-start);if(map.background?.canvas!==before)this.counters.cacheRebuilds++;}};this.restores.push(()=>map.globalBackground=original);
    const proto=CanvasRenderingContext2D.prototype,drawImage=proto.drawImage,monitor=this;proto.drawImage=function(...args){const start=performance.now();try{return drawImage.apply(this,args);}finally{monitor.record(args[0] instanceof HTMLCanvasElement||typeof ImageBitmap!=='undefined'&&args[0] instanceof ImageBitmap?'bitmapBlit':'imageBlit',performance.now()-start);}};this.restores.push(()=>proto.drawImage=drawImage);
    try{this.observer=new PerformanceObserver(list=>{for(const task of list.getEntries()){this.counters.longTasks50++;if(task.duration>100)this.counters.longTasks100++;this.record('longTask',task.duration);}});this.observer.observe({type:'longtask',buffered:false});}catch{}
    const frame=time=>{if(!this.enabled)return;if(this.lastFrame)this.record('frame',time-this.lastFrame);this.lastFrame=time;this.raf=requestAnimationFrame(frame);};this.raf=requestAnimationFrame(frame);this.timer=setInterval(()=>this.display(),1000);
    map.perf=this;
  }
  wrap(object,key,label){const original=object[key];if(typeof original!=='function')return;const monitor=this;object[key]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{monitor.record(label,performance.now()-start);}};this.restores.push(()=>object[key]=original);}
  record(name,value){let rows=this.samples.get(name);if(!rows)this.samples.set(name,rows=[]);rows.push(value);if(rows.length>4096)rows.shift();}
  count(name){this.counters[name]=(this.counters[name]||0)+1;}
  reset(){this.samples.clear();for(const key of Object.keys(this.counters))this.counters[key]=0;this.lastFrame=null;}
  summary(){const timing={};for(const [name,rows]of this.samples)timing[name]={count:rows.length,p50:percentile(rows,.5),p95:percentile(rows,.95),p99:percentile(rows,.99),max:Math.max(0,...rows),total:rows.reduce((n,v)=>n+v,0)};const bitmap=this.map.background?.canvas;return {version:1,timing,counters:{...this.counters},viewport:[this.map.width,this.map.height],dpr:this.map.dpr,zoom:this.map.zoom,geometryIndexMs:this.map.maxIndexMs,bitmapBytes:(bitmap?bitmap.width*bitmap.height*4:0)+(this.map.overview?this.map.overview.width*this.map.overview.height*4:0),heapUsedBytes:performance.memory?.usedJSHeapSize??null};}
  display(){const s=this.summary(),f=s.timing.frame;this.panel.textContent=`Performance · ${f?Math.round(1000/f.p50):0} FPS\nframes p50/p95/p99: ${[f?.p50,f?.p95,f?.p99].map(v=>(v||0).toFixed(1)).join('/')} ms\nlong tasks 50/100: ${s.counters.longTasks50}/${s.counters.longTasks100}\ncache rebuilds: ${s.counters.cacheRebuilds}\n${Object.entries(s.timing).filter(([k])=>!['frame','longTask'].includes(k)).map(([k,v])=>k.endsWith('Bytes')?`${k}: ${Math.round(v.p95/1024)} KiB`:`${k}: p95 ${v.p95.toFixed(1)} ms`).join('\n')}\nheap: ${s.heapUsedBytes?Math.round(s.heapUsedBytes/1048576)+' MiB':'unavailable'}`;}
  dispose(){this.enabled=false;cancelAnimationFrame(this.raf);clearInterval(this.timer);this.observer?.disconnect();for(const restore of this.restores.reverse())restore();this.panel.remove();this.map.perf=null;}
}
