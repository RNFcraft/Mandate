const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../client');
const scenarios = require('./scenarios.cjs');
const political = require('./political.cjs');
const { validateScenario } = require('../shared/scenario.cjs');
let territoryIds;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api/political' && req.method === 'POST') {
    (async()=>{
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>16*1024*1024)throw new Error('Request too large');chunks.push(chunk);}
      const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!territoryIds)territoryIds=new Set(JSON.parse(fs.readFileSync(path.resolve(root,'data/adm2/hierarchy.json'),'utf8')).territories.map(r=>r.id));
      validateScenario(data,territoryIds);
      const result=await political(data.ownership);
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(result));
    })().catch(error=>{res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));});return;
  }
  if (pathname.startsWith('/api/scenarios')) { scenarios(req, res, pathname); return; }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}).listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log(`Mandate map: http://127.0.0.1:${process.env.PORT || 3000}`));
