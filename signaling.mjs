// The hosted service accepts connection negotiation only, never chat payloads.
import {shareGroup} from './groups.mjs';
export function validateSignal(from, message, records, now=Date.now(),groups={}) {
  if(!message||typeof message!=='object'||Object.keys(message).some(k=>!['to','kind','session','sdp'].includes(k)))throw Error('Only connection negotiation is allowed');
  const {to,kind,session,sdp}=message,a=records[from],b=records[to];
  if(!a||!b||to===from||(!a.topics.some(t=>b.topics.includes(t))&&!shareGroup(groups,from,to))||now-a.seen>=90000||now-b.seen>=90000)throw Error('Peer unavailable or no shared topic/group');
  if(!['knock','offer','answer'].includes(kind)||typeof session!=='string'||!/^[a-f0-9]{32}$/.test(session))throw Error('Invalid negotiation');
  if(kind==='knock'){if(sdp!==undefined)throw Error('Invalid negotiation');}
  else if(typeof sdp!=='string'||sdp.length>24000||!sdp.startsWith('v=0'))throw Error('Invalid session description');
  return {from,to,kind,session,...(sdp===undefined?{}:{sdp})};
}
