import {catalog} from './group-extension-catalog.mjs';
export function mountGroups({root,request,getOnline,send,status}){
 const requestedGroup=new URLSearchParams(location.search).get('group');
 let selected=/^[a-f0-9]{32}$/.test(requestedGroup||'')?requestedGroup:'',busy=false;
 let pendingLink=selected;

 const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node};
 const title=el('h2','Groups'),intro=el('p','Approval required · Up to 32 members · Online P2P messages only. Group names are discoverable; member lists require membership.');intro.className='fine';
 const create=el('form'),name=el('input');name.id='group-create-name';name.required=true;name.maxLength=80;name.placeholder='Group name';const label=el('label','Create a group');label.htmlFor=name.id;
 const createButton=el('button','Create group');createButton.className='button';create.append(label,name,createButton);
 const refreshButton=el('button','Refresh groups ↻');refreshButton.type='button';refreshButton.className='text-link';
 const select=el('select');select.id='group-select';const selectLabel=el('label','Choose a group');selectLabel.htmlFor=select.id;
 const detail=el('div'),notice=el('p','Connect first to manage groups.'),groupList=el('div');notice.className='fine';root.append(title,intro,create,refreshButton,selectLabel,select,notice,detail,groupList);
 function button(text,action){const b=el('button',text);b.type='button';b.className='button secondary';b.disabled=busy||!getOnline();b.onclick=()=>task(action);return b;}
 function setOnline(){createButton.disabled=busy||!getOnline();refreshButton.disabled=busy||!getOnline();select.disabled=busy||!getOnline();for(const b of detail.querySelectorAll('button'))b.disabled=busy||!getOnline();}
 async function task(action){if(busy)return;if(!getOnline()){status('Connect your browser identity first.');return;}busy=true;setOnline();try{await action();await refresh();}catch(e){status(e.message)}finally{busy=false;setOnline()}}
 async function act(action,extra={}){await request('/groups/action',{groupId:selected,action,...extra});status('Group updated: '+action);}
 async function render(item){detail.replaceChildren();if(!item)return;
  const heading=el('h3',item.name),meta=el('p',`ID: ${item.id} · ${item.memberCount}/32 members · ${item.closed?'Closed':'Open'} · Your role: ${item.role||'not a member'}`);meta.className='identity';detail.append(heading,meta);
  if(item.role&&!item.closed){
   const link=new URL('/chat',location.origin);link.searchParams.set('group',item.id);link.hash='groups';
   detail.append(button('Copy group link',async()=>{
    try{await navigator.clipboard.writeText(link.href);status('Group link copied. New members still need admin approval.');}
    catch{status('Share this group link: '+link.href);}
   }));
  }
  if(!item.role){
   if(item.requested&&!item.closed){
    const verification=await request('/groups/verification',{groupId:item.id});
    if(verification.team){
     detail.append(el('p','GitHub team required: '+verification.team));
     detail.append(button('Get GitHub verification code',async()=>{
      const result=await request('/github/start',{groupId:item.id});
      status('Open https://github.com/login/device and enter '+result.code+'. Then select Check GitHub verification.');
     }),button('Check GitHub verification',async()=>{
      const result=await request('/github/check',{groupId:item.id});
      status(result.pending?'GitHub approval is pending. Try again shortly.':'GitHub team verified. An admin can now approve your request.');
     }));
    }
   }
   detail.append(button(item.requested?'Cancel join request':'Request to join',()=>act(item.requested?'cancel-request':'request')));return;}
  const group=await request('/groups/view',{groupId:selected}),admin=['owner','admin'].includes(group.role),isOwner=group.role==='owner';
  if(!group.closed){const form=el('form'),text=el('textarea'),textLabel=el('label','Group message');text.id='group-message';text.required=true;text.rows=3;text.maxLength=16000;textLabel.htmlFor=text.id;const submit=el('button','Send to online members');submit.className='button';submit.disabled=busy||!getOnline();form.append(textLabel,text,submit);form.onsubmit=e=>{e.preventDefault();task(async()=>{status('Sending directly to online group members…');const result=await send(selected,text.value);const failed=result.results.filter(x=>x.status==='failed').length,skipped=result.results.filter(x=>x.status==='skipped').length;status(`Group delivery: ${result.delivered} delivered, ${skipped} offline/skipped, ${failed} failed. No offline queue or automatic retry.`);text.value='';})};detail.append(form);}
  const integrations=el('section');integrations.append(el('h3','Group extensions'),el('p','Choose extensions from the store and set them up in your project.'));
  const store=el('a','Browse the extension store');store.href='/group-extensions.html';integrations.append(store);
  const choices=[];
  for(const entry of catalog){
   const row=el('div'),label=el('label'),input=el('input');
   input.type='checkbox';input.value=entry.id;input.checked=(group.integrations||[]).includes(entry.id);input.disabled=!admin||group.closed;
   label.append(input,document.createTextNode(' '+entry.name));row.append(label,el('p',entry.purpose),el('small','By '+entry.author));choices.push(input);
   for(const [text,href] of [['Setup guide',entry.guide],['Downloads',entry.download]]){
    const link=el('a',text);link.href=href;link.target='_blank';link.rel='noopener noreferrer';row.append(link,document.createTextNode(' '));
   }
   integrations.append(row);
  }
  if(admin&&!group.closed)integrations.append(button('Save group extensions',()=>act('integrations',{integrations:choices.filter(input=>input.checked).map(input=>input.value)})));
  detail.append(integrations);
  const members=el('div');members.append(el('h3','Members'));
  for(const member of group.members){const row=el('div');row.className='group-member';row.append(el('code',member.id),el('span',member.role));if(admin&&!group.closed&&member.role!=='owner'){row.append(button('Remove',()=>act('remove',{target:member.id})),button(member.role==='admin'?'Demote':'Make admin',()=>act(member.role==='admin'?'demote':'promote',{target:member.id})));}members.append(row)}detail.append(members);
  if(admin&&!group.closed){const requests=el('div');requests.append(el('h3','Join requests'));
   const teamForm=el('form'),teamInput=el('input'),teamLabel=el('label','Required GitHub team (optional)');
   teamInput.id='group-github-team';teamLabel.htmlFor=teamInput.id;teamInput.placeholder='organization/team';teamInput.value=group.githubTeam||'';teamInput.maxLength=140;
   teamForm.append(teamLabel,teamInput,el('button','Save GitHub team'));
   teamForm.onsubmit=e=>{e.preventDefault();task(()=>act('github-team',{team:teamInput.value.trim()}));};
   detail.append(teamForm);if(!group.requests.length)requests.append(el('p','No pending requests.'));for(const id of group.requests){const row=el('div');row.className='group-member';const check=group.githubChecks?.[id];
   if(group.githubTeam)row.append(el('span',check&&Date.now()-check.checkedAt<900000?'Verified GitHub member: '+check.login+' · '+check.team:'GitHub verification required'));
   row.append(el('code',id),button('Approve',()=>act('approve',{target:id})),button('Reject',()=>act('reject',{target:id})));requests.append(row)}detail.append(requests);
   const rename=el('form'),renameLabel=el('label','Rename group'),input=el('input');input.id='group-rename';renameLabel.htmlFor=input.id;input.value=group.name;input.required=true;input.maxLength=80;const save=el('button','Save name');save.className='button secondary';rename.append(renameLabel,input,save);rename.onsubmit=e=>{e.preventDefault();task(()=>act('rename',{name:input.value}))};detail.append(rename);
  }
  if(isOwner)detail.append(button(group.closed?'Reopen group':'Close group',async()=>{if(group.closed||confirm('Close this group? New group messages and join requests will stop. You can reopen it later.'))await act(group.closed?'reopen':'close')}));
  else detail.append(button('Leave group',()=>act('leave')));
 }
 async function refresh(){if(!getOnline()){notice.textContent='Connect first to manage groups.';return}const list=await request('/groups/list');select.replaceChildren(new Option('Choose a group',''),...list.map(g=>new Option(`${g.name} [${g.id.slice(0,8)}] · ${g.closed?'closed':g.role|| (g.requested?'request pending':'request to join')}`,g.id)));select.value=list.some(g=>g.id===selected)?selected:'';selected=select.value;const item=list.find(g=>g.id===selected);
 notice.textContent=pendingLink&&!item?'The linked group is unavailable.':list.length+' groups · Admins approve join requests.';
 pendingLink='';await render(item);setOnline();}
 create.onsubmit=e=>{e.preventDefault();task(async()=>{const g=await request('/groups/create',{name:name.value});selected=g.id;name.value='';status('Group created. Copy the group link so peers can request to join.');})};refreshButton.onclick=()=>task(async()=>{});select.onchange=()=>{selected=select.value;task(async()=>{})};setOnline();
 return {refresh,setOnline};
}
