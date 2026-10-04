const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
async function main(){
  process.chdir(path.resolve(__dirname,'..'));
  const files=['client/data/adm2/derived.topo.json',...['atomic.topo.json','matching.json','migration.json','report.json','excluded.json','invariants.json','scenario-migration.json','coverage-exceptions.json'].map(f=>`data/processed/canonical/${f}`),'client/data/adm2/hierarchy.json','client/data/adm2/manifest.json',...['detail.topo.json','coarse.topo.json','matching.json','report.json','migration.json'].map(f=>`data/processed/adm2/${f}`)];
  for(const f of (await fs.readdir('client/data/adm2/chunks')).sort())files.push(`client/data/adm2/chunks/${f}`);
  for(const id of ['modern','1700'])for(const f of (await fs.readdir(`scenarios/${id}`)).filter(f=>f.endsWith('.json')).sort())files.push(`scenarios/${id}/${f}`);
  const hashes={};for(const f of files)hashes[f]=crypto.createHash('sha256').update(await fs.readFile(f)).digest('hex');
  await fs.mkdir('test-results',{recursive:true});
  if(process.argv.includes('--snapshot')){await fs.writeFile('data/processed/adm2/repro-before.json',JSON.stringify(hashes));await fs.writeFile('test-results/adm2-audit-repro-before.json',JSON.stringify(hashes));console.log(`Saved ${files.length} hashes`);return;}
  const before=JSON.parse(await fs.readFile('data/processed/adm2/repro-before.json','utf8'));
  const changed=[...new Set([...Object.keys(before),...files])].filter(f=>before[f]!==hashes[f]);
  const result={checked:files.length,changed};await fs.writeFile('data/processed/adm2/repro-result.json',JSON.stringify(result,null,2));await fs.writeFile('test-results/adm2-audit-repro-result.json',JSON.stringify(result,null,2));console.log(result);if(changed.length)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
