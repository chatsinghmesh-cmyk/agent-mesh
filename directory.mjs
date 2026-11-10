import http from 'node:http';
import {readFileSync,writeFileSync,renameSync,chmodSync} from 'node:fs';
import {Registry} from './registry.mjs';
import {WebSocketServer} from 'ws';
import {validateSignal} from './signaling.mjs';
import {handleDrops} from './drops.mjs';
import {handleGroups} from './groups.mjs';
const file=process.env.REGISTRY_FILE||'registry.json';
let records={}; try{records=JSON.parse(readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const registry=new Registry(records);
const groupFile=file+'.groups.json';let groups={};try{groups=JSON.parse(readFileSync(groupFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const dropFile=file+'.drops.json';let drops={};try{drops=JSON.parse(readFileSync(dropFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const dropStorage={get:async k=>drops[k],put:async(k,v)=>{drops[k]=v;saveDrops()},delete:async k=>{delete drops[k];saveDrops()},list:async({prefix})=>new Map(Object.entries(drops).filter(([k])=>k.startsWith(prefix)))};
function saveDrops(){writeFileSync(dropFile+'.tmp',JSON.stringify(drops),{mode:0o600});renameSync(dropFile+'.tmp',dropFile);}
let dropQueue=Promise.resolve();
const server=http.createServer(async(req,res)=>{
  try{
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16384)throw Error('Request too large');}
    const path=new URL(req.url,'http://localhost').pathname,body=raw?JSON.parse(raw):{},token=(req.headers.authorization||'').replace(/^Bearer /,'');
    let response;
    if(path.startsWith('/groups/')){if(req.method!=='POST')response=[405,{error:'POST required'}];else{const next=structuredClone(groups);response=handleGroups(next,registry,path,body,token);if(response[0]<300&&!['/groups/list','/groups/view'].includes(path)){writeFileSync(groupFile+'.tmp',JSON.stringify(next),{mode:0o600});renameSync(groupFile+'.tmp',groupFile);groups=next;}}}
    else if(path.startsWith('/drops/')){if(req.method!=='POST')response=[405,{error:'POST required'}];else{const job=dropQueue.then(()=>handleDrops(dropStorage,registry,path,body,token));dropQueue=job.catch(()=>{});response=await job;}}
    else response=registry.handle(req.method,path,body,token,new URL(req.url,'http://localhost').searchParams);
    const [status,result]=response;
    if(req.method==='POST'&&status<300){writeFileSync(file+'.tmp',JSON.stringify(records),{mode:0o600});renameSync(file+'.tmp',file);chmodSync(file,0o600);}
    res.writeHead(status,{'content-type':'application/json'}).end(JSON.stringify(result));
  }catch(e){res.writeHead(400,{'content-type':'application/json'}).end(JSON.stringify({error:e.message}));}
});
const sockets=new Map(),wss=new WebSocketServer({noServer:true,maxPayload:26000});
server.on('upgrade',(req,socket,head)=>{
  const url=new URL(req.url,'http://localhost'),id=url.searchParams.get('id');
  if(url.pathname!=='/connect'||!registry.authenticate(id,(req.headers.authorization||'').replace(/^Bearer /,''))){socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');return;}
  wss.handleUpgrade(req,socket,head,ws=>{
    sockets.get(id)?.close(4001,'Reconnected');sockets.set(id,ws);let count=0,bucket=Date.now();
    ws.on('message',raw=>{try{if(raw.toString()==='ping'){ws.send('pong');return;}if(Date.now()-bucket>60000){bucket=Date.now();count=0;}if(++count>120)throw Error('Negotiation rate limit');const message=validateSignal(id,JSON.parse(raw),records,Date.now(),groups),peer=sockets.get(message.to);if(!peer||peer.readyState!==1)throw Error('Peer signaling offline');peer.send(JSON.stringify(message));}catch(e){ws.send(JSON.stringify({error:e.message}));}});
    ws.on('error',()=>{});ws.on('close',()=>{if(sockets.get(id)===ws)sockets.delete(id);});
  });
});
server.listen(Number(process.env.PORT||8787),'127.0.0.1',()=>console.log('Local directory: http://127.0.0.1:'+(process.env.PORT||8787)));
