import {Registry} from './registry.mjs';
import {validateSignal} from './signaling.mjs';
import {handleDrops} from './drops.mjs';
import {handleGroups} from './groups.mjs';
export default {fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path.startsWith('/groups/')||['/topics','/topics/search','/register','/presence','/offline','/connect','/drops/send','/drops/pull','/drops/ack'].includes(path))return env.DIRECTORY.get(env.DIRECTORY.idFromName('directory')).fetch(request);
  return env.ASSETS.fetch(request);
}};
export class Directory {
  constructor(state){this.state=state;this.ready=state.blockConcurrencyWhile(async()=>{this.registry=new Registry(await state.storage.get('records')||{});const entries=state.storage.list?await state.storage.list({prefix:'groupmeta:'}):new Map();this.groups=Object.fromEntries([...entries].map(([,g])=>[g.id,g]));});
    if(typeof WebSocketRequestResponsePair!=='undefined')state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
  }
  async fetch(req){
    await this.ready;
    try{
      const url=new URL(req.url);
      if(url.pathname==='/connect'){
        const protocols=(req.headers.get('sec-websocket-protocol')||'').split(',').map(s=>s.trim());
        const browserProtocol=protocols.find(s=>/^agent-mesh-auth\.[A-Za-z0-9_-]{43}$/.test(s));
        if(browserProtocol&&req.headers.get('origin')!==url.origin)return new Response('Origin denied',{status:403});
        const id=url.searchParams.get('id'),token=(req.headers.get('authorization')||'').replace(/^Bearer /,'')||(browserProtocol?.slice('agent-mesh-auth.'.length)||'');
        if(!this.registry.authenticate(id,token))return Response.json({error:'Invalid recovery token'},{status:401});
        if(req.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
        for(const ws of this.state.getWebSockets(id))ws.close(4001,'Reconnected on another session');
        const [client,server]=Object.values(new WebSocketPair());this.state.acceptWebSocket(server,[id]);server.serializeAttachment({id,bucket:Date.now(),count:0});
        return new Response(null,{status:101,webSocket:client,headers:browserProtocol?{'sec-websocket-protocol':browserProtocol}:{}});
      }
      if(Number(req.headers.get('content-length')||0)>16384)return Response.json({error:'Too large'},{status:413});
      const raw=await req.text();if(raw.length>16384)return Response.json({error:'Too large'},{status:413});
      return await this.state.blockConcurrencyWhile(async()=>{
        if(url.pathname.startsWith('/groups/')){
          if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
          const body=raw?JSON.parse(raw):{},next={...this.groups};if(next[body.groupId])next[body.groupId]=structuredClone(next[body.groupId]);
          const [status,result]=handleGroups(next,this.registry,url.pathname,body,(req.headers.get('authorization')||'').replace(/^Bearer /,''));
          if(status<300&&!['/groups/list','/groups/view'].includes(url.pathname)){const key=url.pathname==='/groups/create'?result.id:body.groupId;await this.state.storage.put('groupmeta:'+key,next[key]);this.groups=next;}
          return Response.json(result,{status,headers:{'cache-control':'no-store'}});
        }
        if(url.pathname.startsWith('/drops/')){
          if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
          const [status,result]=await handleDrops(this.state.storage,this.registry,url.pathname,raw?JSON.parse(raw):{},(req.headers.get('authorization')||'').replace(/^Bearer /,''));
          if(url.pathname==='/drops/send'&&status<300&&this.state.storage.setAlarm){const next=await this.state.storage.getAlarm();if(!next||next>result.expires)await this.state.storage.setAlarm(result.expires);}
          return Response.json(result,{status,headers:{'cache-control':'no-store'}});
        }
        const [status,result]=this.registry.handle(req.method,url.pathname,raw?JSON.parse(raw):{},(req.headers.get('authorization')||'').replace(/^Bearer /,''),url.searchParams);
        if(req.method==='POST'&&status<300)await this.state.storage.put('records',this.registry.records);
        return Response.json(result,{status,headers:{'cache-control':'no-store'}});
      });
    }catch{return Response.json({error:'Invalid request'},{status:400});}
  }
  async webSocketMessage(ws,raw){
    await this.ready;if(raw==='ping'){ws.send('pong');return;}
    try{
      if(typeof raw!=='string'||raw.length>26000)throw Error('Invalid negotiation');
      const a=ws.deserializeAttachment();if(!a?.id)throw Error('Unknown session');
      if(Date.now()-a.bucket>60000){a.bucket=Date.now();a.count=0;}if(++a.count>120)throw Error('Negotiation rate limit');ws.serializeAttachment(a);
      const signal=validateSignal(a.id,JSON.parse(raw),this.registry.records,Date.now(),this.groups),targets=this.state.getWebSockets(signal.to);
      if(!targets.length)throw Error('Peer signaling offline');
      for(const target of targets)target.send(JSON.stringify(signal));
    }catch(e){ws.send(JSON.stringify({error:e.message}));}
  }
  webSocketClose(ws,code){ws.close(code===1006?1000:code,'Closed');}
  webSocketError(ws){ws.close(1011,'Reconnect required');}
  async alarm(){await this.ready;await this.state.blockConcurrencyWhile(async()=>{const entries=await this.state.storage.list({prefix:'drop:'});let next=Infinity;for(const [key,value]of entries){if(value.expires<=Date.now())await this.state.storage.delete(key);else next=Math.min(next,value.expires);}if(Number.isFinite(next))await this.state.storage.setAlarm(next);});}
}
