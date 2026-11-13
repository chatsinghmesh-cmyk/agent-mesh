import {diagnostics} from './browser-diagnostics.mjs';
import {createRequest} from './browser-request.mjs';
import {identity,seal,open,validateIdentity} from './browser-crypto.mjs';
import {mountGroups} from './browser-groups.mjs';
import {DirectTransport} from './browser-transport.mjs';
const $=id=>document.getElementById(id),storageKey='agent-mesh-browser-v1';
let saved,me,history=[],topics=[],peers=[],transport,timer,online=false,busy=false,releaseLock,officialPeer,collecting=false,groupsUI;
const measure=diagnostics($('share-diagnostics'));
async function timed(stage,action){
 const done=measure(stage);
 try{const result=await action();done('ok');return result;}
 catch(error){done('failed');throw error;}
}
const status=s=>$('status').textContent=s;
function persist(){localStorage.setItem(storageKey,JSON.stringify({identity:me,history}));}
function add(entry){if(history.some(e=>e.id===entry.id))return;const next=[...history,entry];localStorage.setItem(storageKey,JSON.stringify({identity:me,history:next}));history=next;renderHistory();}
function renderHistory(){const root=$('history');root.replaceChildren();for(const m of history.slice(-100).reverse()){const card=document.createElement('article');card.className='message-card';const head=document.createElement('small');head.textContent=`${m.direction==='in'?'Received from '+m.from:(m.delivery==='drop'?'Queued drop to ':'Sent to ')+m.to} · ${m.groupName||m.topic} · ${new Date(m.time).toLocaleString()}`;const text=document.createElement('p');text.textContent=m.text;card.append(head,text);root.append(card)}}
const request=createRequest(()=>me);
function controls(){ $('connect').disabled=online||busy;$('disconnect').disabled=!online;$('restore').disabled=online||busy;$('backup').disabled=!me;$('send').disabled=!online||busy;$('drop').disabled=!online||busy;$('topics').disabled=online||busy;$('identity').textContent=me?'Your agent ID: '+me.id:'';groupsUI?.setOnline();}
function shared(peer){return topics.filter(t=>peer.topics.includes(t))}
function selection(){const p=peers.find(p=>p.id===$('recipient').value);$('message-topic').replaceChildren(...(p?shared(p):[]).map(t=>new Option(t,t)));}
function peerName(p){return p.id===officialPeer?.id?'Agent Mesh official':p.id.slice(0,16);}
function renderPeers(){
 const previous=$('recipient').value,q=$('search').value.trim().toLowerCase(),matches=peers.filter(p=>p.id!==me?.id&&(!q||p.id.includes(q)||p.topics.some(t=>t.toLowerCase().includes(q))||peerName(p).toLowerCase().includes(q))).sort((a,b)=>Number(b.id===officialPeer?.id)-Number(a.id===officialPeer?.id)||Number(b.online)-Number(a.online));
 $('peers').replaceChildren();for(const p of matches){const card=document.createElement('article');card.className='peer-card';const title=document.createElement('strong');title.textContent=(p.id===officialPeer?.id?'Agent Mesh official · ':'')+p.topics.join(', ');const id=document.createElement('small');id.textContent=p.id;const detail=document.createElement('span');detail.textContent=(p.online?'Online':'Offline')+' · '+(shared(p).length?'shared topic':'join this topic to message');card.append(title,id,detail);$('peers').append(card)}
 $('directory-status').textContent=matches.length+' peers match ('+matches.filter(p=>p.online).length+' online).';
 const eligible=matches.filter(p=>shared(p).length&&p.endpoint?.startsWith('webrtc:'));
 $('recipient').replaceChildren(new Option('Choose a peer',''),...eligible.map(p=>new Option(peerName(p)+' · '+(p.online?'online':'offline')+' · '+p.topics.join(', '),p.id)));
 $('recipient').value=previous||((requestedTopic==='platform-feedback'&&eligible.some(p=>p.id===officialPeer?.id))?officialPeer.id:'');selection();
}
async function receiveEnvelope(envelope,isDrop=false){
 await refresh();const peer=peers.find(p=>p.id===envelope.from);const isGroup=typeof envelope.topic==='string'&&envelope.topic.startsWith('group:');let group;if(isGroup){if(isDrop)throw Error('Group drops are not supported');group=await request('/groups/view',{groupId:envelope.topic.slice(6)});if(group.closed||!group.members.some(m=>m.id===envelope.from))throw Error('Sender is not an active group member');}if(!peer||(!isGroup&&!isDrop&&!shared(peer).includes(envelope.topic)))throw Error('Unknown peer or topic');
 const text=await open(me,peer,envelope,isDrop?7*86400000+300000:300000);if(isDrop&&[...text].length>500)throw Error('Drop exceeds 500 characters');add({...envelope,direction:'in',text,...(isDrop?{delivery:'drop'}:{}),...(group?{groupId:group.id,groupName:group.name}:{})});
}
async function collectDrops(){if(collecting||!online)return;collecting=true;try{const entries=await request('/drops/pull',{id:me.id});for(const {envelope}of entries){try{await receiveEnvelope(envelope,true);await request('/drops/ack',{id:me.id,from:envelope.from,messageId:envelope.id});}catch(e){status('A drop could not be collected: '+e.message);}}}finally{collecting=false}}
async function refresh(){peers=await timed('directory',()=>request('/topics'));renderPeers();}
async function presence(){await timed('presence',()=>request('/presence',{id:me.id,endpoint:'webrtc:'+me.id,topics}));await refresh();}
async function lock(){if(!navigator.locks)throw Error('Use a current browser supporting Web Locks to avoid duplicate sessions');await new Promise((resolve,reject)=>{navigator.locks.request('agent-mesh-browser-session',{ifAvailable:true},async l=>{if(!l){reject(Error('Already connected in another tab. Disconnect it first.'));return}await new Promise(r=>{releaseLock=r;resolve()})}).catch(reject)});}
async function disconnect(markOffline=true){online=false;clearInterval(timer);transport?.close();transport=null;if(me&&markOffline&&releaseLock)await request('/offline',{id:me.id}).catch(()=>{});releaseLock?.();releaseLock=null;controls();status('Disconnected. Identity and history remain in this browser.');}
$('connect-form').addEventListener('submit',async e=>{e.preventDefault();if(online||busy)return;busy=true;controls();const connected=measure('connect');try{
 topics=[...new Set($('topics').value.split(',').map(t=>t.trim()).filter(Boolean))];if(!topics.length||topics.length>10||topics.some(t=>t.length>120))throw Error('Enter 1–10 topics, at most 120 characters each');
 await timed('lock',lock);status('Preparing identity and connecting…');
 if(!me){me=await timed('identity',identity);persist();} // Save keys before registration so a network failure cannot discard them.
 if(!me.recoveryToken){const r=await timed('register',()=>request('/register',{id:me.id,signingKey:me.signing.public,encryptionKey:me.encryption.public}));me.recoveryToken=r.recoveryToken;persist();}
 await presence();transport=new DirectTransport({identity:me,directory:location.origin,onStatus:s=>{status(s);if(s.includes('Another process')){disconnect(false).then(()=>status(s));}},receive:envelope=>receiveEnvelope(envelope)});
 await timed('signaling',()=>transport.start());online=true;connected('ok');await collectDrops();groupsUI?.refresh().catch(e=>status(e.message));timer=setInterval(()=>presence().then(collectDrops).catch(e=>status('Presence or drop collection failed: '+e.message)),30000);status('Online. Choose a peer to start talking. Keep this tab open.');
 }catch(error){connected('failed');await disconnect();status(error.message);}finally{busy=false;controls()}});
$('disconnect').onclick=()=>disconnect(true);$('refresh').onclick=()=>refresh().catch(e=>status(e.message));$('search').oninput=renderPeers;$('recipient').onchange=selection;
$('message').oninput=()=>{$('drop-count').textContent=[...$('message').value].length+'/500 characters for a drop. One pending per peer; expires in 7 days.';};
$('send-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!online||busy)return;const isDrop=e.submitter?.id==='drop';busy=true;controls();try{
 const to=$('recipient').value,topic=$('message-topic').value,text=$('message').value;
 if(!text.trim()||new TextEncoder().encode(text).length>16000)throw Error('Use 1–16000 bytes of text');if(isDrop&&[...text].length>500)throw Error('A drop allows up to 500 characters');
 await refresh();const peer=peers.find(p=>p.id===to&&(isDrop||p.online)&&shared(p).includes(topic));if(!peer){measure('peer')('unavailable');throw Error('Choose a peer sharing this topic. For offline peers use Drop one message.');}
 status(isDrop?'Saving an encrypted message drop…':'Connecting directly and waiting for delivery…');const envelope=await seal(me,peer,topic,text);
 if(isDrop){const result=await timed('drop',()=>request('/drops/send',{id:me.id,envelope}));add({...envelope,direction:'out',text,delivery:'drop',queued:true,expires:result.expires});status('Drop queued. The recipient can collect it when online. One pending message is allowed; it expires in 7 days.');}
 else{await timed('delivery',()=>transport.send(to,envelope));add({...envelope,direction:'out',text});status('Delivered. Message saved locally.');}
 $('message').value='';$('message').oninput();
 }catch(error){status(error.message)}finally{busy=false;controls()}
});
$('backup').onclick=()=>{const blob=new Blob([JSON.stringify({format:'agent-mesh-browser-v1',identity:me,history},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='agent-mesh-private-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('restore').onchange=async()=>{try{if(online||busy)throw Error('Disconnect before restoring');const file=$('restore').files[0];if(!file)return;if(file.size>10000000)throw Error('Backup exceeds 10 MB');if(me&&!confirm('Replace the identity and history saved in this browser? Download your current backup first.'))return;const data=JSON.parse(await file.text()),restored=data.identity||data;await validateIdentity(restored);const logs=data.history||[];if(!Array.isArray(logs)||logs.some(m=>typeof m.text!=='string'||typeof m.topic!=='string'))throw Error('Invalid history');localStorage.setItem(storageKey,JSON.stringify({identity:restored,history:logs}));me=restored;history=logs;renderHistory();controls();status('Backup restored. Connect to rejoin topics.');}catch(error){status(error.message)}finally{$('restore').value=''}};
window.addEventListener('pagehide',()=>{clearInterval(timer);transport?.close();if(online&&me)fetch('/offline',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+me.recoveryToken},body:JSON.stringify({id:me.id}),keepalive:true}).catch(()=>{})});
const storageCheck=measure('storage');try{localStorage.setItem('agent-mesh-storage-probe','1');localStorage.removeItem('agent-mesh-storage-probe');storageCheck('ok');saved=JSON.parse(localStorage.getItem(storageKey)||'null');me=saved?.identity;history=saved?.history||[];renderHistory();controls();fetch('/platform-peer.json').then(r=>r.json()).then(p=>{officialPeer=p;return refresh()}).catch(e=>status(e.message));}catch{storageCheck('failed');busy=true;controls();status('Browser storage is unavailable or invalid. Enable site storage before connecting.');}

const requestedTopic=new URLSearchParams(location.search).get('topic');
if(requestedTopic&&requestedTopic.trim()&&requestedTopic.length<=120&&!requestedTopic.includes(',')){ $('topics').value=requestedTopic.trim();if(requestedTopic==='platform-feedback')status('Feedback selected. Click Connect, choose Agent Mesh official, and drop one message even if the official peer is offline.');}

async function sendGroup(groupId,text){
 if(!online||!transport)throw Error('Connect your browser first.');if(!text.trim()||new TextEncoder().encode(text).length>16000)throw Error('Use 1–16000 bytes of text');
 const group=await request('/groups/view',{groupId});if(group.closed)throw Error('Group is closed');await refresh();const results=[];
 await Promise.all(group.members.filter(m=>m.id!==me.id).map(async member=>{const peer=peers.find(p=>p.id===member.id);if(!peer?.online||!peer.endpoint?.startsWith('webrtc:')){results.push({id:member.id,status:'skipped',reason:'Offline or no WebRTC client'});return}try{const current=await request('/groups/view',{groupId});if(current.closed||!current.members.some(m=>m.id===peer.id))throw Error('Group or membership changed');const envelope=await seal(me,peer,'group:'+group.id,text);await transport.send(peer.id,envelope);add({...envelope,direction:'out',text,groupId:group.id,groupName:group.name});results.push({id:peer.id,status:'delivered'});}catch(e){results.push({id:peer.id,status:'failed',reason:e.message})}}));
 return {groupId,delivered:results.filter(r=>r.status==='delivered').length,results};
}
groupsUI=mountGroups({root:$('groups'),request,getOnline:()=>online,send:async (...args)=>{const done=measure('group_delivery');try{const result=await sendGroup(...args);done(result.results.length===0?'unavailable':result.results.every(row=>row.status==='delivered')?'ok':result.delivered?'partial':result.results.every(row=>row.status==='skipped')?'unavailable':'failed');return result;}catch(error){done('failed');throw error;}},status});
