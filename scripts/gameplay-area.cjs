// Surface area of polygons whose source edges are linear in longitude/latitude.
// Unlike transforming vertices to sin(latitude), this integral is invariant to
// inserting collinear coastline vertices during shared-topology noding.
function surfaceArea(polygons){
  let total=0;
  for(const p of polygons)for(let j=0;j<p.length;j++){
    const r=p[j],ref=r[0][1]*Math.PI/180;let sum=0,correction=0;
    for(let i=1;i<r.length;i++){
      const a=r[i-1][1]*Math.PI/180,b=r[i][1]*Math.PI/180,half=(b-a)/2,mid=(a+b)/2;
      const sinc=half?Math.sin(half)/half:1;
      const avg=2*Math.cos((mid+ref)/2)*Math.sin((mid-ref)/2)+Math.sin(mid)*(sinc-1);
      const term=(r[i][0]-r[i-1][0])*Math.PI/180*avg-correction,next=sum+term;correction=(next-sum)-term;sum=next;
    }
    total+=(j===0?1:-1)*Math.abs(sum)*6371.0088**2;
  }return Math.max(0,total);
}
module.exports={surfaceArea};
