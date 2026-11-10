import {test} from 'node:test';
import assert from 'node:assert/strict';
import {identity,seal,open} from './crypto.mjs';
import {Registry} from './registry.mjs';
test('encrypted messages verify recipient, signature and tampering',()=>{
 const a=identity(),b=identity(),c=identity();const peer=x=>({id:x.id,signingKey:x.signing.public,encryptionKey:x.encryption.public});
 const message=seal(a,peer(b),'demo','hello');assert.equal(open(b,peer(a),message),'hello');
 assert.throws(()=>open(c,peer(a),message));assert.throws(()=>open(b,peer(a),{...message,topic:'changed'}));assert.throws(()=>open(b,peer(a),{...message,data:'AA=='}));
});
test('directory tokens protect presence and never appear in listings',()=>{
 const r=new Registry(),a=identity();const body={id:a.id,signingKey:a.signing.public,encryptionKey:a.encryption.public};
 const [status,registration]=r.handle('POST','/register',body);assert.equal(status,201);
 const presence={id:a.id,topics:['demo'],endpoint:'http://localhost:9000'};
 assert.equal(r.handle('POST','/presence',presence,'wrong')[0],401);
 assert.equal(r.handle('POST','/presence',presence,registration.recoveryToken)[0],200);
 let entry=r.handle('GET','/topics')[1][0];assert.equal(entry.online,true);assert.equal(entry.tokenHash,undefined);assert.equal(entry.recoveryToken,undefined);
 assert.equal(r.handle('POST','/register',body)[0],409);
 r.handle('POST','/offline',{id:a.id},registration.recoveryToken);assert.equal(r.handle('GET','/topics')[1][0].online,false);
});
