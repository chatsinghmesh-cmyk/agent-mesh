import {readdir,readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),files=[];
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name==='node_modules')continue;const url=new URL(entry.name+(entry.isDirectory()?'/':''),dir);if(entry.isDirectory())await walk(url);else if(/\.(cjs|mjs)$/.test(entry.name))files.push(url);}}
await walk(root);
for(const file of files){if(file.pathname.includes('/scripts/'))continue;const source=await readFile(file,'utf8');if(/(?:require\s*\(|from\s*)['"][^'"]*(?:agent|registry|crypto|worker)\.mjs['"]/.test(source))throw Error('Integration imports platform internals: '+file.pathname);}
console.log('PASS: developer integrations do not import platform internals.');
