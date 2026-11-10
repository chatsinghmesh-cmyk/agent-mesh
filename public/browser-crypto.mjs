const bytes=new TextEncoder(),decode=new TextDecoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const un64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const rawPem=p=>un64(p.replace(/-----[^-]+-----|\s/g,''));
const pem=(kind,b)=>`-----BEGIN ${kind} KEY-----\n${b64(b).match(/.{1,64}/g).join('\n')}\n-----END ${kind} KEY-----\n`;
const load=(type,p,algorithm,usages)=>crypto.subtle.importKey(type,rawPem(p),algorithm,false,usages);
export async function identity(){
 const result={};
 for(const [name,algorithm] of [['signing','Ed25519'],['encryption','X25519']]){
  const k=await crypto.subtle.generateKey(algorithm,true,algorithm==='Ed25519'?['sign','verify']:['deriveBits']);
  result[name]={public:pem('PUBLIC',await crypto.subtle.exportKey('spki',k.publicKey)),private:pem('PRIVATE',await crypto.subtle.exportKey('pkcs8',k.privateKey))};
 }
 result.id=hex(await crypto.subtle.digest('SHA-256',bytes.encode(result.signing.public)));return result;
}
async function key(me,peer){
 const priv=await load('pkcs8',me.encryption.private,'X25519',['deriveBits']),pub=await load('spki',peer.encryptionKey,'X25519',[]);
 const shared=await crypto.subtle.deriveBits({name:'X25519',public:pub},priv,256);
 return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',shared),'AES-GCM',false,['encrypt','decrypt']);
}
export async function seal(me,peer,topic,text){
 const nonce=crypto.getRandomValues(new Uint8Array(12));
 const meta={from:me.id,to:peer.id,topic,id:hex(crypto.getRandomValues(new Uint8Array(16))),time:Date.now()};
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:bytes.encode(JSON.stringify(meta))},await key(me,peer),bytes.encode(text)));
 const e={...meta,nonce:b64(nonce),data:b64(encrypted.slice(0,-16)),tag:b64(encrypted.slice(-16))};
 return {...e,signature:b64(await crypto.subtle.sign('Ed25519',await load('pkcs8',me.signing.private,'Ed25519',['sign']),bytes.encode(JSON.stringify(e))))};
}
export async function open(me,peer,message,maxAgeMs=300000){
 const {signature,...e}=message;
 if(e.from!==peer.id||e.to!==me.id||Math.abs(Date.now()-e.time)>maxAgeMs||!await crypto.subtle.verify('Ed25519',await load('spki',peer.signingKey,'Ed25519',['verify']),un64(signature),bytes.encode(JSON.stringify(e))))throw Error('Invalid or expired signature');
 const {from,to,topic,id,time}=e,data=un64(e.data),tag=un64(e.tag),combined=new Uint8Array(data.length+tag.length);combined.set(data);combined.set(tag,data.length);
 return decode.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(e.nonce),additionalData:bytes.encode(JSON.stringify({from,to,topic,id,time}))},await key(me,peer),combined));
}
export async function validateIdentity(me){
 if(!me?.signing?.private||!me?.encryption?.private||!/^[\w-]{43}$/.test(me.recoveryToken||''))throw Error('Invalid identity backup');
 if(hex(await crypto.subtle.digest('SHA-256',bytes.encode(me.signing.public)))!==me.id)throw Error('Identity ID does not match signing key');
 const proof=bytes.encode('agent-mesh-backup-check'),sig=await crypto.subtle.sign('Ed25519',await load('pkcs8',me.signing.private,'Ed25519',['sign']),proof);
 if(!await crypto.subtle.verify('Ed25519',await load('spki',me.signing.public,'Ed25519',['verify']),sig,proof))throw Error('Signing keys do not match');
 const peer={encryptionKey:me.encryption.public};await open(me,{id:me.id,signingKey:me.signing.public,...peer},await seal(me,{id:me.id,...peer},'backup-check','check'));
}
