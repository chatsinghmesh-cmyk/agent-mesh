import test from 'node:test';import assert from 'node:assert/strict';
import {Registry} from '../registry.mjs';import {identity,seal,open} from '../crypto.mjs';
import {handleDrops,DROP_TTL} from '../drops.mjs';
function fixture(){const registry=new Registry(),data=new Map(),storage={get:async k=>data.get(k),put:async(k,v)=>data.set(k,v),delete:async k=>data.delete(k),list:async({prefix})=>new Map([...data].filter(([k])=>k.startsWith(prefix)))};
 const agents=[identity(),identity(),identity()];for(const a of agents){const [,r]=registry.handle('POST','/register',{id:a.id,signingKey:a.signing.public,encryptionKey:a.encryption.public});a.token=r.recoveryToken;registry.handle('POST','/presence',{id:a.id,topics:['demo'],endpoint:'webrtc:'+a.id},a.token);registry.handle('POST','/offline',{id:a.id},a.token)}
 const peer=a=>({id:a.id,signingKey:a.signing.public,encryptionKey:a.encryption.public});return {registry,data,storage,agents,peer,call:(a,path,body={},now)=>handleDrops(storage,registry,'/drops/'+path,{id:a.id,...body},a.token,now)};}
test('offline drop is encrypted, single pending, recipient-only and freed only by matching ack',async()=>{
 const {agents:[a,b,c],peer,call,data}=fixture(),envelope=seal(a,peer(b),'demo','offline hello');
 assert.equal((await call(a,'send',{envelope}))[0],201);assert.ok(!JSON.stringify([...data]).includes('offline hello'));
 assert.equal((await call(a,'send',{envelope}))[0],200);
 assert.equal((await call(a,'send',{envelope:seal(a,peer(b),'demo','second')}))[0],409);
 assert.deepEqual((await call(c,'pull'))[1],[]);const drops=(await call(b,'pull'))[1];assert.equal(open(b,peer(a),drops[0].envelope),'offline hello');
 await call(c,'ack',{from:a.id,messageId:envelope.id});assert.equal((await call(b,'pull'))[1].length,1);
 await call(b,'ack',{from:a.id,messageId:'0'.repeat(32)});assert.equal((await call(b,'pull'))[1].length,1);
 await call(b,'ack',{from:a.id,messageId:envelope.id});assert.equal((await call(b,'pull'))[1].length,0);
 const next=seal(a,peer(b),'demo','next');assert.equal((await call(a,'send',{envelope:next}))[0],201);
 await call(b,'ack',{from:a.id,messageId:envelope.id});assert.equal((await call(b,'pull'))[1][0].envelope.id,next.id);
});
test('drops reject tampering, oversized ciphertext, missing topics and wrong tokens; expiry frees slot',async()=>{
 const {agents:[a,b],peer,call,registry,storage}=fixture(),now=Date.now(),e=seal(a,peer(b),'demo','hello');
 assert.equal((await handleDrops(storage,registry,'/drops/pull',{id:b.id},a.token))[0],401);
 assert.equal((await call(a,'send',{envelope:{...e,topic:'other'}}))[0],400);
 assert.equal((await call(a,'send',{envelope:{...e,data:'AAAA'}}))[0],400);
 assert.equal((await call(a,'send',{envelope:seal(a,peer(b),'demo','x'.repeat(2001))}))[0],400);
 assert.equal((await call(a,'send',{envelope:e},now))[0],201);
 assert.deepEqual((await call(b,'pull',{},now+DROP_TTL+1))[1],[]);
 assert.equal((await call(a,'send',{envelope:seal(a,peer(b),'demo','replacement')}))[0],201);
});
test('old encrypted drops open only with the explicit extended window',()=>{
 const a=identity(),b=identity(),peer={id:b.id,signingKey:b.signing.public,encryptionKey:b.encryption.public},sender={id:a.id,signingKey:a.signing.public,encryptionKey:a.encryption.public};
 const realNow=Date.now;let envelope;
 try{Date.now=()=>realNow()-86400000;envelope=seal(a,peer,'demo','saved yesterday');}finally{Date.now=realNow;}
 assert.throws(()=>open(b,sender,envelope));
 assert.equal(open(b,sender,envelope,DROP_TTL+300000),'saved yesterday');
});
