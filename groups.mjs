import {catalog} from './public/group-extension-catalog.mjs';
import {randomBytes} from 'node:crypto';
import {parseTeam} from './github-verify.mjs';
export const GROUP_PREFIX='group:';
export function groupForTopic(groups,topic){return typeof topic==='string'&&topic.startsWith(GROUP_PREFIX)?groups[topic.slice(GROUP_PREFIX.length)]:undefined;}
export function groupAllows(groups,topic,a,b){const g=groupForTopic(groups,topic);return !!g&&!g.closed&&!!g.members[a]&&!!g.members[b];}
export function shareGroup(groups,a,b){return Object.values(groups).some(g=>!g.closed&&g.members[a]&&g.members[b]);}
export function handleGroups(groups,registry,path,body,token,now=Date.now()){
 if(!registry.authenticate(body.id,token))return [401,{error:'Invalid recovery token'}];
 const id=body.id,summary=g=>({id:g.id,name:g.name,owner:g.owner,closed:g.closed,memberCount:Object.keys(g.members).length,role:g.members[id]||null,requested:g.requests.includes(id),created:g.created});
 if(path==='/groups/list')return [200,Object.values(groups).map(summary)];
 if(path==='/groups/create'){
  const name=typeof body.name==='string'?body.name.trim():'';
  if(!name||name.length>80)return [400,{error:'Use a group name of 1–80 characters'}];
  if(Object.keys(groups).length>=1000||Object.values(groups).filter(g=>g.owner===id&&!g.closed).length>=10)return [429,{error:'Group creation limit reached'}];
  const key=randomBytes(16).toString('hex'),g={id:key,name,owner:id,members:{[id]:'owner'},requests:[],closed:false,created:now};groups[key]=g;return [201,summary(g)];
 }
 if(typeof body.groupId!=='string'||!/^[a-f0-9]{32}$/.test(body.groupId))return [400,{error:'Use a valid group ID'}];
 const g=groups[body.groupId];if(!g)return [404,{error:'Group not found'}];
 const role=g.members[id],admin=['owner','admin'].includes(role);
 if(path==='/groups/view'){
  if(!role)return [403,{error:'Group membership required'}];
  return [200,{...summary(g),integrations:g.integrations||[],members:Object.entries(g.members).map(([id,role])=>({id,role})),...(admin?{requests:[...g.requests],githubTeam:g.githubTeam||null,githubChecks:g.githubChecks||{}}:{})}];
 }
 if(path==='/groups/verification')return [200,{team:g.githubTeam||null,requested:g.requests.includes(id)}];
 if(path!=='/groups/action')return [404,{error:'Not found'}];
 const {action,target}=body;
 if(action==='request'){
  if(g.closed)return [409,{error:'Group is closed'}];if(role)return [200,{ok:true,member:true}];
  if(g.requests.length>=100&&!g.requests.includes(id))return [429,{error:'Join request limit reached'}];
  if(!g.requests.includes(id))g.requests.push(id);return [200,{ok:true,requested:true}];
 }
 if(action==='cancel-request'){g.requests=g.requests.filter(x=>x!==id);if(g.githubChecks)delete g.githubChecks[id];return [200,{ok:true}];}
 if(action==='leave'){
  if(!role)return [403,{error:'Group membership required'}];if(role==='owner')return [409,{error:'The owner must close the group rather than leave it'}];
  delete g.members[id];return [200,{ok:true}];
 }
 if(!admin)return [403,{error:'Group admin permission required'}];
 if(action==='close'||action==='reopen'){
  if(role!=='owner')return [403,{error:'Only the group owner can close or reopen it'}];
  g.closed=action==='close';if(g.closed){g.requests=[];g.githubChecks={};}return [200,summary(g)];
 }
 if(g.closed)return [409,{error:'Group is closed'}];
 if(action==='integrations'){
  if(!Array.isArray(body.integrations)||body.integrations.length>catalog.length||body.integrations.some(id=>!catalog.some(entry=>entry.id===id)))return [400,{error:'Choose extensions from the group store'}];
  g.integrations=[...new Set(body.integrations)];
  return [200,{integrations:g.integrations}];
 }
 if(action==='github-team'){
  const team=body.team===''?'':parseTeam(body.team);
  if(team===null)return [400,{error:'Use a GitHub organization/team slug'}];
  if(g.githubTeam!==team){g.githubTeam=team;g.githubChecks={};}
  return [200,{ok:true,team}];
 }
 if(action==='rename'){const name=typeof body.name==='string'?body.name.trim():'';if(!name||name.length>80)return [400,{error:'Use a group name of 1–80 characters'}];g.name=name;return [200,summary(g)];}
 if(typeof target!=='string'||!/^[a-f0-9]{64}$/.test(target))return [400,{error:'Choose a valid agent ID'}];
 if(action==='approve'){
  if(!g.requests.includes(target))return [409,{error:'No pending request from this agent'}];if(Object.keys(g.members).length>=32)return [429,{error:'Groups support up to 32 members'}];
  const check=g.githubChecks?.[target];
  if(g.githubTeam&&(check?.team!==g.githubTeam||now-check.checkedAt>=15*60*1000))return [409,{error:'A fresh GitHub team verification is required before approval'}];
  if(g.githubChecks)delete g.githubChecks[target];
  g.members[target]='member';g.requests=g.requests.filter(x=>x!==target);return [200,{ok:true}];
 }
 if(action==='reject'){g.requests=g.requests.filter(x=>x!==target);if(g.githubChecks)delete g.githubChecks[target];return [200,{ok:true}];}
 if(!g.members[target])return [404,{error:'Member not found'}];if(target===g.owner)return [403,{error:'The owner cannot be removed or demoted'}];
 if(action==='remove'){delete g.members[target];return [200,{ok:true}];}
 if(action==='promote'){g.members[target]='admin';return [200,{ok:true}];}
 if(action==='demote'){g.members[target]='member';return [200,{ok:true}];}
 return [400,{error:'Unknown group action'}];
}
