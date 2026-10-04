const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {TAG}=require('../shared/scenario.cjs');
const {validateSave}=require('../shared/save.cjs');
const ROOT=path.resolve(__dirname,'../saves');
const validId=id=>TAG.test(id)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(id);
let hierarchyPromise,queue=Promise.resolve();
const hierarchy=()=>hierarchyPromise||=fs.readFile(path.resolve(__dirname,'../client/data/adm2/hierarchy.json'),'utf8').then(JSON.parse);
function reply(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(value));}
async function noLink(file){try{if((await fs.lstat(file)).isSymbolicLink())throw new Error('Save symlinks are not allowed');}catch(e){if(e.code!=='ENOENT')throw e;}}
function folderOf(id){if(!validId(id))throw new Error('Invalid save ID');const folder=path.resolve(ROOT,id);if(path.dirname(folder)!==ROOT)throw new Error('Invalid save path');return folder;}
async function read(id){const folder=folderOf(id);await noLink(ROOT);await noLink(folder);await noLink(path.join(folder,'save.json'));return JSON.parse(await fs.readFile(path.join(folder,'save.json'),'utf8'));}
async function handle(req,res,pathname){
  if(pathname==='/api/saves'&&req.method==='GET'){
    await noLink(ROOT);let entries;try{entries=await fs.readdir(ROOT,{withFileTypes:true});}catch(e){if(e.code!=='ENOENT')throw e;entries=[];}
    const result=[];
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name,'en')))if(entry.isDirectory()&&validId(entry.name)){
      let save;try{save=await read(entry.name);}catch(e){if(e.code==='ENOENT')continue;throw e;}
      result.push({id:entry.name,scenarioId:save.scenarioId,geography:save.geography,date:save.state?.clock?.date,tick:save.state?.clock?.tick});
    }
    reply(res,200,result);return;
  }
  const match=/^\/api\/saves\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})$/.exec(pathname);
  if(!match||!validId(match[1])){reply(res,400,{error:'Invalid save ID or path'});return;}
  const id=match[1];
  if(req.method==='GET'){const save=await read(id);validateSave(save,await hierarchy());reply(res,200,save);return;}
  if(req.method!=='PUT'){reply(res,405,{error:'Method not allowed'});return;}
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){reply(res,403,{error:'Invalid request origin'});return;}
  if(!(req.headers['content-type']||'').startsWith('application/json')){reply(res,415,{error:'Expected JSON'});return;}
  const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>16*1024*1024){reply(res,413,{error:'Save is too large'});return;}parts.push(part);}
  const save=JSON.parse(Buffer.concat(parts).toString('utf8'));validateSave(save,await hierarchy());
  const folder=folderOf(id),target=path.join(folder,'save.json'),temporary=path.join(folder,`.save-${randomUUID()}.tmp`);
  await noLink(ROOT);await fs.mkdir(ROOT,{recursive:true});await noLink(folder);await fs.mkdir(folder,{recursive:true});await noLink(target);
  if(path.dirname(temporary)!==folder||path.dirname(target)!==folder)throw new Error('Invalid save path');
  try{
    const file=await fs.open(temporary,'wx');try{await file.writeFile(JSON.stringify(save));await file.sync();}finally{await file.close();}
    // Rename replaces one file atomically; failed replacement leaves the old save intact.
    await fs.rename(temporary,target);reply(res,200,{saved:id});
  }finally{await fs.unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
module.exports=(req,res,pathname)=>{
  queue=queue.then(()=>handle(req,res,pathname)).catch(error=>{
    if(res.headersSent)return;
    const missing=error.code==='ENOENT';reply(res,missing?404:error.code?500:400,{error:missing?'Save not found':error.code?'Unable to access save':error.message});
  });
};
