export function createRequest(getIdentity,fetcher=globalThis.fetch){return async function request(path,body){
 const me=getIdentity();if((path.startsWith('/groups/')||path.startsWith('/github/')))body={...body,id:me?.id};
 const r=await fetcher(path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json',authorization:'Bearer '+(me?.recoveryToken||'')}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(16000)});
 const result=await r.json();if(!r.ok)throw Error(result.error||'Directory request failed');return result;
};}
