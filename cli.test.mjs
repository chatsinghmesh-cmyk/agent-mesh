import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync,spawn} from 'node:child_process';
import http from 'node:http';
import {mkdirSync,mkdtempSync,existsSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const scratch=resolve('work/cli-tests');mkdirSync(scratch,{recursive:true});
const bin=new URL('./cli/bin/agent-mesh.mjs',import.meta.url);
function run(args){const dir=mkdtempSync(join(scratch,'case-')),profile=join(dir,'profile');const p=spawnSync(process.execPath,[bin.pathname.replace(/^\/([A-Za-z]:)/,'$1'),...args],{encoding:'utf8',cwd:dir,env:{...process.env,AGENT_MESH_DATA_DIR:profile}});return {...p,profile};}
test('CLI help/version work outside the source checkout without creating identity folders',()=>{
 for(const args of [[],['--help'],['connect','--help'],['--version']]){const p=run(args);assert.equal(p.status,0,p.stderr);assert.equal(existsSync(p.profile),false);assert.ok(p.stdout.includes('Agent Mesh')||p.stdout.trim()===JSON.parse(readFileSync(new URL('./cli/package.json',import.meta.url),'utf8')).version);}
});
test('CLI validates bad commands and options before registration or local writes',()=>{
 for(const args of [['search'],['search','--query','test','--limit','51'],['search','--query','x'.repeat(201)],['conect'],['connect','--topcis','demo'],['connect','--data'],['connect','--api-port','0'],['connect','--topics','one,,two'],['send','--to','peer']]){const p=run(args);assert.equal(p.status,1,p.stdout);assert.equal(existsSync(p.profile),false);assert.match(p.stderr,/Agent Mesh:/);}
});

test('ranked CLI search works without identity or local process and encodes task queries',async t=>{
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');assert.equal(u.pathname,'/topics/search');assert.equal(u.searchParams.get('q'),'review C++');assert.equal(u.searchParams.get('limit'),'3');assert.equal(u.searchParams.get('online'),'false');res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({query:'review C++',results:[{topic:'cpp-review'}]}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const dir=mkdtempSync(join(scratch,'search-')),profile=join(dir,'profile');
 const child=spawn(process.execPath,[bin.pathname.replace(/^\/([A-Za-z]:)/,'$1'),'search','--query','review C++','--limit','3','--include-offline','--directory','http://127.0.0.1:'+server.address().port],{cwd:dir,env:{...process.env,AGENT_MESH_DATA_DIR:profile}});
 let output='',errors='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>errors+=c);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});assert.equal(code,0,errors);assert.equal(JSON.parse(output).results[0].topic,'cpp-review');assert.equal(existsSync(profile),false);
});
test('CLI resolves its persistent data folder and gives an actionable missing-identity error',()=>{
 const p=run(['info']);assert.equal(p.status,1);assert.match(p.stderr,/No identity found/);assert.ok(p.stderr.includes(p.profile));
});
