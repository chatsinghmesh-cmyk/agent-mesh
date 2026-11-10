// Search advertised topic names only. No chat content or external AI requests.
const STOP=new Set('a an the i we you my our to for of on in with and or need want looking find me can someone please help how do does is are agent agents topic topics'.split(' '));
const GROUPS=[['code','coding','program','programming','developer','development','software'],['debug','debugging','bug','bugs','error','errors','fix'],['review','reviewing','audit'],['test','tests','testing','qa'],['web','website','frontend','html','css'],['backend','server','api','apis'],['data','dataset','datasets','analytics','analysis'],['write','writing','writer','content'],['research','researching','paper','papers'],['collaborate','collaboration','coordinate','coordination','team'],['javascript','js','node','nodejs'],['typescript','ts'],['python','py'],['security','secure','vulnerability','vulnerabilities'],['deploy','deployment','hosting','cloudflare'],['feedback','support']];
function normalize(s){return s.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/c\+\+/g,'cpp').replace(/c#/g,'csharp').replace(/\.net\b/g,'dotnet').replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function tokens(s){return [...new Set(normalize(s).split(/\s+/).filter(Boolean))];}
function stem(s){return s.length>4&&s.endsWith('s')?s.slice(0,-1):s;}
const synonyms=new Map();for(const group of GROUPS)for(const term of group)synonyms.set(term,new Set(group));
function oneEdit(a,b){
  if(Math.abs(a.length-b.length)>1)return false;
  if(a.length===b.length){const different=[];for(let i=0;i<a.length;i++)if(a[i]!==b[i])different.push(i);if(different.length===2&&different[1]===different[0]+1){const i=different[0];return a[i]===b[i+1]&&a[i+1]===b[i];}}
  let i=0,j=0,edits=0;
  while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}
  return edits+(i<a.length||j<b.length?1:0)<=1;
}
function match(q,t){if(q===t)return 1;if(stem(q)===stem(t))return .95;if(q.length>=3&&t.startsWith(q))return .8;if(synonyms.get(q)?.has(t))return .7;if(q.length>=4&&t.length>=4&&oneEdit(q,t))return .5;return 0;}

export function searchTopics(records,params=new URLSearchParams(),now=Date.now()){
  const query=(params.get('q')||'').trim(),rawLimit=params.get('limit')??'10',online=params.get('online')??'true';
  if(query.length>200)throw Error('Search query must be at most 200 characters');
  if(!/^\d+$/.test(rawLimit)||+rawLimit<1||+rawLimit>50)throw Error('limit must be between 1 and 50');
  if(!['true','false'].includes(online))throw Error('online must be true or false');
  const onlineOnly=online==='true',limit=+rawLimit,terms=tokens(query).filter(t=>!STOP.has(t)).slice(0,20),catalog=new Map();
  for(const peer of records){
    const isOnline=peer.seen>0&&now-peer.seen<90000;
    for(const topic of new Set(peer.topics||[])){
      if(!catalog.has(topic))catalog.set(topic,{topic,onlineCount:0,peerCount:0,peers:[],words:tokens(topic)});
      const item=catalog.get(topic);item.peerCount++;if(isOnline)item.onlineCount++;
      // Keep bounded samples with online peers first, regardless of registry order.
      if(!onlineOnly||isOnline){item.peers.push({id:peer.id,online:isOnline});item.peers.sort((a,b)=>Number(b.online)-Number(a.online)||a.id.localeCompare(b.id));if(item.peers.length>5)item.peers.length=5;}
    }
  }
  const documents=[...catalog.values()].filter(item=>!onlineOnly||item.onlineCount);
  const idf=terms.map(q=>1+Math.log(1+documents.length/(1+documents.filter(d=>d.words.some(t=>match(q,t)>=.7)).length)));
  const results=[];
  for(const item of documents){
    const matches=terms.map(q=>Math.max(0,...item.words.map(t=>match(q,t))));
    const matchedTerms=terms.filter((_,i)=>matches[i]>0),coverage=terms.length?matchedTerms.length/terms.length:0;
    if(query&&(!terms.length||!matchedTerms.length))continue;
    const phrase=normalize(item.topic),needle=normalize(query);
    let score=terms.length?matches.reduce((sum,value,i)=>sum+value*idf[i],0)*coverage*coverage/(.7+.15*item.words.length):0;
    if(query&&phrase===needle)score+=5;else if(query&&phrase.includes(needle))score+=2;
    if(score>0)score+=Math.min(.2,Math.log1p(item.onlineCount)*.05);
    results.push({topic:item.topic,score:Math.round(score*1000)/1000,matchedTerms,onlineCount:item.onlineCount,peerCount:item.peerCount,peers:item.peers});
  }
  results.sort((a,b)=>b.score-a.score||b.onlineCount-a.onlineCount||a.topic.localeCompare(b.topic));
  return {query,onlineOnly,limit,total:results.length,results:results.slice(0,limit)};
}
