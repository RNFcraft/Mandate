// Opt-in Production v1 content. Coefficients are gameplay simplifications,
// not historical estimates. No enterprises, prices or resource geography here.
// IDs use the existing Economy v1 schema; food remains compatible with old saves.
const goods=[
  ['grain','Grain'],['flour','Flour'],['food','Food'],
  ['fiber','Textile fiber'],['yarn','Yarn'],['cloth','Cloth'],['clothing','Clothing'],
  ['timber','Timber'],['charcoal','Charcoal'],['iron-ore','Iron ore'],['iron','Iron'],['tools','Tools']
].map(([id,name])=>({id,name,quantityUnit:'unit',minPriceMinor:1,maxPriceMinor:10000}));
const recipes=[
  {id:'grow-grain',inputs:[],output:{goodId:'grain',quantity:4},workersPerBatch:1},
  {id:'mill-flour',inputs:[{goodId:'grain',quantity:4}],output:{goodId:'flour',quantity:3},workersPerBatch:1},
  {id:'prepare-food',inputs:[{goodId:'flour',quantity:3}],output:{goodId:'food',quantity:3},workersPerBatch:1},
  {id:'grow-fiber',inputs:[],output:{goodId:'fiber',quantity:4},workersPerBatch:1},
  {id:'spin-yarn',inputs:[{goodId:'fiber',quantity:4}],output:{goodId:'yarn',quantity:3},workersPerBatch:1},
  {id:'weave-cloth',inputs:[{goodId:'yarn',quantity:3}],output:{goodId:'cloth',quantity:2},workersPerBatch:1},
  {id:'sew-clothing',inputs:[{goodId:'cloth',quantity:2}],output:{goodId:'clothing',quantity:1},workersPerBatch:1},
  {id:'harvest-timber',inputs:[],output:{goodId:'timber',quantity:4},workersPerBatch:1},
  {id:'make-charcoal',inputs:[{goodId:'timber',quantity:4}],output:{goodId:'charcoal',quantity:2},workersPerBatch:1},
  {id:'mine-iron-ore',inputs:[],output:{goodId:'iron-ore',quantity:3},workersPerBatch:1},
  {id:'smelt-iron',inputs:[{goodId:'iron-ore',quantity:3},{goodId:'charcoal',quantity:2}],output:{goodId:'iron',quantity:2},workersPerBatch:2},
  {id:'forge-tools',inputs:[{goodId:'iron',quantity:2}],output:{goodId:'tools',quantity:1},workersPerBatch:1}
];
// Protect reusable definitions from scenario canonicalization or caller edits.
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
module.exports=freeze({goods,recipes});
