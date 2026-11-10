'use strict';
class MeshError extends Error {
  constructor(message, {status=0,code='API_ERROR'}={}) { super(message);this.name='MeshError';this.status=status;this.code=code; }
}
class AgentMeshClient {
  #token; #fetch; #base; #timeout;
  constructor({baseUrl='http://127.0.0.1:9001',token,timeoutMs=10000,fetch:fetcher=globalThis.fetch}={}) {
    const url=new URL(baseUrl);
    if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new MeshError('The local API URL must be a loopback HTTP origin.',{code:'INVALID_CONFIG'});
    if(typeof token!=='string'||!token.trim())throw new MeshError('A local API token is required.',{code:'INVALID_CONFIG'});
    if(!Number.isInteger(timeoutMs)||timeoutMs<1||typeof fetcher!=='function')throw new MeshError('Invalid timeout or fetch implementation.',{code:'INVALID_CONFIG'});
    this.#base=url.origin;this.#token=token;this.#fetch=fetcher;this.#timeout=timeoutMs;
  }
  async #request(path,body,timeoutMs=this.#timeout){
    let response;
    try { response=await this.#fetch(this.#base+path,{method:body===undefined?'GET':'POST',redirect:'error',headers:{authorization:'Bearer '+this.#token,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)}); }
    catch(e){throw new MeshError('Cannot reach the local agent API. Start the agent and check its API port.',{code:['TimeoutError','AbortError'].includes(e.name)?'TIMEOUT':'CONNECTION_FAILED'});}
    let data;try{data=await response.json();}catch{throw new MeshError('Agent API returned invalid JSON.',{status:response.status,code:'INVALID_RESPONSE'});}
    if(!response.ok)throw new MeshError(response.status===401?'API token rejected. Configure the local apiToken, not the recovery token.':typeof data.error==='string'?data.error:'Agent API request failed.',{status:response.status,code:response.status===401?'UNAUTHORIZED':'API_ERROR'});
    return data;
  }
  async peers({onlineOnly=false,query=''}={}){
    const data=await this.#request('/topics');
    if(!Array.isArray(data)||data.some(p=>!p||typeof p.id!=='string'||!Array.isArray(p.topics)||p.topics.some(t=>typeof t!=='string')||typeof p.online!=='boolean'))throw new MeshError('Unexpected directory response.',{code:'INVALID_RESPONSE'});
    const q=String(query).trim().toLowerCase();
    return data.filter(p=>(!onlineOnly||p.online)&&(!q||p.topics.some(t=>t.toLowerCase().includes(q))));
  }
  async topics(options={}){
    const peers=await this.peers(options),topics=new Map();
    for(const peer of peers)for(const topic of new Set(peer.topics)){if(options.query&&!topic.toLowerCase().includes(String(options.query).trim().toLowerCase()))continue;const item=topics.get(topic)||{topic,peers:[],onlineCount:0};item.peers.push(peer);if(peer.online)item.onlineCount++;topics.set(topic,item);}
    return [...topics.values()].sort((a,b)=>a.topic.localeCompare(b.topic));
  }
  async send({to,topic,text}={}){
    if(typeof to!=='string'||!to||typeof topic!=='string'||!topic||typeof text!=='string'||!text||Buffer.byteLength(text,'utf8')>16000)throw new MeshError('Send requires to, topic and 1–16000 UTF-8 bytes of text.',{code:'INVALID_MESSAGE'});
    const data=await this.#request('/send',{to,topic,text},Math.max(this.#timeout,65000));
    if(data.delivered!==true||typeof data.id!=='string')throw new MeshError('Unexpected delivery response.',{code:'INVALID_RESPONSE'});
    return data;
  }
  async history(){const data=await this.#request('/history');if(!Array.isArray(data))throw new MeshError('Unexpected history response.',{code:'INVALID_RESPONSE'});return data;}
}
module.exports={AgentMeshClient,MeshError};
