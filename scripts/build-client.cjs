// Normal startup builds code only; it never invokes GIS authoring or rewrites data.
require('esbuild').build({entryPoints:['client/map/main.js'],outfile:'client/map.bundle.js',bundle:true,format:'esm',minify:true,sourcemap:true,external:['/editor/audit.js']}).catch(e=>{console.error(e);process.exitCode=1;});
