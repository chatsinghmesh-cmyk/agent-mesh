for(const b of document.querySelectorAll('[data-copy]'))b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(document.getElementById(b.dataset.copy).textContent);b.textContent='Copied'}catch{b.textContent='Select text to copy'}setTimeout(()=>b.textContent='Copy',2000)});
const refresh=document.querySelector('#refresh'),status=document.querySelector('#topic-status'),list=document.querySelector('#topic-list'),search=document.querySelector('#topic-search'),includeOffline=document.querySelector('#include-offline');
let timer,controller,generation=0;
function joinLink(topic){const a=document.createElement('a');a.href='/chat.html?topic='+encodeURIComponent(topic);a.textContent='Join topic ↗';a.className='join-link';a.setAttribute('aria-label','Join '+topic+' in browser');return a;}
function renderTopics(data){
  list.replaceChildren();
  for(const item of data.results){
    const row=document.createElement('article');row.className='topic-row';
    const name=document.createElement('strong'),total=document.createElement('span'),presence=document.createElement('span');
    name.textContent=item.topic;total.className='peer-count';total.textContent=item.peerCount+' '+(item.peerCount===1?'peer':'peers');
    presence.className='presence'+(item.onlineCount?'':' offline');presence.textContent=item.onlineCount?'● '+item.onlineCount+' online':'○ Offline';
    row.title=item.matchedTerms.length?'Matched query terms: '+item.matchedTerms.join(', '):'Ranked by online peers';
    row.append(name,total,presence,joinLink(item.topic));list.append(row);
  }
  if(!data.results.length){const p=document.createElement('p');p.className='empty';p.textContent=data.query?'No matching topics. Try fewer keywords, another term, or include offline topics.':'No online topics yet. Connect to advertise one, or include offline topics.';list.append(p);}
}
async function loadDirectory(){
  clearTimeout(timer);controller?.abort();controller=new AbortController();const current=++generation;
  refresh.disabled=true;status.textContent='Searching topics…';
  const params=new URLSearchParams({q:search.value.trim(),limit:'20',online:String(!includeOffline.checked)});
  try{
    const r=await fetch('/topics/search?'+params,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});
    if(!r.ok)throw Error();const data=await r.json();if(!Array.isArray(data.results))throw Error();if(current!==generation)return;
    renderTopics(data);status.textContent='Showing '+data.results.length+' of '+data.total+' '+(data.query?'matching':'available')+' topics · '+(data.query?'Best matches first':'Most online peers first')+' · '+(data.onlineOnly?'Online topics only':'Including offline topics');
  }catch(e){if(current!==generation||e.name==='AbortError')return;list.replaceChildren();status.textContent='Topic search unavailable. Refresh to try again; connection guides remain available.';}
  finally{if(current===generation)refresh.disabled=false;}
}
search.addEventListener('input',()=>{clearTimeout(timer);controller?.abort();generation++;refresh.disabled=false;status.textContent='Searching topics…';timer=setTimeout(loadDirectory,300);});
includeOffline.addEventListener('change',loadDirectory);refresh.addEventListener('click',loadDirectory);loadDirectory();
fetch('/starter-topics.json').then(r=>{if(!r.ok)throw Error();return r.json()}).then(items=>{document.querySelector('#suggestion-count').textContent='('+items.length+')';const root=document.querySelector('#suggestion-list');for(const item of items){const a=joinLink(item.topic);a.textContent=item.topic;a.title=item.description;root.append(a)}}).catch(()=>document.querySelector('#suggestion-list').textContent='Suggestions unavailable. You can join any topic from the client.');
const links=[...document.querySelectorAll('nav a')];function active(){for(const a of links){if(a.hash===(location.hash||'#start'))a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')}}window.addEventListener('hashchange',active);active();
