import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {configuration} from '../server.mjs';

test('configuration requires local API credentials and rejects remote/token-bearing URLs',async()=>{
  await assert.rejects(configuration({}),/Set AGENT_MESH/);
  for(const base of ['https://example.com','http://example.com','http://127.0.0.1/?token=x','http://user:pass@localhost'])await assert.rejects(configuration({AGENT_MESH_API_URL:base,AGENT_MESH_API_TOKEN:'secret'}),/loopback/);
  assert.equal((await configuration({AGENT_MESH_API_TOKEN:'secret'})).baseUrl,'http://127.0.0.1:9001');
});

test('official MCP client discovers tools and invokes authenticated API routes over stdio',async t=>{
  const calls=[];let unauthorized=false;
  const api=http.createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    calls.push({path:req.url,auth:req.headers.authorization,body:raw?JSON.parse(raw):undefined});
    res.setHeader('content-type','application/json');
    if(unauthorized){res.statusCode=401;return res.end(JSON.stringify({error:'secret must not leak'}));}
    const data=req.url.startsWith('/topics/search?')?{query:'cod',onlineOnly:true,total:1,results:[{topic:'coding',score:2,onlineCount:1,peerCount:1,matchedTerms:['cod'],peers:[{id:'a'.repeat(64),online:true}]}]}:req.url==='/history'?[{from:'a'.repeat(64),text:'hello'},{from:'b'.repeat(64),text:'other'}]:{ok:true};
    res.end(JSON.stringify(data));
  });
  await new Promise(r=>api.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>api.close(r)));
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../server.mjs',import.meta.url))],env:{...process.env,AGENT_MESH_DATA_DIR:'',AGENT_MESH_API_URL:`http://127.0.0.1:${api.address().port}`,AGENT_MESH_API_TOKEN:'test-token'},stderr:'pipe'});
  const client=new Client({name:'mesh-test',version:'1.0.0'});
  await client.connect(transport);t.after(()=>client.close());
  assert.equal((await client.listTools()).tools.length,9);
  const call=(name,args={})=>client.callTool({name,arguments:args});
  const topics=await call('search_topics',{query:'cod'});
  assert.equal(JSON.parse(topics.content[0].text).results.length,1);
  assert.equal(calls.at(-1).path,'/topics/search?q=cod&online=true&limit=10');
  const msg={to:'a'.repeat(64),topic:'coding',text:'test'};
  await call('send_message',msg);assert.deepEqual(calls.at(-1).body,msg);
  await call('drop_message',msg);assert.equal(calls.at(-1).path,'/drop');
  const count=calls.length;
  assert.equal((await call('drop_message',{...msg,text:'x'.repeat(501)})).isError,true);assert.equal(calls.length,count);
  assert.equal(JSON.parse((await call('read_history',{peer:'a'.repeat(64),limit:1})).content[0].text)[0].text,'hello');
  await call('list_groups');assert.equal(calls.at(-1).path,'/groups');
  await call('view_group',{groupId:'c'.repeat(32)});assert.equal(calls.at(-1).body.action,'view');
  await call('create_group',{name:'Test'});assert.equal(calls.at(-1).body.action,'create');
  await call('manage_group',{action:'approve',groupId:'c'.repeat(32),target:'a'.repeat(64)});assert.equal(calls.at(-1).body.target,'a'.repeat(64));
  assert.equal((await call('manage_group',{action:'remove',groupId:'c'.repeat(32)})).isError,true);
  await call('group_send',{groupId:'c'.repeat(32),text:'test'});assert.equal(calls.at(-1).path,'/group-send');
  assert.ok(calls.every(c=>c.auth==='Bearer test-token'));
  unauthorized=true;const error=await call('list_groups');assert.equal(error.isError,true);assert.doesNotMatch(JSON.stringify(error),/secret must not leak|test-token/);
});
