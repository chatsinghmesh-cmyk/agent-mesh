import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchTopics} from '../topic-search.mjs';
import {Directory} from '../worker.mjs';
import worker from '../worker.mjs';
const now=1000000;
const peer=(id,topics,online=true)=>({id:id.repeat(64),topics,seen:online?now:0,tokenHash:'private',encryptionKey:'not needed'});
const records=[peer('a',['python-code-review','coding-help','writing']),peer('b',['python-code-review','testing']),peer('c',['python-debugging'],false),peer('d',['javascript-web'])];
const search=(q,extra={})=>searchTopics(records,new URLSearchParams({q,...extra}),now);
test('task queries rank multiword matches above generic topics; exact, related words and typos work',()=>{
 const results=search('I need someone to review Python code').results;
 assert.equal(results[0].topic,'python-code-review');assert.equal(results[0].onlineCount,2);
 assert.ok(results.findIndex(r=>r.topic==='python-code-review')<results.findIndex(r=>r.topic==='coding-help'));
 assert.equal(search('developer').results[0].topic,'coding-help');
 assert.equal(search('pythn').results[0].topic,'python-code-review');
 assert.equal(search('pyhton').results[0].topic,'python-code-review');
 assert.equal(search('python-code-review').results[0].topic,'python-code-review');
 assert.equal(search('astrophysics').total,0);assert.equal(search('please help').total,0);
});
test('online defaults, expiry, offline inclusion, bounded peer samples and limits are respected',()=>{
 assert.ok(!search('python').results.some(r=>r.topic==='python-debugging'));
 assert.ok(search('python',{online:'false'}).results.some(r=>r.topic==='python-debugging'));
 assert.equal(search('python',{limit:'1'}).results.length,1);assert.ok(search('python').total>0);
 const result=searchTopics(Array.from({length:20},(_,i)=>peer(String(i).padStart(64,'0'),['common'],i%2===0)),new URLSearchParams({online:'false'}),now).results[0];
 assert.equal(result.peerCount,20);assert.equal(result.onlineCount,10);assert.equal(result.peers.length,5);assert.ok(result.peers.every(p=>p.online));
 const expired=searchTopics([{...peer('a',['old']),seen:now-90000}],new URLSearchParams(),now);assert.equal(expired.total,0);
 assert.doesNotMatch(JSON.stringify(search('python')),/private|tokenHash|encryptionKey/);
});
test('malformed searches are rejected and unicode/empty catalogs are supported',()=>{
 for(const p of [{q:'x'.repeat(201)},{limit:'51'},{limit:'0'},{limit:'1e1'},{online:'yes'}])assert.throws(()=>searchTopics([],new URLSearchParams(p),now));
 assert.equal(searchTopics([],new URLSearchParams(),now).total,0);
 assert.equal(searchTopics([peer('a',['café-research'])],new URLSearchParams({q:'cafe'}),now).total,1);
 assert.equal(searchTopics([peer('a',['C++-coding'])],new URLSearchParams({q:'C++'}),now).total,1);
});
test('Cloudflare public search forwards query parameters and never writes directory storage',async()=>{
 let writes=0;
 const state={storage:{get:async()=>Object.fromEntries(records.map(p=>[p.id,{...p,seen:Date.now()}])),list:async()=>new Map(),put:async()=>{writes++;}},blockConcurrencyWhile:fn=>fn()};
 const directory=new Directory(state);
 const env={DIRECTORY:{idFromName:()=>1,get:()=>directory},ASSETS:{fetch:()=>{throw Error('Search incorrectly routed to static assets');}}};
 const response=await worker.fetch(new Request('https://example.com/topics/search?q=review%20python&limit=1'),env);
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.results.length,1);assert.equal(data.results[0].topic,'python-code-review');assert.equal(writes,0);
 assert.equal((await worker.fetch(new Request('https://example.com/topics/search?limit=99'),env)).status,400);
});
