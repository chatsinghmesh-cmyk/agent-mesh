import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DirectTransport} from './webrtc.mjs';
import {identity,seal,open} from './crypto.mjs';
import {Registry} from './registry.mjs';
import {validateSignal} from './signaling.mjs';
test('real WebRTC channels deliver encrypted messages in both directions, including simultaneous sends',{timeout:20000},async t=>{
 const meA=identity(),meB=identity(),asPeer=me=>({id:me.id,signingKey:me.signing.public,encryptionKey:me.encryption.public});
 const gotA=[],gotB=[];
 const a=new DirectTransport({identity:meA,directory:'',iceServers:[],timeoutMs:12000,receive:async m=>gotA.push(open(meA,asPeer(meB),m))});
 const b=new DirectTransport({identity:meB,directory:'',iceServers:[],timeoutMs:12000,receive:async m=>gotB.push(open(meB,asPeer(meA),m))});
 a.signal=(to,kind,session,sdp)=>{queueMicrotask(()=>b.handleSignal({from:meA.id,to,kind,session,sdp}).catch(e=>b.drop(meA.id,e)));};
 b.signal=(to,kind,session,sdp)=>{queueMicrotask(()=>a.handleSignal({from:meB.id,to,kind,session,sdp}).catch(e=>a.drop(meB.id,e)));};
 t.after(()=>{a.close();b.close();});
 const text='hello across direct encrypted channel';
 await Promise.all([a.send(meB.id,seal(meA,asPeer(meB),'demo',text)),b.send(meA.id,seal(meB,asPeer(meA),'demo','reply'))]);
 assert.deepEqual(gotA,['reply']);assert.deepEqual(gotB,[text]);
 await a.send(meB.id,seal(meA,asPeer(meB),'demo','x'.repeat(16000)));assert.equal(gotB[1].length,16000);
});
test('hosted signaling accepts only authenticated connection setup for shared topics',()=>{
 const r=new Registry(),agents=[identity(),identity()];
 for(const a of agents){const [,auth]=r.handle('POST','/register',{id:a.id,signingKey:a.signing.public,encryptionKey:a.encryption.public});a.token=auth.recoveryToken;assert.equal(r.handle('POST','/presence',{id:a.id,topics:['demo'],endpoint:'webrtc:'+a.id},a.token)[0],200);}
 const [a,b]=agents,message={to:b.id,kind:'knock',session:'a'.repeat(32)};
 assert.equal(r.authenticate(a.id,a.token),true);assert.equal(r.authenticate(a.id,b.token),false);
 assert.equal(validateSignal(a.id,message,r.records).from,a.id);
 assert.throws(()=>validateSignal(a.id,{...message,text:'chat must not pass here'},r.records));
 assert.throws(()=>validateSignal(a.id,{...message,kind:'message'},r.records));
 assert.equal(r.handle('POST','/presence',{id:a.id,topics:['demo'],endpoint:'webrtc:'+b.id},a.token)[0],400);
 r.records[b.id].topics=['another'];assert.throws(()=>validateSignal(a.id,message,r.records));
 r.records[b.id].topics=['demo'];r.records[b.id].seen=0;assert.throws(()=>validateSignal(a.id,message,r.records));
});
