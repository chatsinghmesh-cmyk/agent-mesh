import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import managed from '../src/managed-agent.cjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),extension=fileURLToPath(new URL('../',import.meta.url));
async function freePort(){const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function directory(t){
 const scratch=join(root,'work/extension-tests');await mkdir(scratch,{recursive:true});const folder=await mkdtemp(join(scratch,'case-')),port=await freePort(),url='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,[join(root,'directory.mjs')],{cwd:folder,env:{...process.env,REGISTRY_FILE:join(folder,'registry.json'),PORT:String(port),ELECTRON_RUN_AS_NODE:'1'},stdio:'ignore',windowsHide:true});child.on('error',()=>{});
 t.after(()=>child.kill());const end=Date.now()+10000;
 while(true){try{if((await fetch(url+'/topics')).ok)break;}catch{}assert.ok(Date.now()<end,'Directory did not start');await wait(100);}
 return {folder,url};
}
async function peer(t,dir,name){
 const env={...process.env,AGENT_MESH_DATA_DIR:join(dir.folder,name),AGENT_MESH_DIRECTORY:dir.url,AGENT_MESH_STUN:'none',ELECTRON_RUN_AS_NODE:'1'};delete env.AGENT_MESH_API_TOKEN;delete env.AGENT_MESH_API_URL;
 const transport=new StdioClientTransport({command:process.execPath,args:[join(extension,'dist/mcp/bridge.mjs')],env,stderr:'pipe'});
 const client=new Client({name:'extension-check',version:'1.0.0'});await client.connect(transport);t.after(()=>client.close());
 const call=async(name,args={})=>{const value=await client.callTool({name,arguments:args},undefined,{timeout:90000});assert.ok(!value.isError,value.content?.[0]?.text);return JSON.parse(value.content[0].text);};
 return {client,call};
}
test('packaged MCP bridge starts two real agents, joins topics, searches peers and delivers P2P messages',{timeout:120000},async t=>{
 const dir=await directory(t),a=await peer(t,dir,'a'),b=await peer(t,dir,'b');
 assert.equal((await a.client.listTools()).tools.length,12);assert.equal((await a.call('connection_status')).connected,false);
 const [first,second]=await Promise.all([a.call('connect_topics',{topics:['coding-help']}),b.call('connect_topics',{topics:['coding-help']})]);
 assert.equal(first.connected,true);assert.equal(second.connected,true);assert.notEqual(first.id,second.id);
 const found=await a.call('search_topics',{query:'developer',limit:3});assert.equal(found.results[0].topic,'coding-help');assert.equal(found.results[0].onlineCount,2);
 assert.equal((await a.call('list_peers',{topic:'coding-help'})).length,2);
 const delivered=await a.call('send_message',{to:second.id,topic:'coding-help',text:'Extension MCP integration message'});assert.equal(delivered.delivered,true);
 const history=await b.call('read_history');assert.ok(history.some(m=>m.text==='Extension MCP integration message'));
 const joined=await a.call('connect_topics',{topics:['python-code-review']});assert.equal(joined.id,first.id);assert.ok(joined.topics.includes('coding-help'));assert.ok(joined.topics.includes('python-code-review'));
 const credentials=JSON.parse(await readFile(join(dir.folder,'a/identity.json'),'utf8'));assert.doesNotMatch(JSON.stringify(joined),new RegExp(credentials.apiToken));
});
test('a second session attaches to the same identity without duplicating or stopping the owner',{timeout:45000},async t=>{
 const dir=await directory(t),options={dataDir:join(dir.folder,'shared'),cliPath:join(extension,'node_modules/@chat_singh/cli/bin/agent-mesh.mjs'),directory:dir.url,stun:'none'};
 const owner=new managed.ManagedAgent(options),other=new managed.ManagedAgent(options);t.after(()=>owner.dispose());t.after(()=>other.dispose());
 const first=await owner.ensure(),second=await other.ensure();assert.equal(first.id,second.id);assert.equal(owner.ownsLock,true);assert.equal(other.ownsLock,false);
 await assert.rejects(other.connectTopics(['coding-help']),/managed outside/);
 await other.dispose();assert.equal((await owner.status()).connected,true);
});
