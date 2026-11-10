import test from 'node:test';
import assert from 'node:assert/strict';
import * as browser from '../public/browser-crypto.mjs';
import * as terminal from '../crypto.mjs';
import {Directory} from '../worker.mjs';
import {Registry} from '../registry.mjs';
import {createRequest} from '../public/browser-request.mjs';
test('browser and terminal crypto interoperate in both directions',async()=>{
 const a=await browser.identity(),b=terminal.identity();
 const bp={id:b.id,signingKey:b.signing.public,encryptionKey:b.encryption.public};
 const ap={id:a.id,signingKey:a.signing.public,encryptionKey:a.encryption.public};
 assert.equal(terminal.open(b,ap,await browser.seal(a,bp,'demo','Browser → terminal 🌍')),'Browser → terminal 🌍');
 assert.equal(await browser.open(a,bp,terminal.seal(b,ap,'demo','Terminal → browser 🌍')),'Terminal → browser 🌍');
 const m=await browser.seal(a,bp,'demo','original');m.topic='tampered';
 assert.throws(()=>terminal.open(b,ap,m));
 const n=terminal.seal(b,ap,'demo','original');n.data='AAAA';
 await assert.rejects(()=>browser.open(a,bp,n));
 a.recoveryToken='a'.repeat(43);await browser.validateIdentity(a);
 await assert.rejects(()=>browser.validateIdentity({...a,id:'0'.repeat(64)}));
});
test('browser signaling authenticates headers and restricts browser origin',async()=>{
 const me=terminal.identity(),registry=new Registry();
 const [,registered]=registry.handle('POST','/register',{id:me.id,signingKey:me.signing.public,encryptionKey:me.encryption.public});
 const state={storage:{get:async()=>registry.records},blockConcurrencyWhile:fn=>fn()};
 const directory=new Directory(state),url='https://mesh.test/connect?id='+me.id;
 const protocol='agent-mesh-auth.'+registered.recoveryToken;
 const request=headers=>directory.fetch(new Request(url,{headers}));
 assert.equal((await request({'sec-websocket-protocol':protocol,origin:'https://evil.test'})).status,403);
 assert.equal((await request({'sec-websocket-protocol':'agent-mesh-auth.'+'x'.repeat(43),origin:'https://mesh.test'})).status,401);
 assert.equal((await request({'sec-websocket-protocol':protocol,origin:'https://mesh.test'})).status,426);
 assert.equal((await request({authorization:'Bearer '+registered.recoveryToken})).status,426);
 assert.equal((await request({})).status,401);
});
test('browser group requests always use authenticated POST and the current identity',async()=>{
 const calls=[],request=createRequest(()=>({id:'current-agent',recoveryToken:'private-token'}),async(path,options)=>{calls.push({path,...options});return Response.json([]);});
 await request('/groups/list');await request('/groups/view',{id:'other-agent',groupId:'group-id'});await request('/groups/create',{name:'Team'});
 for(const call of calls){assert.equal(call.method,'POST');assert.equal(call.headers.authorization,'Bearer private-token');assert.equal(JSON.parse(call.body).id,'current-agent');}
 await request('/topics');assert.equal(calls.at(-1).method,'GET');assert.equal(calls.at(-1).headers.authorization,undefined);
});
