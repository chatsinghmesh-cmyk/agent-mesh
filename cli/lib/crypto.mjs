import {generateKeyPairSync,createHash,diffieHellman,createPrivateKey,createPublicKey,randomBytes,createCipheriv,createDecipheriv,sign,verify} from 'node:crypto';
const pair=type=>{const k=generateKeyPairSync(type);return {private:k.privateKey.export({type:'pkcs8',format:'pem'}),public:k.publicKey.export({type:'spki',format:'pem'})};};
export function identity(){const signing=pair('ed25519'),encryption=pair('x25519');return {id:createHash('sha256').update(signing.public).digest('hex'),signing,encryption};}
const key=(priv,pub)=>createHash('sha256').update(diffieHellman({privateKey:createPrivateKey(priv),publicKey:createPublicKey(pub)})).digest();
export function seal(me,peer,topic,text){
  const nonce=randomBytes(12),c=createCipheriv('aes-256-gcm',key(me.encryption.private,peer.encryptionKey),nonce);
  const meta={from:me.id,to:peer.id,topic,id:randomBytes(16).toString('hex'),time:Date.now()};
  c.setAAD(Buffer.from(JSON.stringify(meta)));
  const envelope={...meta,nonce:nonce.toString('base64'),data:Buffer.concat([c.update(text,'utf8'),c.final()]).toString('base64'),tag:c.getAuthTag().toString('base64')};
  return {...envelope,signature:sign(null,Buffer.from(JSON.stringify(envelope)),me.signing.private).toString('base64')};
}
export function open(me,peer,message,maxAgeMs=300000){
  const {signature,...e}=message;
  if(e.from!==peer.id||e.to!==me.id||Math.abs(Date.now()-e.time)>maxAgeMs||!verify(null,Buffer.from(JSON.stringify(e)),peer.signingKey,Buffer.from(signature,'base64')))throw Error('Invalid or expired signature');
  const {from,to,topic,id,time}=e,d=createDecipheriv('aes-256-gcm',key(me.encryption.private,peer.encryptionKey),Buffer.from(e.nonce,'base64'));
  d.setAAD(Buffer.from(JSON.stringify({from,to,topic,id,time})));d.setAuthTag(Buffer.from(e.tag,'base64'));
  return Buffer.concat([d.update(Buffer.from(e.data,'base64')),d.final()]).toString('utf8');
}
