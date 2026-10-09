// Opt-in measured runs, separate from CI. Child process CPU includes pool threads.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
async function main(args){
  const options={months:12,repeat:1,sizes:[0,1,2,4,6,8],output:null};
  for(let i=0;i<args.length;i++){const key=args[i],value=args[++i];if(!value)throw Error('Missing option');if(key==='--months')options.months=Number(value);else if(key==='--repeat')options.repeat=Number(value);else if(key==='--sizes')options.sizes=value.split(',').map(Number);else if(key==='--output')options.output=path.resolve(value);else throw Error('Unknown option '+key);}
  if(!Number.isInteger(options.months)||options.months<1||options.months>6000||!Number.isInteger(options.repeat)||options.repeat<1||options.repeat>10||!options.sizes.length||options.sizes.some(n=>!Number.isInteger(n)||n<0||n>8))throw Error('Invalid benchmark settings');
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mandate-performance-')),runs=[];let reference;
  for(let run=0;run<options.repeat;run++)for(const size of options.sizes){
    const base=path.join(directory,`${run}-${size}`),log=await fs.open(base+'.txt','w');
    try{await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.resolve(__dirname,'world-economy-demo.cjs'),'--autonomous','--workers',String(size),'--months',String(options.months),'--summary-every','120','--benchmark','--stats',base+'-stats.json','--save',base+'-save.json'],{cwd:path.resolve(__dirname,'..'),stdio:['ignore',log.fd,log.fd]});child.on('error',reject);child.on('exit',code=>code?reject(Error('Benchmark failed; see '+base+'.txt')):resolve());});}finally{await log.close();}
    const save=JSON.parse(await fs.readFile(base+'-save.json','utf8')),hash=crypto.createHash('sha256').update(JSON.stringify(save.state)).digest('hex'),stats=JSON.parse(await fs.readFile(base+'-stats.json','utf8'));
    if(reference&&reference!==hash)throw Error('Full GameState mismatch: '+base);reference??=hash;
    runs.push({run,workers:size,hash,date:save.state.clock.date,times:stats.times,counts:{provinces:5001,markets:save.state.systems.economy.markets.length,enterprises:save.state.systems.economy.enterprises.length,settlements:save.state.systems.settlements.rows.length,population:stats.annual.at(-1).population},cash:stats.annual.at(-1).cash});console.log(JSON.stringify(runs.at(-1)));
  }
  const report={synthetic:true,options,cpu:os.cpus()[0].model,logicalProcessors:os.availableParallelism(),node:process.version,directory,runs};if(options.output)await fs.writeFile(options.output,JSON.stringify(report,null,2));return report;
}
module.exports={main};if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
