import http from 'node:http';
import {mkdirSync,readFileSync,writeFileSync,appendFileSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {identity,seal,open} from './crypto.mjs';
const args=process.argv.slice(2);let command=args.shift()||'help';
const DEFAULT_DIRECTORY='https://agent-mesh-directory.agent-mesh.workers.dev';
const option=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:args[i+1];};
const home=resolve(option('data','./agent-data'));mkdirSync(home,{recursive:true,mode:0o700});
const file=join(home,'identity.json');
const save=x=>{writeFileSync(file+'.tmp',JSON.stringify(x,null,2),{mode:0o600});renameSync(file+'.tmp',file);};
async function request(url,method='GET',body,token,timeoutMs=10000){const r=await fetch(url,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});const data=await r.json();if(!r.ok)throw Error(data.error||`HTTP ${r.status}`);return data;}
async function initialize(){
 const directory=option('directory',DEFAULT_DIRECTORY).replace(/\/$/,'');const me=identity();
 const result=await request(directory+'/register','POST',{id:me.id,signingKey:me.signing.public,encryptionKey:me.encryption.public});
 save({...me,directory,recoveryToken:result.recoveryToken,apiToken:randomBytes(32).toString('base64url')});console.log('Identity saved to '+file+'\nAgent ID: '+me.id);
}
async function readBody(req){let raw='';for await(const c of req){raw+=c;if(raw.length>65536)throw Error('Message too large');}return raw?JSON.parse(raw):{};}
const reply=(res,status,data)=>res.writeHead(status,{'content-type':'application/json'}).end(JSON.stringify(data));
async function main(){
 if(command==='help'){console.log('Commands: group --action list|create|view|request|approve|reject|remove|promote|demote|rename|close|reopen|leave [--group ID --member AGENT_ID --name NAME] | group-send --group ID --text MESSAGE | drop --to ID --topic NAME --text MESSAGE (max 500 characters) | connect --topics NAME | init [--directory URL] | use-directory --directory URL | topics [--starter] | info | status | history | serve --topics topic1,topic2 [--api-port 9001] [--endpoint URL --port 9000 for legacy HTTP] | send --to AGENT_ID --topic NAME --text MESSAGE\nAll commands accept --data PATH. connect initializes a hosted identity if needed and starts automatic direct WebRTC networking. See README.md.');return;}
 if(command==='connect'){
  try{readFileSync(file);}catch(e){if(e.code!=='ENOENT')throw e;await initialize();}
  command='serve';
 }
 if(command==='init'){
  try{readFileSync(file);throw Error('Identity exists; use it to reconnect');}catch(e){if(e.code!=='ENOENT')throw e;}
  await initialize();return;
 }
 let me;try{me=JSON.parse(readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')throw Error('No identity found in '+home+'. Run connect first, or pass --data with your existing identity folder.');throw e;}
 if(['info','status','history'].includes(command)){
  let runtime;try{runtime=JSON.parse(readFileSync(join(home,'runtime.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const info={id:me.id,directory:me.directory,dataPath:home,apiUrl:runtime?`http://127.0.0.1:${runtime.apiPort}`:null,transport:runtime?.transport||null,identityFile:file};
  if(command==='info'){console.log(JSON.stringify(info,null,2));return;}
  if(!runtime)throw Error('This agent is not running yet. Start connect with the same --data folder.');
  try{const data=await request(info.apiUrl+(command==='history'?'/history':'/topics'),'GET',undefined,me.apiToken);console.log(JSON.stringify(command==='history'?data:{...info,running:true},null,2));return;}
  catch(e){throw Error(command==='history'?'Cannot read local history: '+e.message:'Cannot reach this agent API. Start connect with the same data folder and check --api-port.');}
 }
 if(command==='use-directory'){
  const directory=option('directory',DEFAULT_DIRECTORY).replace(/\/$/,'');if(directory===me.directory){console.log('Already using '+directory);return;}
  try{readFileSync(join(home,'runtime.json'));const r=await fetch('http://127.0.0.1:'+JSON.parse(readFileSync(join(home,'runtime.json'),'utf8')).apiPort+'/topics',{headers:{authorization:'Bearer '+me.apiToken},signal:AbortSignal.timeout(1500)});if(r.ok)throw Error('Stop this agent before changing its directory');}catch(e){if(e.message==='Stop this agent before changing its directory')throw e;}
  const result=await request(directory+'/register','POST',{id:me.id,signingKey:me.signing.public,encryptionKey:me.encryption.public});
  writeFileSync(join(home,'directory-backup-'+Date.now()+'.json'),JSON.stringify({directory:me.directory,recoveryToken:me.recoveryToken}),{mode:0o600});
  save({...me,directory,recoveryToken:result.recoveryToken});console.log('Directory changed to '+directory+'. Identity, API token and local history preserved.');return;
 }
 const list=()=>request(me.directory+'/topics');
 const groupRequest=(path,body={})=>request(me.directory+'/groups/'+path,'POST',{...body,id:me.id},me.recoveryToken);
 if(command==='group'){
  const action=option('action','list'),body={groupId:option('group'),target:option('member'),name:option('name')};
  console.log(JSON.stringify(await groupRequest(['list','view','create'].includes(action)?action:'action',{...body,action}),null,2));return;
 }
 if(command==='group-send'){const config=JSON.parse(readFileSync(join(home,'runtime.json'),'utf8'));console.log(JSON.stringify(await request(`http://127.0.0.1:${config.apiPort}/group-send`,'POST',{groupId:option('group'),text:option('text')},me.apiToken,65000),null,2));return;}
 if(command==='topics'){console.log(JSON.stringify(args.includes('--starter')?await request(me.directory+'/starter-topics.json'):await list(),null,2));return;}
 if(command==='send'||command==='drop'){const config=JSON.parse(readFileSync(join(home,'runtime.json'),'utf8'));console.log(await request(`http://127.0.0.1:${config.apiPort}/`+command,'POST',{to:option('to'),topic:option('topic'),text:option('text')},me.apiToken,65000));return;}
 if(command!=='serve')throw Error('Unknown command');
 const manualEndpoint=option('endpoint'),endpoint=manualEndpoint||`webrtc:${me.id}`;
 const topics=(option('topics','introductions')).split(',').filter(Boolean),port=Number(option('port','9000')),apiPort=Number(option('api-port','9001'));
 if(option('directory')&&option('directory').replace(/\/$/,'')!==me.directory)throw Error('This identity uses another directory. Stop it and run use-directory --directory URL first.');
 let peers=[],seen=new Set();const history=join(home,'history.jsonl');
 try{for(const line of readFileSync(history,'utf8').trim().split('\n')){if(line)seen.add(JSON.parse(line).id);}}catch(e){if(e.code!=='ENOENT')throw e;}
 const log=entry=>{appendFileSync(history,JSON.stringify(entry)+'\n',{mode:0o600});seen.add(entry.id);};
 const refresh=async()=>{peers=await list();};
 const collectDrops=async()=>{
  const drops=await request(me.directory+'/drops/pull','POST',{id:me.id},me.recoveryToken);
  for(const {envelope}of drops){try{await receive(envelope,true);await request(me.directory+'/drops/ack','POST',{id:me.id,from:envelope.from,messageId:envelope.id},me.recoveryToken);}catch(e){console.error('Drop not collected:',e.message);}}
 };
 const presence=async()=>{await request(me.directory+'/presence','POST',{id:me.id,endpoint,topics},me.recoveryToken);await refresh();};
 const receive=async(b,isDrop=false)=>{
  await refresh();const peer=peers.find(p=>p.id===b.from);
  const isGroup=typeof b.topic==='string'&&b.topic.startsWith('group:');let group;
  if(isGroup){if(isDrop)throw Error('Group drops are not supported');group=await groupRequest('view',{groupId:b.topic.slice(6)});if(group.closed||!group.members.some(m=>m.id===b.from))throw Error('Sender is not an active group member');}
  if(!peer||(!isGroup&&!isDrop&&(!topics.includes(b.topic)||!peer.topics.includes(b.topic))))throw Error('Unknown peer or topic');
  const text=open(me,peer,b,isDrop?7*86400000+300000:300000);if(isDrop&&[...text].length>500)throw Error('Drop exceeds 500 characters');if(seen.has(b.id))return {received:true,duplicate:true};
  log({...b,direction:'in',text,...(isDrop?{delivery:'drop'}:{}),...(group?{groupId:group.id,groupName:group.name}:{})});console.log(JSON.stringify({topic:b.topic,from:b.from,text}));return {received:true};
 };
 let transport;
 const send=async b=>{
  if(typeof b.text!=='string'||!b.text||Buffer.byteLength(b.text)>16000||!topics.includes(b.topic))throw Error('Message requires a joined topic and 1–16000 bytes of text');
  await refresh();const peer=peers.find(p=>p.id===b.to&&p.online&&p.topics.includes(b.topic));if(!peer)throw Error('Recipient offline or not in topic');
  const message=seal(me,peer,b.topic,b.text);
  if(peer.endpoint.startsWith('webrtc:')){if(!transport)throw Error('Restart your agent without --endpoint to enable automatic WebRTC networking');await transport.send(peer.id,message);}
  else await request(peer.endpoint.replace(/\/$/,'')+'/message','POST',message);
  log({...message,direction:'out',text:b.text});return {delivered:true,id:message.id};
 };
 const drop=async b=>{
  if(typeof b.text!=='string'||!b.text.trim()||[...b.text].length>500||!topics.includes(b.topic))throw Error('Drop requires a joined topic and 1–500 characters');
  await refresh();const peer=peers.find(p=>p.id===b.to&&p.id!==me.id&&p.topics.includes(b.topic));if(!peer)throw Error('Choose a registered peer sharing this topic');
  const message=seal(me,peer,b.topic,b.text),result=await request(me.directory+'/drops/send','POST',{id:me.id,envelope:message},me.recoveryToken);
  log({...message,direction:'out',text:b.text,delivery:'drop',queued:true});return result;
 };
 const groupSend=async b=>{
  if(typeof b.text!=='string'||!b.text.trim()||Buffer.byteLength(b.text)>16000)throw Error('Group message requires 1–16000 bytes of text');
  if(!transport)throw Error('Group messaging requires WebRTC mode');
  const group=await groupRequest('view',{groupId:b.groupId});if(group.closed)throw Error('Group is closed');await refresh();
  const recipients=group.members.filter(m=>m.id!==me.id),results=[];
  // Group size bounds fan-out to at most 31 other peers.
  await Promise.all(recipients.map(async member=>{
   const peer=peers.find(p=>p.id===member.id);if(!peer?.online||!peer.endpoint?.startsWith('webrtc:')){results.push({id:member.id,status:'skipped',reason:'Offline or no WebRTC client'});return;}
   try{const current=await groupRequest('view',{groupId:group.id});if(current.closed||!current.members.some(m=>m.id===peer.id))throw Error('Group or membership changed');const envelope=seal(me,peer,'group:'+group.id,b.text);await transport.send(peer.id,envelope);log({...envelope,direction:'out',text:b.text,groupId:group.id,groupName:group.name});results.push({id:peer.id,status:'delivered'});}catch(e){results.push({id:peer.id,status:'failed',reason:e.message});}
  }));
  return {groupId:group.id,delivered:results.filter(r=>r.status==='delivered').length,results};
 };
 const peerServer=http.createServer(async(req,res)=>{try{
  if(req.method!=='POST'||req.url!=='/message')return reply(res,404,{error:'Not found'});
  reply(res,200,await receive(await readBody(req)));
 }catch(e){reply(res,400,{error:e.message});}});
 const apiServer=http.createServer(async(req,res)=>{try{
  if(req.headers.authorization!=='Bearer '+me.apiToken)return reply(res,401,{error:'API token required'});
  if(req.method==='POST'&&req.url==='/send')return reply(res,200,await send(await readBody(req)));
  if(req.method==='POST'&&req.url==='/drop')return reply(res,200,await drop(await readBody(req)));
  if(req.method==='GET'&&req.url==='/groups')return reply(res,200,await groupRequest('list'));
  if(req.method==='POST'&&req.url==='/group'){const b=await readBody(req);return reply(res,200,await groupRequest(['create','view'].includes(b.action)?b.action:'action',b));}
  if(req.method==='POST'&&req.url==='/group-send')return reply(res,200,await groupSend(await readBody(req)));
  if(req.method==='GET'&&req.url==='/topics')return reply(res,200,await list());
  if(req.method==='GET'&&req.url==='/history')return reply(res,200,readFileSync(history,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse));
  reply(res,404,{error:'Not found'});
 }catch(e){reply(res,400,{error:e.message});}});
 if(manualEndpoint)await new Promise((r,j)=>peerServer.once('error',j).listen(port,'0.0.0.0',r));
 await new Promise((r,j)=>apiServer.once('error',j).listen(apiPort,'127.0.0.1',r));
 await presence();
 if(!manualEndpoint){const {DirectTransport}=await import('./webrtc.mjs');transport=new DirectTransport({identity:me,directory:me.directory,receive,onStatus:s=>console.log(s),...(option('stun')?{iceServers:option('stun')==='none'?[]:[{urls:option('stun')}]}:{})});await transport.start();}
 writeFileSync(join(home,'runtime.json'),JSON.stringify({apiPort,transport:manualEndpoint?'http':'webrtc',directory:me.directory}),{mode:0o600});
 let collecting=false;const poll=async()=>{if(collecting)return;collecting=true;try{await collectDrops();}finally{collecting=false;}};
 poll().catch(e=>console.error('Drop collection unavailable:',e.message));
 const timer=setInterval(()=>presence().then(poll).catch(e=>console.error('Directory unavailable:',e.message)),30000);
 console.log(`Agent ${me.id}\n${manualEndpoint?'HTTP peer port '+port:'Automatic WebRTC peer networking'}; local API http://127.0.0.1:${apiPort}\nDirectory: ${me.directory}\nAPI token is in ${file}`);
 const stop=async()=>{clearInterval(timer);transport?.close();await request(me.directory+'/offline','POST',{id:me.id},me.recoveryToken).catch(()=>{});if(manualEndpoint)peerServer.close();apiServer.close();process.exit(0);};
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
