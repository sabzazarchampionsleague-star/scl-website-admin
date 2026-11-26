import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import path from 'node:path';
const assets={};
function collect(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())collect(p);else {const route='/'+path.relative('public',p).split(path.sep).join('/');assets[route]={data:readFileSync(p).toString('base64'),type:({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.ico':'image/x-icon','.png':'image/png','.jpg':'image/jpeg','.webm':'video/webm','.json':'application/json; charset=utf-8','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8'})[path.extname(p)]||'application/octet-stream'};}}}
collect('public');
mkdirSync('dist/server',{recursive:true});mkdirSync('dist/.openai',{recursive:true});
writeFileSync('dist/server/index.js',readFileSync('broadcast.js','utf8')+'\n'+readFileSync('league.js','utf8')+'\n'+readFileSync('members.js','utf8')+'\n'+readFileSync('public/squad-positions.js','utf8')+'\n'+readFileSync('registration.js','utf8')+'\n'+readFileSync('worker.js','utf8').replace('/* ASSET_MAP */ {}',JSON.stringify(assets)));
writeFileSync('dist/.openai/hosting.json',readFileSync('.openai/hosting.json'));
console.log('Built SCL Worker with '+Object.keys(assets).length+' preserved website assets.');
