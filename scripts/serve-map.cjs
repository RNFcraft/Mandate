const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../client');
const scenarios = require('./scenarios.cjs');
const saves = require('./saves.cjs');
const { validateScenario } = require('../shared/scenario.cjs');
let territoryIds;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
// Serve existing originals without copying them into client/. Three PNG-named
// house sources contain JPEG bytes; their public extension and MIME agree.
const spriteNames=['farm_sprite','mill_sprite','manifacture_sprite','mine_sprite','wood_sprite','market_sprite','Home1700s','home1700s2','home1700s3','rish-house'];
const spriteRoutes=new Map(spriteNames.map(name=>{const jpeg=['Home1700s','home1700s2','home1700s3'].includes(name);return [`/sprites/${name}.${jpeg?'jpg':'png'}`,{file:path.resolve(__dirname,'../sprites',name+'.png'),type:jpeg?'image/jpeg':'image/png'}];}));
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if(pathname.startsWith('/sprites/')){
    const sprite=spriteRoutes.get(pathname);
    if(!sprite||!['GET','HEAD'].includes(req.method)){res.writeHead(404).end();return;}
    fs.stat(sprite.file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}
      res.writeHead(200,{'Content-Type':sprite.type,'Content-Length':stat.size,'Cache-Control':'public, max-age=3600'});
      if(req.method==='HEAD')res.end();else fs.createReadStream(sprite.file).pipe(res);
    });return;
  }
  if (pathname.startsWith('/api/adm2-audit/')) {
    // Explicit DEV request; private audit files are never in the static client root.
    const name=pathname.slice('/api/adm2-audit/'.length);
    if(req.method!=='GET'||req.headers['x-mandate-dev']!=='1'||!['summary','records','overlaps'].includes(name)){res.writeHead(403).end();return;}
    const file=path.resolve(__dirname,`../data/processed/adm2/audit/${name}.json`);
    fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Run npm run audit:adm2 first'}));return;}res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);});return;
  }
  if (pathname === '/api/political' && req.method === 'POST') {
    if(req.headers['x-mandate-atomic-debug']!=='1'){res.writeHead(403,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Atomic political worker is debug-only'}));return;}
    (async()=>{
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>16*1024*1024)throw new Error('Request too large');chunks.push(chunk);}
      const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!territoryIds)territoryIds=new Set(JSON.parse(fs.readFileSync(path.resolve(root,'data/adm2/hierarchy.json'),'utf8')).territories.map(r=>r.id));
      validateScenario(data,territoryIds);
      const result=await require('./political.cjs')(data.ownership);
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(result));
    })().catch(error=>{res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));});return;
  }
  const presentation=/^\/api\/scenarios\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})\/economy-visuals$/.exec(pathname);
  if(presentation&&req.method==='GET'){
    fs.readFile(path.resolve(__dirname,'../scenarios',presentation[1],'economy-visuals.json'),'utf8',(error,bytes)=>{
      if(error){if(error.code==='ENOENT')res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end('{"recipeSprites":{}}');else res.writeHead(500).end();return;}
      try{const value=JSON.parse(bytes);if(!value||typeof value.recipeSprites!=='object'||Array.isArray(value.recipeSprites))throw Error('Invalid presentation mapping');
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(value));
      }catch{res.writeHead(400).end();}
    });return;
  }
  if (pathname.startsWith('/api/scenarios')) { scenarios(req, res, pathname); return; }
  if (pathname.startsWith('/api/saves')) { saves(req, res, pathname); return; }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}).listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log(`Mandate map: http://127.0.0.1:${process.env.PORT || 3000}`));
