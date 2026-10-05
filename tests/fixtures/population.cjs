const hierarchy={id:'mandate-atomic-v1',adm0:[{id:'A'}],adm1:[{id:'p',adm0Id:'A'}],territories:[{id:'gb:A:1',adm0Id:'A',adm1Id:'p',kind:'adm2'},{id:'residual:A:p',adm0Id:'A',adm1Id:'p',kind:'residual'}]};
const population={version:1,cultures:[{id:'c-a',name:'Culture A'},{id:'c-b',name:'Culture B'}],religions:[{id:'r-a',name:'Religion A'},{id:'r-b',name:'Religion B'}],strata:[{id:'s-a',name:'Stratum A'},{id:'s-b',name:'Stratum B'},{id:'s-c',name:'Stratum C'}],cohorts:[
  {id:'pop-1',territoryId:'gb:A:1',cultureId:'c-a',religionId:'r-a',stratumId:'s-a',settlement:'rural',count:100001,literacyBps:800,birthRateBps:351,deathRateBps:281},
  {id:'pop-2',territoryId:'gb:A:1',cultureId:'c-b',religionId:'r-b',stratumId:'s-b',settlement:'urban',count:12345,literacyBps:5000,birthRateBps:413,deathRateBps:219},
  {id:'pop-3',territoryId:'residual:A:p',cultureId:'c-a',religionId:'r-b',stratumId:'s-c',settlement:'rural',count:7,literacyBps:10000,birthRateBps:10000,deathRateBps:0}
]};
const scenario={scenario:{id:'fixture',name:'Synthetic fixture',year:1700,version:3,geography:hierarchy.id},countries:[{id:'A',name:'A',shortName:'A',color:'#778899',capitalRegionId:'gb:A:1',governmentType:'unspecified'}],ownership:{'gb:A:1':'A','residual:A:p':null},population};
module.exports={hierarchy,population,scenario};
