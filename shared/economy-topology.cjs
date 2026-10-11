// One immutable topology generation; bounded BFS trees contain no economic values.
let cached=null;
const compare=(a,b)=>a<b?-1:a>b?1:0;
function topology(e){
  const key=JSON.stringify([e.markets.map(m=>[m.id,m.accountingUnitId]),e.trade.edges.map(v=>[v.a,v.b])]);
  if(cached?.key===key)return cached;
  const neighbors=new Map(e.markets.map(m=>[m.id,[]])),units=new Map(e.markets.map(m=>[m.id,m.accountingUnitId]));
  for(const edge of e.trade.edges){neighbors.get(edge.a).push(edge.b);neighbors.get(edge.b).push(edge.a);}
  for(const list of neighbors.values()){list.sort(compare);Object.freeze(list);}
  const component=new Map();for(const id of neighbors.keys())if(!component.has(id)){const queue=[id];component.set(id,id);for(let i=0;i<queue.length;i++)for(const next of neighbors.get(queue[i]))if(!component.has(next)&&units.get(next)===units.get(id)){component.set(next,id);queue.push(next);}}
  const trees=new Map();
  cached={key,neighbors,component,hasTree(from,limit){return trees.has(from+'|'+limit);},tree(from,limit){const token=from+'|'+limit;if(trees.has(token)){const value=trees.get(token);trees.delete(token);trees.set(token,value);return value;}const distance=new Map([[from,0]]),parent=new Map(),queue=[from];for(let i=0;i<queue.length;i++){const id=queue[i],depth=distance.get(id);if(depth>=limit)continue;for(const next of neighbors.get(id))if(!distance.has(next)&&units.get(next)===units.get(from)){distance.set(next,depth+1);parent.set(next,id);queue.push(next);}}const value={distance,parent};trees.set(token,value);if(trees.size>128)trees.delete(trees.keys().next().value);return value;}};
  return cached;
}
function path(tree,from,to){if(!tree.distance.has(to))return null;const result=[to];for(let current=to;current!==from;){current=tree.parent.get(current);result.push(current);}return result.reverse();}
module.exports={topology,path};
