import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
export const hash = s => createHash('sha256').update(s).digest('hex');
export class Registry {
  constructor(records = {}) { this.records = records; }
  authenticate(id,token='') { const a=this.records[id];return !!a&&timingSafeEqual(Buffer.from(a.tokenHash),Buffer.from(hash(token))); }
  handle(method, path, body = {}, token = '') {
    const now = Date.now();
    if (method === 'GET' && path === '/topics') return [200, Object.values(this.records).map(({tokenHash,...a}) => ({...a, online: now-a.seen < 90000}))];
    if (method === 'POST' && path === '/register') {
      const {id, signingKey, encryptionKey} = body;
      if (!/^[a-f0-9]{64}$/.test(id || '') || hash(signingKey || '') !== id || typeof encryptionKey !== 'string' || encryptionKey.length > 2000) return [400,{error:'Invalid identity'}];
      if (this.records[id]) return [409,{error:'Identity already registered; use its recovery token'}];
      const recoveryToken = randomBytes(32).toString('base64url');
      this.records[id] = {id, signingKey, encryptionKey, tokenHash:hash(recoveryToken), topics:[], endpoint:'', seen:0};
      return [201,{id,recoveryToken}];
    }
    const a = this.records[body.id];
    if (!this.authenticate(body.id,token)) return [401,{error:'Invalid recovery token'}];
    if (method === 'POST' && path === '/presence') {
      if (!Array.isArray(body.topics) || body.topics.length>10 || body.topics.some(t=>typeof t!=='string'||!t.trim()||t.length>120||t.startsWith('group:'))) return [400,{error:'Use 0–10 topic names, maximum 120 characters each; group: is reserved'}];
      try { const u=new URL(body.endpoint); if(body.endpoint!==`webrtc:${a.id}`&&(!['http:','https:'].includes(u.protocol)||u.username||u.password)) throw Error(); } catch {return [400,{error:'Invalid peer endpoint'}];}
      a.topics=[...new Set(body.topics)]; a.endpoint=body.endpoint; a.seen=now;
      return [200,{ok:true}];
    }
    if(method==='POST' && path==='/offline'){a.seen=0;return [200,{ok:true}];}
    return [404,{error:'Not found'}];
  }
}
