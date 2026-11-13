const api='https://api.github.com';
const login='https://github.com/login';

export function parseTeam(value){
 if(typeof value!=='string'||!/^([a-z0-9-]{1,39})\/([a-z0-9_-]{1,100})$/i.test(value))return null;
 return value.toLowerCase();
}

export async function githubVerify({storage,clientId,id,path,body,getGroup,fetcher=fetch,now=Date.now()}){
 if(!clientId)return [503,{error:'GitHub verification is awaiting app configuration'}];
 const group=getGroup(body.groupId);
 if(!group?.requests.includes(id)||!group.githubTeam||group.closed)return [409,{error:'An open join request for a GitHub-linked group is required'}];
 const key='github-device:'+id;
 const form=async(endpoint,data)=>{
  const response=await fetcher(login+endpoint,{method:'POST',headers:{accept:'application/json'},body:new URLSearchParams({client_id:clientId,...data}),redirect:'error',signal:AbortSignal.timeout(4000)});
  if(!response.ok)throw Error('GitHub authorization unavailable');
  return response.json();
 };
 if(path==='/github/start'){
  const allowed=await storage.transaction(async tx=>{
   const previous=await tx.get(key);
   if(previous?.next>now)return false;
   await tx.put(key,{next:now+5000});
   return true;
  });
  if(!allowed)return [429,{error:'Wait before restarting GitHub verification'}];
  const grant=await form('/device/code',{scope:'read:org'});
  if(!grant.device_code||!grant.user_code||!Number.isFinite(grant.expires_in))return [502,{error:'GitHub did not issue a device code'}];
  const interval=Math.max(5,Number(grant.interval)||5);
  await storage.put(key,{device:grant.device_code,groupId:group.id,team:group.githubTeam,expires:now+grant.expires_in*1000,interval,next:now+interval*1000});
  return [200,{code:grant.user_code,url:login+'/device',interval}];
 }
 if(path!=='/github/check')return [404,{error:'Unknown GitHub action'}];
 const pending=await storage.transaction(async tx=>{
  const entry=await tx.get(key);
  if(!entry?.device||entry.groupId!==group.id||entry.team!==group.githubTeam||entry.expires<=now)return null;
  if(entry.next>now)return {wait:true};
  await tx.put(key,{...entry,next:now+entry.interval*1000});
  return entry;
 });
 if(!pending)return [409,{error:'Start a new GitHub verification'}];
 if(pending.wait)return [200,{pending:true}];
 const grant=await form('/oauth/access_token',{device_code:pending.device,grant_type:'urn:ietf:params:oauth:grant-type:device_code'});
 if(grant.error==='slow_down'){
  await storage.transaction(async tx=>{
   const entry=await tx.get(key);
   if(entry?.device===pending.device){
    const interval=entry.interval+5;
    await tx.put(key,{...entry,interval,next:now+interval*1000});
   }
  });
  return [200,{pending:true}];
 }
 if(grant.error==='authorization_pending')return [200,{pending:true}];
 await storage.transaction(async tx=>{
  if((await tx.get(key))?.device===pending.device)await tx.delete(key);
 });
 if(!grant.access_token)return [409,{error:'GitHub authorization expired or was declined'}];
 const headers={authorization:'Bearer '+grant.access_token,accept:'application/vnd.github+json','user-agent':'Agent-Mesh'};
 const get=route=>fetcher(api+route,{headers,redirect:'error',signal:AbortSignal.timeout(4000)});
 const account=await get('/user');
 if(!account.ok)return [502,{error:'GitHub account lookup failed'}];
 const user=await account.json();
 if(!Number.isSafeInteger(user.id)||typeof user.login!=='string'||! /^[a-z0-9-]{1,39}$/i.test(user.login))return [502,{error:'Invalid GitHub account response'}];
 const [org,team]=pending.team.split('/');
 const membership=await get('/orgs/'+org+'/teams/'+team+'/memberships/'+user.login);
 if(!membership.ok||(await membership.json()).state!=='active')return [403,{error:'GitHub could not confirm active team membership. Check your team and organization app access.'}];
 return [200,{verified:{team:pending.team,login:user.login,accountId:user.id,checkedAt:Date.now()}}];
}
