const {test}=require('node:test');
const assert=require('node:assert/strict');
const {AgentMeshClient}=require('../index.cjs');
const peers=[{id:'a',topics:['coding-help','research'],online:true},{id:'b',topics:['coding-help'],online:false},{id:'c',topics:['coding-help'],online:true}];
test('topic search filters locally, excludes offline peers and aggregates counts',async()=>{
 const calls=[];const client=new AgentMeshClient({token:'test-token',fetch:async(url,options)=>{calls.push({url,options});return Response.json(peers);}});
 const topics=await client.topics({onlineOnly:true,query:'CODING'});
 assert.deepEqual(topics.map(t=>({topic:t.topic,online:t.onlineCount,ids:t.peers.map(p=>p.id)})),[{topic:'coding-help',online:2,ids:['a','c']}]);
 assert.equal(calls[0].url,'http://127.0.0.1:9001/topics');assert.equal(calls[0].options.headers.authorization,'Bearer test-token');assert.equal(calls[0].options.redirect,'error');
});
test('send uses the existing HTTP contract and never retries delivery',async()=>{
 let calls=0;const message={to:'peer',topic:'coding-help',text:'hello'};
 const client=new AgentMeshClient({token:'token',fetch:async(url,options)=>{calls++;assert.equal(url,'http://127.0.0.1:9001/send');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),message);return Response.json({delivered:true,id:'message-id'});}});
 assert.equal((await client.send(message)).id,'message-id');assert.equal(calls,1);
 await assert.rejects(client.send({...message,text:'😀'.repeat(4001)}),{code:'INVALID_MESSAGE'});assert.equal(calls,1);
});
test('invalid responses, missing history and rejected tokens remain explicit errors',async()=>{
 const client=body=>new AgentMeshClient({token:'private-token',fetch:async()=>body});
 await assert.rejects(client(Response.json({error:'secret'}, {status:401})).peers(),e=>e.code==='UNAUTHORIZED'&&!e.message.includes('private-token'));
 await assert.rejects(client(Response.json({error:'No history file'}, {status:400})).history(),{status:400,code:'API_ERROR'});
 await assert.rejects(client(Response.json({unexpected:true})).peers(),{code:'INVALID_RESPONSE'});
 await assert.rejects(client(new Response('HTML')).history(),{code:'INVALID_RESPONSE'});
});
test('network failures and timeouts do not leak transport internals',async()=>{
 for(const [name,code] of [['TimeoutError','TIMEOUT'],['TypeError','CONNECTION_FAILED']]){const client=new AgentMeshClient({token:'secret',fetch:async()=>{const e=new Error('secret transport');e.name=name;throw e;}});await assert.rejects(client.peers(),e=>e.code===code&&!e.message.includes('secret'));}
});
test('credentials are restricted to loopback APIs, not remote endpoints or redirects',()=>{
 for(const baseUrl of ['https://example.com','http://127.0.0.1.evil.test','http://user:pass@localhost:9001','http://localhost:9001/path'])assert.throws(()=>new AgentMeshClient({baseUrl,token:'secret'}),{code:'INVALID_CONFIG'});
 assert.equal(JSON.stringify(new AgentMeshClient({token:'secret'})),'{}');
});
