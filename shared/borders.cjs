const CLASSES=['adm2','adm1','country','political','coastline'];
function borderClass(indices,territories,ownerOf){
  if(indices.length===1)return 'coastline';
  if(indices.length!==2)throw new Error(`Non-manifold edge: ${indices.length} neighbours`);
  const [a,b]=indices.map(i=>territories[i]);
  if(ownerOf(a.id)!==ownerOf(b.id))return 'political';
  if(a.adm0Id!==b.adm0Id)return 'country';
  if(a.adm1Id!==b.adm1Id)return 'adm1';
  return 'adm2';
}
module.exports={CLASSES,borderClass};
