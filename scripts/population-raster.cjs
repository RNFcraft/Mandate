// ESRI ASCII grids, north-to-south rows, people per cell (not density).
const fs=require('node:fs');
const readline=require('node:readline');
const {createGunzip}=require('node:zlib');
const {createHash}=require('node:crypto');
const HEADER=new Set(['ncols','nrows','xllcorner','yllcorner','xllcenter','yllcenter','cellsize','nodata_value']);
const numeric=/^[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|nan|inf(?:inity)?)$/i;
function value(token){if(!numeric.test(token))throw Error(`Raster: invalid number ${token}`);return /^[-+]?inf/i.test(token)?(token[0]==='-'?-Infinity:Infinity):Number(token);}
function gridOf(h){
  if(!Number.isSafeInteger(h.ncols)||!Number.isSafeInteger(h.nrows)||h.ncols<1||h.nrows<1||h.ncols*h.nrows>100000000)throw Error('Raster: invalid dimensions (maximum 100 million cells)');
  if(!Number.isFinite(h.cellsize)||h.cellsize<=0||h.cellsize>180)throw Error('Raster: invalid cellsize');
  const center=Object.hasOwn(h,'xllcenter');
  if(center!==Object.hasOwn(h,'yllcenter')||center===Object.hasOwn(h,'xllcorner')||center===Object.hasOwn(h,'yllcorner'))throw Error('Raster: specify matching corner or center origins');
  const x=(center?h.xllcenter:h.xllcorner)-(center?h.cellsize/2:0),y=(center?h.yllcenter:h.yllcorner)-(center?h.cellsize/2:0);
  if(!Number.isFinite(x)||!Number.isFinite(y)||x< -180-1e-8||y< -90-1e-8||x+h.ncols*h.cellsize>180+1e-8||y+h.nrows*h.cellsize>90+1e-8)throw Error('Raster: expected longitude/latitude grid in degrees');
  return {ncols:h.ncols,nrows:h.nrows,x,y,cellsize:h.cellsize,nodata:Object.hasOwn(h,'nodata_value')?h.nodata_value:null};
}
async function parseLines(lines){
  const header={};let grid,values,row=0;
  for await(const source of lines){
    const line=source.trim().replace(/^\uFEFF/,'');if(!line)continue;const tokens=line.split(/\s+/),key=tokens[0].toLowerCase();
    if(!grid&&HEADER.has(key)){
      if(tokens.length!==2||Object.hasOwn(header,key))throw Error('Raster: invalid/duplicate header');header[key]=value(tokens[1]);continue;
    }
    if(!grid){grid=gridOf(header);values=new Float64Array(grid.ncols*grid.nrows);}
    if(tokens.length!==grid.ncols||row>=grid.nrows)throw Error('Raster: row width or row count mismatch');
    for(let col=0;col<tokens.length;col++)values[row*grid.ncols+col]=value(tokens[col]);row++;
  }
  if(!grid||row!==grid.nrows)throw Error('Raster: missing data rows');
  return {...grid,values};
}
const parseAscii=text=>parseLines(text.split(/\r?\n/));
async function readAscii(file){
  const source=fs.createReadStream(file),hash=createHash('sha256');source.on('data',chunk=>hash.update(chunk));
  const decoded=file.toLowerCase().endsWith('.gz')?source.pipe(createGunzip()):source;
  if(decoded!==source)source.on('error',error=>decoded.destroy(error));
  const lines=readline.createInterface({input:decoded,crlfDelay:Infinity});
  try{const raster=await parseLines(lines);return {...raster,sha256:hash.digest('hex')};}
  finally{lines.close();source.destroy();if(decoded!==source)decoded.destroy();}
}
function sameGrid(rasters){
  const a=rasters[0];for(const b of rasters.slice(1))for(const key of ['ncols','nrows','x','y','cellsize'])if(a[key]!==b[key])throw Error(`Raster: mismatched grids (${key})`);
  for(const b of rasters.slice(1))if(a.nodata!==b.nodata&&!(Number.isNaN(a.nodata)&&Number.isNaN(b.nodata)))throw Error('Raster: mismatched NODATA semantics/value across total/urban/rural grids');
}
function clean(raster,index){
  const n=raster.values[index];
  if(raster.nodata!==null&&(n===raster.nodata||(Number.isNaN(n)&&Number.isNaN(raster.nodata))))return {value:0,nodata:true};
  if(!Number.isFinite(n)||n<0)return {value:0,invalid:true,original:String(n)};
  return {value:n};
}
module.exports={parseAscii,readAscii,sameGrid,clean};
