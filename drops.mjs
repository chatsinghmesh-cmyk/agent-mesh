import {verify} from 'node:crypto';
export const DROP_TTL=7*24*60*60*1000;
// Storage is separate from public directory records. No plaintext enters this API.
export async function handleDrops(storage,registry,path,body,token,now=Date.now()){
 if(!registry.authenticate(body.id,token))return [401,{error:'Invalid recovery token'}];
 const records=registry.records;
 if(path==='/drops/send'){
  const e=body.envelope,{signature,...signed}=e||{},sender=records[body.id],recipient=records[e?.to];
  if(!e||typeof e.topic!=='string'||e.topic.startsWith('group:')||Object.keys(e).some(k=>!['from','to','topic','id','time','nonce','data','tag','signature'].includes(k))||e.from!==body.id||!recipient||e.to===body.id||!sender.topics.includes(e.topic)||!recipient.topics.includes(e.topic))return [400,{error:'Choose a registered peer with a shared topic; group drops are not supported'}];
  const valid64=(value,bytes)=>typeof value==='string'&&Buffer.from(value,'base64').toString('base64')===value&&Buffer.from(value,'base64').length===bytes;
  if(!/^[a-f0-9]{32}$/.test(e.id||'')||!Number.isSafeInteger(e.time)||Math.abs(now-e.time)>300000||typeof e.data!=='string'||e.data.length>2668||!valid64(e.data,Buffer.from(e.data,'base64').length)||!Buffer.from(e.data,'base64').length||Buffer.from(e.data,'base64').length>2000||!valid64(e.nonce,12)||!valid64(e.tag,16)||!valid64(signature,64))return [400,{error:'Invalid or oversized encrypted drop'}];
  try{if(!verify(null,Buffer.from(JSON.stringify(signed)),sender.signingKey,Buffer.from(signature,'base64')))throw Error();}catch{return [400,{error:'Invalid drop signature'}]}
  const key=`drop:${e.to}:${e.from}`,current=await storage.get(key);
  if(current&&current.expires>now)return current.envelope.id===e.id?[200,{queued:true,id:e.id,expires:current.expires}]:[409,{error:'One message is already pending for this peer'}];
  const all=await storage.list({prefix:'drop:'});let total=0,toCount=0;
  for(const [k,v]of all){if(v.expires<=now){await storage.delete(k);continue}total++;if(k.startsWith(`drop:${e.to}:`))toCount++;}
  if(total>=10000||toCount>=100)return [429,{error:'Drop inbox capacity reached; try again later'}];
  const expires=now+DROP_TTL;await storage.put(key,{envelope:e,expires});return [201,{queued:true,id:e.id,expires}];
 }
 if(path==='/drops/pull'){
  const entries=await storage.list({prefix:`drop:${body.id}:`}),messages=[];
  for(const [k,v]of entries){if(v.expires<=now)await storage.delete(k);else messages.push(v);}
  return [200,messages.slice(0,50)];
 }
 if(path==='/drops/ack'){
  if(!/^[a-f0-9]{64}$/.test(body.from||'')||!/^[a-f0-9]{32}$/.test(body.messageId||''))return [400,{error:'Invalid acknowledgement'}];
  const key=`drop:${body.id}:${body.from}`,current=await storage.get(key);
  if(current?.envelope.id===body.messageId)await storage.delete(key);
  return [200,{ok:true}];
 }
 return [404,{error:'Not found'}];
}
