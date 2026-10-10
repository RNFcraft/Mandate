// Isolated read-only CommonJS graph for the user-specified pre-fix commit.
// Used only when the user runs equivalence tests; never alters require.cache.
const path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{execFileSync}=require('node:child_process');
const revision='d59dfb5508fd5ed69cca6d10440d602ca1c5a365';
function baseline(){
  const root=path.resolve(__dirname,'../..'),shared=path.join(root,'shared'),modules=new Map();
  function load(filename){
    if(modules.has(filename))return modules.get(filename).exports;
    const relative=path.relative(root,filename).split(path.sep).join('/'),source=execFileSync('git',['show',revision+':'+relative],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024}),module={exports:{}};
    modules.set(filename,module);
    const native=createRequire(filename),requireLocal=id=>{const resolved=native.resolve(id);return resolved.startsWith(shared+path.sep)&&resolved.endsWith('.cjs')?load(resolved):native(id);};
    vm.runInThisContext('(function(exports,require,module,__filename,__dirname){\n'+source+'\n})',{filename:revision+':'+relative})(module.exports,requireLocal,module,filename,path.dirname(filename));
    return module.exports;
  }
  return name=>load(path.join(shared,name));
}
module.exports={baseline,revision};
