// Optional, process-local observations. Never serialized or used by economic decisions.
let active=null;
const bins=['1','2-3','4-6','7-12','13-24','25-60','61+'];
const bin=age=>age<=1?'1':age<=3?'2-3':age<=6?'4-6':age<=12?'7-12':age<=24?'13-24':age<=60?'25-60':'61+';
const histogram=()=>Object.fromEntries(bins.map(k=>[k,{shipments:0,quantity:0}]));
const durations=()=>({knownCompleted:0,unknownCompleted:0,sumServiceMonths:0,maxServiceMonths:0,sumElapsedMonths:0,maxElapsedMonths:0});
function start({now}={}){
  if(active)throw Error('Economy diagnostics already active');
  if(typeof now!=='function')throw Error('Economy diagnostics needs an external clock');
  const tracked=new Map(),months=[];let row=null,route=null;
  const trace={
    now,
    phase(name,stamp,objects=0){const end=now();if(!row)return end;const p=row.phases[name]??={calls:0,totalMs:0,objects:0};p.calls++;p.totalMs+=end-stamp;p.objects+=objects;return end;},
    count(name,n=1){if(!row)return;row.counters[name]=(row.counters[name]||0)+n;},
    beginMonth(period){if(row)throw Error('Diagnostics month still open');row={period:{...period},phases:{},counters:{},logistics:null};},
    openRoutes(e){
      const period=e.stats.lastCompletedPeriod;route={period:period.year*12+period.month,opening:e.trade.routing.cargo.length,created:0,createdQuantity:0,delivered:0,deliveredQuantity:0,cancelled:0,advancedOld:0,stalled:0,stalledQuantity:0,blocked:{labor:0,capacity:0},delivery:durations(),byGood:{},repeatRequests:{requests:0,requestedQuantity:0,pendingQuantity:0},foodRetargets:{attempts:0,increased:0,reopenedAfterFulfilled:0},unobservedRemovals:0};
      for(const c of e.trade.routing.cargo)if(!tracked.has(c.id))tracked.set(c.id,{born:null,first:route.period,stalls:0});
    },
    created(c){tracked.set(c.id,{born:route.period,first:route.period,stalls:0});route.created++;route.createdQuantity+=c.quantity;const good=route.byGood[c.goodId]??={...durations(),created:0,delivered:0,stalled:0};good.created++;},
    delivered(c){
      const meta=tracked.get(c.id),good=route.byGood[c.goodId]??={...durations(),created:0,delivered:0,stalled:0};route.delivered++;route.deliveredQuantity+=c.quantity;good.delivered++;
      for(const d of [route.delivery,good])if(meta?.born!==null&&meta?.born!==undefined){const elapsed=route.period-meta.born;d.knownCompleted++;d.sumServiceMonths+=elapsed+1;d.maxServiceMonths=Math.max(d.maxServiceMonths,elapsed+1);d.sumElapsedMonths+=elapsed;d.maxElapsedMonths=Math.max(d.maxElapsedMonths,elapsed);}else d.unknownCompleted++;
      tracked.delete(c.id);
    },
    moved(c){route.advancedOld++;const meta=tracked.get(c.id);if(meta)meta.stalls=0;},
    stalled(c,labor,capacity){route.stalled++;route.stalledQuantity+=c.quantity;if(labor)route.blocked.labor++;if(capacity)route.blocked.capacity++;const meta=tracked.get(c.id);if(meta)meta.stalls++;const good=route.byGood[c.goodId]??={...durations(),created:0,delivered:0,stalled:0};good.stalled++;},
    request(quantity,pending){if(pending>0&&quantity>0){route.repeatRequests.requests++;route.repeatRequests.requestedQuantity+=quantity;route.repeatRequests.pendingQuantity+=pending;}},
    retarget(previous,next){route.foodRetargets.attempts++;if(next>previous)route.foodRetargets.increased++;if(!previous&&next>0)route.foodRetargets.reopenedAfterFulfilled++;},
    closeRoutes(e){
      const live=new Set(),ages=histogram(),observedAges=histogram(),byGood={},byEdges={},byPosition={};let quantity=0,escrowMinor=0,unknownAge=0,maxConsecutiveStalls=0,remainingQuantityEdges=0;
      for(const c of e.trade.routing.cargo){live.add(c.id);quantity+=c.quantity;escrowMinor+=c.escrowMinor;const meta=tracked.get(c.id),good=byGood[c.goodId]??={shipments:0,quantity:0,unknownAge:0,age:histogram()};good.shipments++;good.quantity+=c.quantity;const length=c.path.length-1;remainingQuantityEdges+=c.quantity*(length-c.index);byEdges[length]=(byEdges[length]||0)+1;byPosition[c.index]=(byPosition[c.index]||0)+1;maxConsecutiveStalls=Math.max(maxConsecutiveStalls,meta?.stalls||0);
        const observed=bin(route.period-(meta?.first??route.period)+1);observedAges[observed].shipments++;observedAges[observed].quantity+=c.quantity;
        if(meta?.born!==null&&meta?.born!==undefined){const key=bin(route.period-meta.born+1);ages[key].shipments++;ages[key].quantity+=c.quantity;good.age[key].shipments++;good.age[key].quantity+=c.quantity;}else{unknownAge++;good.unknownAge++;}
      }
      for(const id of tracked.keys())if(!live.has(id)){tracked.delete(id);route.unobservedRemovals++;}
      for(const d of [route.delivery,...Object.values(route.byGood)]){d.meanServiceMonths=d.knownCompleted?d.sumServiceMonths/d.knownCompleted:null;d.meanElapsedMonths=d.knownCompleted?d.sumElapsedMonths/d.knownCompleted:null;}
      row.logistics={...route,active:live.size,quantity,remainingQuantityEdges,escrowMinor,unknownAge,age:ages,observedAgeLowerBound:observedAges,maxConsecutiveStalls,activeByGood:byGood,activeByRouteEdges:byEdges,activeByPosition:byPosition};route=null;
    },
    endMonth(){if(!row)throw Error('Diagnostics month not open');months.push(row);const completed=row;row=null;return completed;},
    stop(){if(active===trace)active=null;tracked.clear();return {version:1,coverage:'sequential-only',months};}
  };
  active=trace;return trace;
}
function current(){return active;}
module.exports={start,current};
