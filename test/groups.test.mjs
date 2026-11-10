import test from 'node:test';import assert from 'node:assert/strict';import {Registry} from '../registry.mjs';import {identity} from '../crypto.mjs';import {handleGroups,groupAllows,shareGroup} from '../groups.mjs';import {validateSignal} from '../signaling.mjs';
function fixture(){const groups={},registry=new Registry(),agents=Array.from({length:4},()=>identity());for(const [i,a]of agents.entries()){const [,r]=registry.handle('POST','/register',{id:a.id,signingKey:a.signing.public,encryptionKey:a.encryption.public});a.token=r.recoveryToken;registry.handle('POST','/presence',{id:a.id,topics:['topic-'+i],endpoint:'webrtc:'+a.id},a.token);}const call=(a,path,body={})=>handleGroups(groups,registry,'/groups/'+path,{...body,id:a.id},a.token);return {groups,registry,agents,call};}
test('approval, role checks, protected owner and private roster',()=>{
 const {agents:[a,b,c],call,groups}=fixture(),[status,g]=call(a,'create',{name:'Team'});assert.equal(status,201);assert.equal(g.role,'owner');
 assert.equal(call(b,'view',{groupId:g.id})[0],403);assert.equal(call(b,'action',{groupId:g.id,action:'approve',target:c.id})[0],403);
 assert.equal(call(b,'action',{groupId:g.id,action:'request'})[0],200);assert.equal(call(b,'action',{groupId:g.id,action:'request'})[0],200);assert.equal(groups[g.id].requests.length,1);
 const listed=call(b,'list')[1][0];assert.equal(listed.requested,true);assert.equal(listed.members,undefined);assert.equal(listed.requests,undefined);
 assert.equal(call(a,'action',{groupId:g.id,action:'approve',target:b.id})[0],200);assert.equal(call(b,'view',{groupId:g.id})[1].requests,undefined);
 assert.equal(call(b,'action',{groupId:g.id,action:'rename',name:'Bad'})[0],403);
 call(a,'action',{groupId:g.id,action:'promote',target:b.id});assert.equal(call(b,'action',{groupId:g.id,action:'rename',name:'Team renamed'})[0],200);
 assert.equal(call(b,'action',{groupId:g.id,action:'remove',target:a.id})[0],403);assert.equal(call(b,'action',{groupId:g.id,action:'demote',target:a.id})[0],403);assert.equal(call(b,'action',{groupId:g.id,action:'close'})[0],403);
 call(a,'action',{groupId:g.id,action:'demote',target:b.id});assert.equal(call(b,'action',{groupId:g.id,action:'rename',name:'Bad'})[0],403);
});
test('membership and closure gate group connections without a shared public topic',()=>{
 const {agents:[a,b],call,groups,registry}=fixture(),g=call(a,'create',{name:'Team'})[1],topic='group:'+g.id;
 const signal={to:b.id,kind:'knock',session:'a'.repeat(32)};
 assert.throws(()=>validateSignal(a.id,signal,registry.records,Date.now(),groups));assert.equal(groupAllows(groups,topic,a.id,b.id),false);
 call(b,'action',{groupId:g.id,action:'request'});call(a,'action',{groupId:g.id,action:'approve',target:b.id});assert.ok(shareGroup(groups,a.id,b.id));assert.equal(validateSignal(a.id,signal,registry.records,Date.now(),groups).to,b.id);assert.ok(groupAllows(groups,topic,a.id,b.id));
 call(a,'action',{groupId:g.id,action:'remove',target:b.id});assert.equal(groupAllows(groups,topic,a.id,b.id),false);assert.equal(call(b,'view',{groupId:g.id})[0],403);assert.throws(()=>validateSignal(a.id,signal,registry.records,Date.now(),groups));
 call(b,'action',{groupId:g.id,action:'request'});call(a,'action',{groupId:g.id,action:'approve',target:b.id});call(a,'action',{groupId:g.id,action:'close'});assert.equal(groupAllows(groups,topic,a.id,b.id),false);assert.equal(call(b,'action',{groupId:g.id,action:'request'})[0],409);assert.equal(call(a,'action',{groupId:g.id,action:'rename',name:'x'})[0],409);
 call(a,'action',{groupId:g.id,action:'reopen'});assert.ok(groupAllows(groups,topic,a.id,b.id));call(b,'action',{groupId:g.id,action:'leave'});assert.equal(groupAllows(groups,topic,a.id,b.id),false);
});
test('group authentication, bounded names, reserved topics and invalid IDs',()=>{
 const {agents:[a,b],call,groups,registry}=fixture();assert.equal(handleGroups(groups,registry,'/groups/create',{id:a.id,name:'x'},b.token)[0],401);
 assert.equal(call(a,'create',{name:' '.repeat(3)})[0],400);assert.equal(call(a,'create',{name:'x'.repeat(81)})[0],400);assert.equal(call(a,'view',{groupId:'__proto__'})[0],400);
 assert.equal(registry.handle('POST','/presence',{id:a.id,topics:['group:'+'a'.repeat(32)],endpoint:'webrtc:'+a.id},a.token)[0],400);
 const g=call(a,'create',{name:'x'})[1];assert.equal(call(a,'action',{groupId:g.id,action:'leave'})[0],409);call(b,'action',{groupId:g.id,action:'request'});call(a,'action',{groupId:g.id,action:'reject',target:b.id});assert.deepEqual(groups[g.id].requests,[]);
});
test('group member and creator quotas are enforced',()=>{
 const {agents:[a,b],call,groups}=fixture(),g=call(a,'create',{name:'Full'})[1];
 for(let n=0;n<31;n++)groups[g.id].members[n.toString(16).padStart(64,'0')]='member';
 call(b,'action',{groupId:g.id,action:'request'});assert.equal(call(a,'action',{groupId:g.id,action:'approve',target:b.id})[0],429);
 for(let n=0;n<9;n++)assert.equal(call(a,'create',{name:'Group '+n})[0],201);
 assert.equal(call(a,'create',{name:'Too many'})[0],429);
});
