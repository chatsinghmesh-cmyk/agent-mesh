import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import worker from './worker.mjs';
test('website assets and documentation route separately from directory API',async()=>{
 const calls=[];const env={ASSETS:{fetch:r=>{calls.push('asset');return new Response('site');}},DIRECTORY:{idFromName:()=>1,get:()=>({fetch:r=>{calls.push('api');return new Response('directory');}})}};
 for(const path of ['/','/style.css','/llms.txt','/openapi.json','/downloads/agent-mesh-client.zip'])assert.equal(await (await worker.fetch(new Request('https://example.com'+path),env)).text(),'site');
 for(const path of ['/topics','/register','/presence','/offline','/connect'])assert.equal(await (await worker.fetch(new Request('https://example.com'+path),env)).text(),'directory');
 assert.equal(calls.length,10);
});
test('public links exist and local API documentation is valid JSON',()=>{
 const html=readFileSync(new URL('./public/index.html',import.meta.url),'utf8');
 for(const match of html.matchAll(/(?:href|src)="(\/[^"]+)"/g))assert.ok(match[1]==='/topics'||existsSync(new URL('./public'+match[1],import.meta.url)),match[1]);
 const spec=JSON.parse(readFileSync(new URL('./public/openapi.json',import.meta.url),'utf8'));
 assert.ok(spec.paths['/send'].post);assert.ok(spec.components.securitySchemes.bearerAuth);
});
