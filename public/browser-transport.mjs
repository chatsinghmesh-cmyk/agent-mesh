const randomBytes=n=>({toString:()=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('')});
export class DirectTransport {
  constructor({identity,directory,receive,iceServers=[{urls:'stun:stun.cloudflare.com:3478'}],timeoutMs=40000,onStatus=()=>{}}){
    this.me=identity;this.directory=directory;this.receive=receive;this.iceServers=iceServers;this.timeoutMs=timeoutMs;this.onStatus=onStatus;this.peers=new Map();this.pending=new Map();this.stopped=false;
  }
  async start(){await this.connect();}
  connect(){return new Promise((resolve,reject)=>{
    const url=new URL(this.directory+'/connect');url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('id',this.me.id);
    const ws=this.ws=new WebSocket(url,['agent-mesh-auth.'+this.me.recoveryToken]);let opened=false;
    ws.addEventListener('open',()=>{opened=true;this.onStatus('Signaling online; chat travels directly between peers.');resolve();});
    ws.addEventListener('error',()=>{if(!opened)reject(Error('Cannot connect to directory signaling. Check the directory URL and recovery token.'));});
    ws.addEventListener('message',({data:raw})=>{if(raw.toString()==='pong')return;try{const message=JSON.parse(raw);if(message.error){this.onStatus('Connection setup: '+message.error);return;}this.handleSignal(message).catch(e=>this.onStatus('Connection setup failed: '+e.message));}catch{this.onStatus('Invalid signaling response');}});
    ws.addEventListener('close',({code})=>{if(!opened)reject(Error('Directory signaling connection closed'));if(this.stopped)return;if(code===4001){this.onStatus('Another process connected with this identity. Stop the duplicate agent.');return;}this.onStatus('Directory signaling disconnected; retrying.');this.retry=setTimeout(()=>this.connect().catch(e=>this.onStatus(e.message)),3000);});
  });}
  signal(to,kind,session,sdp){if(this.ws?.readyState!==1)throw Error('Signaling is offline; try again after reconnecting');this.ws.send(JSON.stringify({to,kind,session,...(sdp?{sdp}:{})}));}
  make(peer,session){
    if(this.peers.size>=64)throw Error('Too many direct peer connections');
    const entry={peer,session,pc:null,channel:null};
    entry.ready=new Promise((resolve,reject)=>{entry.resolve=resolve;entry.reject=reject;});entry.ready.catch(()=>{});
    entry.timer=setTimeout(()=>this.drop(peer,Error('Direct connection failed. This network may require a relay; no chat was sent through the server.')),this.timeoutMs);
    this.peers.set(peer,entry);return entry;
  }
  setup(entry){
    const pc=entry.pc=new RTCPeerConnection({iceServers:this.iceServers});
    pc.ondatachannel=({channel})=>this.attach(entry,channel);
    pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState))this.drop(entry.peer,Error('Direct connection closed'));};
    return pc;
  }
  attach(entry,channel){
    if(entry.channel){channel.close();return;}entry.channel=channel;
    channel.onopen=()=>{clearTimeout(entry.timer);entry.resolve(channel);};
    channel.onclose=()=>this.drop(entry.peer,Error('Direct channel closed'));
    channel.onmessage=async({data})=>{
      try{
        const raw=typeof data==='string'?data:data.toString();if(new TextEncoder().encode(raw).length>64000)throw Error('Message too large');const packet=JSON.parse(raw);
        if(packet.type==='ack'){
          const p=this.pending.get(packet.id);if(p?.peer===entry.peer){this.pending.delete(packet.id);clearTimeout(p.timer);packet.error?p.reject(Error('Peer rejected the message')):p.resolve({received:true});}return;
        }
        if(packet.type!=='message'||packet.envelope?.from!==entry.peer)throw Error('Invalid peer message');
        try{await this.receive(packet.envelope);channel.send(JSON.stringify({type:'ack',id:packet.envelope.id}));}
        catch{channel.send(JSON.stringify({type:'ack',id:packet.envelope.id,error:true}));}
      }catch{this.onStatus('Rejected invalid direct peer packet');}
    };
    if(channel.readyState==='open'){clearTimeout(entry.timer);entry.resolve(channel);}
  }
  async gather(pc){
    if(pc.iceGatheringState==='complete')return;
    await new Promise((resolve,reject)=>{const finish=()=>{clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);resolve();};const check=()=>{if(pc.iceGatheringState==='complete')finish();};const timer=setTimeout(()=>{pc.removeEventListener('icegatheringstatechange',check);reject(Error('ICE gathering timed out'));},15000);pc.addEventListener('icegatheringstatechange',check);check();});
  }
  async offer(peer,entry){
    const pc=this.setup(entry);this.attach(entry,pc.createDataChannel('agent-mesh-v1'));
    await pc.setLocalDescription(await pc.createOffer());await this.gather(pc);
    if(this.peers.get(peer)!==entry)return;
    this.signal(peer,'offer',entry.session,pc.localDescription.sdp);
  }
  async handleSignal(m){
    if(typeof m.from!=='string'||!['knock','offer','answer'].includes(m.kind)||typeof m.session!=='string')return;
    let entry=this.peers.get(m.from);
    if(m.kind==='knock'){
      if(this.me.id>m.from)return;
      if(!entry){entry=this.make(m.from,randomBytes(16).toString('hex'));this.offer(m.from,entry).catch(e=>this.drop(m.from,e));}return;
    }
    if(m.kind==='offer'){
      if(this.me.id<m.from)return; // Deterministic offerer prevents simultaneous-offer glare.
      if(entry?.pc){if(entry.session===m.session)return;this.drop(m.from,Error('Peer restarted'));entry=null;}
      if(!entry)entry=this.make(m.from,m.session);entry.session=m.session;
      const pc=this.setup(entry);await pc.setRemoteDescription({type:'offer',sdp:m.sdp});await pc.setLocalDescription(await pc.createAnswer());await this.gather(pc);
      if(this.peers.get(m.from)===entry)this.signal(m.from,'answer',entry.session,pc.localDescription.sdp);return;
    }
    if(entry?.pc&&entry.session===m.session&&this.me.id<m.from)await entry.pc.setRemoteDescription({type:'answer',sdp:m.sdp});
  }
  async channel(peer){
    if(peer===this.me.id)throw Error('Choose another agent, not your own identity');
    let entry=this.peers.get(peer);
    if(!entry){entry=this.make(peer,randomBytes(16).toString('hex'));if(this.me.id<peer)this.offer(peer,entry).catch(e=>this.drop(peer,e));else this.signal(peer,'knock',entry.session);}
    return entry.ready;
  }
  async send(peer,envelope){
    const channel=await this.channel(peer);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(envelope.id);reject(Error('Delivery acknowledgement timed out. Delivery is uncertain; check history before retrying.'));},10000);
      this.pending.set(envelope.id,{peer,resolve,reject,timer});
      try{channel.send(JSON.stringify({type:'message',envelope}));}catch(e){clearTimeout(timer);this.pending.delete(envelope.id);reject(e);}
    });
  }
  drop(peer,error){const entry=this.peers.get(peer);if(!entry)return;this.peers.delete(peer);clearTimeout(entry.timer);entry.reject(error);for(const [id,p]of this.pending)if(p.peer===peer){clearTimeout(p.timer);p.reject(error);this.pending.delete(id);}entry.pc?.close();}
  close(){this.stopped=true;clearTimeout(this.retry);this.ws?.close();for(const peer of [...this.peers.keys()])this.drop(peer,Error('Agent stopped'));}
}
