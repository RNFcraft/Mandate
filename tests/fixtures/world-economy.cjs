const base=require('./population.cjs');
const hierarchy={id:'mandate-provinces-v1',adm0:[],adm1:[],territories:Array.from({length:6},(_,i)=>({id:'province:'+String(i+1).padStart(5,'0'),kind:'province',areaKm2:10000,archipelago:i===4}))};
const adjacency={schema:'mandate-province-adjacency-v1',geographyId:hierarchy.id,landOnly:true,neighbors:Object.fromEntries(hierarchy.territories.map((t,i)=>[t.id,i===0?['province:00002']:i===1?['province:00001','province:00003']:i===2?['province:00002','province:00004']:i===3?['province:00003','province:00006']:i===5?['province:00004']:[]]))};
function createScenario(){
  const population=structuredClone(base.population);population.cohorts=[];
  const counts=[[300000,240000],[120000,10000],[0,0],[800,200],[0,1],[20,0]];
  for(let i=0;i<counts.length;i++)for(let j=0;j<2;j++)if(counts[i][j])population.cohorts.push({...structuredClone(base.population.cohorts[0]),id:`pop-${i}-${j}`,territoryId:hierarchy.territories[i].id,settlement:j===0?'rural':'urban',count:counts[i][j],birthRateBps:0,deathRateBps:0});
  return {scenario:{id:'synthetic-world',name:'Synthetic world fixture',year:1700,version:4,geography:hierarchy.id},countries:[{id:'A',name:'A',shortName:'A',color:'#778899',capitalRegionId:'province:00001',governmentType:'unspecified'},{id:'B',name:'B',shortName:'B',color:'#887766',capitalRegionId:'province:00004',governmentType:'unspecified'}],ownership:Object.fromEntries(hierarchy.territories.map((t,i)=>[t.id,i<3?'A':i===4?null:'B'])),population};
}
module.exports={hierarchy,adjacency,createScenario};
