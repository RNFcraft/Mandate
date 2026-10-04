const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {TAG,migrateAtomic}=require('../shared/scenario.cjs');
const ROOT=path.resolve(__dirname,'../scenarios');
async function migrate(){
  const hierarchy=JSON.parse(await fs.readFile(path.resolve(__dirname,'../client/data/adm2/hierarchy.json'),'utf8'));
  const reportFile=path.resolve(__dirname,'../data/processed/canonical/scenario-migration.json');
  let reports=[];try{reports=JSON.parse(await fs.readFile(reportFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  let migratedCount=0;
  for(const entry of await fs.readdir(ROOT,{withFileTypes:true}))if(entry.isDirectory()&&TAG.test(entry.name)){
    const folder=path.join(ROOT,entry.name),data={},hashes={};
    for(const name of ['scenario','countries','ownership','controllers'])try{const bytes=await fs.readFile(path.join(folder,`${name}.json`));data[name]=JSON.parse(bytes);hashes[name]=crypto.createHash('sha256').update(bytes).digest('hex');}catch(e){if(e.code!=='ENOENT')throw e;}
    if(data.scenario.version===3)continue;
    const next=migrateAtomic(data,hierarchy),backup=path.join(ROOT,'.atomic-backups',entry.name);
    await fs.mkdir(path.dirname(backup),{recursive:true});
    try{await fs.cp(folder,backup,{recursive:true,force:false,errorOnExist:true});}catch(e){if(e.code!=='ERR_FS_CP_EEXIST')throw e;for(const [name,h]of Object.entries(hashes)){const b=await fs.readFile(path.join(backup,`${name}.json`));if(crypto.createHash('sha256').update(b).digest('hex')!==h)throw new Error(`Existing backup differs: ${entry.name}`);}}
    const stage=path.join(ROOT,`.atomic-stage-${entry.name}`),rollback=path.join(ROOT,`.atomic-rollback-${entry.name}`);
    for(const target of [folder,stage,rollback])if(path.dirname(path.resolve(target))!==ROOT)throw new Error('Migration path outside scenarios');
    await fs.cp(folder,stage,{recursive:true,force:false,errorOnExist:true});
    for(const [name,value]of Object.entries(next))await fs.writeFile(path.join(stage,`${name}.json`),JSON.stringify(value,null,2));
    await fs.rename(folder,rollback);
    try{await fs.rename(stage,folder);}catch(e){await fs.rename(rollback,folder);throw e;}
    await fs.rm(rollback,{recursive:true});
    reports=reports.filter(r=>r.id!==entry.name);
    reports.push({id:entry.name,backup:path.relative(path.resolve(__dirname,'..'),backup),sourceHashes:hashes,...next.scenario.territoryMigration});
    migratedCount++;
  }
  reports.sort((a,b)=>a.id.localeCompare(b.id,'en'));
  await fs.writeFile(reportFile,JSON.stringify(reports,null,2));
  console.log(`Migrated ${migratedCount} scenarios with byte-for-byte backups`);return reports;
}
module.exports=migrate;
if(require.main===module)migrate().catch(e=>{console.error(e);process.exitCode=1;});
