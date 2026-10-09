// Normal startup builds code only; it never invokes GIS authoring or rewrites data.
Promise.all([
  require('esbuild').build({entryPoints:['client/map/main.js'],outfile:'client/map.bundle.js',bundle:true,format:'esm',minify:true,sourcemap:true,external:['/editor/audit.js']}),
  require('esbuild').build({entryPoints:['client/map/raster-worker.js'],outfile:'client/raster-worker.bundle.js',bundle:true,format:'esm',minify:true,sourcemap:true}),
  require('esbuild').build({entryPoints:['client/game/simulation-worker.js'],outfile:'client/simulation-worker.bundle.js',bundle:true,format:'esm',minify:true,sourcemap:true}),
  require('esbuild').build({entryPoints:['client/game/economy-worker.js'],outfile:'client/economy-worker.bundle.js',bundle:true,format:'esm',minify:true,sourcemap:true})
]).catch(e=>{console.error(e);process.exitCode=1;});
