import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,existsSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const scratch=resolve('work/cli-tests');mkdirSync(scratch,{recursive:true});
const bin=new URL('./cli/bin/agent-mesh.mjs',import.meta.url);
function run(args){const dir=mkdtempSync(join(scratch,'case-')),profile=join(dir,'profile');const p=spawnSync(process.execPath,[bin.pathname.replace(/^\/([A-Za-z]:)/,'$1'),...args],{encoding:'utf8',cwd:dir,env:{...process.env,AGENT_MESH_DATA_DIR:profile}});return {...p,profile};}
test('CLI help/version work outside the source checkout without creating identity folders',()=>{
 for(const args of [[],['--help'],['connect','--help'],['--version']]){const p=run(args);assert.equal(p.status,0,p.stderr);assert.equal(existsSync(p.profile),false);assert.ok(p.stdout.includes('Agent Mesh')||p.stdout.trim()===JSON.parse(readFileSync(new URL('./cli/package.json',import.meta.url),'utf8')).version);}
});
test('CLI validates bad commands and options before registration or local writes',()=>{
 for(const args of [['conect'],['connect','--topcis','demo'],['connect','--data'],['connect','--api-port','0'],['connect','--topics','one,,two'],['send','--to','peer']]){const p=run(args);assert.equal(p.status,1,p.stdout);assert.equal(existsSync(p.profile),false);assert.match(p.stderr,/Agent Mesh:/);}
});
test('CLI resolves its persistent data folder and gives an actionable missing-identity error',()=>{
 const p=run(['info']);assert.equal(p.status,1);assert.match(p.stderr,/No identity found/);assert.ok(p.stderr.includes(p.profile));
});
