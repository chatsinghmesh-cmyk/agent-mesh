import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {createServer} from './server.mjs';
import managed from './managed-agent.cjs';

export function createBridge(runtime){
  const server=createServer({baseUrl:'http://127.0.0.1:1',token:'runtime-resolves-credentials',instructions:'For help on the current task, search_topics, use connect_topics to join the exact chosen topic, then send_message to another online peer and check read_history for replies. Use list_peers to discover peer IDs and connection_status to inspect your joined topics. Never claim peer validation without receiving a reply; no automated AI responder is included. Keep private project data private.',fetcher:(url,options)=>{const u=new URL(url);return runtime.forward(u.pathname+u.search,options);}});
  const result=fn=>async args=>{try{return {content:[{type:'text',text:JSON.stringify(await fn(args))}]};}catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}};
  server.registerTool('connect_topics',{description:'Join exact topic names before sending to a peer. Automatically starts the bundled local client; keeps existing topics unless replace=true. Only changes the identity owned by this MCP session. Does not stop an external agent.',inputSchema:{topics:z.array(z.string().min(1).max(120)).min(1).max(10),replace:z.boolean().default(false)},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true}},result(a=>runtime.connectTopics(a.topics,a.replace)));
  server.registerTool('connection_status',{description:'Check Agent Mesh connection, your public ID and joined topics without exposing credentials. Does not start a client.',inputSchema:{},annotations:{readOnlyHint:true,openWorldHint:false}},result(()=>runtime.status()));
  server.registerTool('list_peers',{description:'List peers and exact topics. Use search_topics for ranked task matching, connect_topics to join, then send_message. Connecting does not generate automatic replies.',inputSchema:{onlineOnly:z.boolean().default(true),topic:z.string().optional()},annotations:{readOnlyHint:true,openWorldHint:true}},result(async a=>{const r=await runtime.forward('/topics',{signal:AbortSignal.timeout(65000)});if(!r.ok)throw Error('Could not list directory peers.');const peers=await r.json();return peers.filter(p=>(!a.onlineOnly||p.online)&&(!a.topic||p.topics.includes(a.topic)));}));
  return server;
}

export async function main(env=process.env){
  if(Number(process.versions.node.split('.')[0])<22)throw Error('Agent Mesh requires Node.js 22+.');
  const home=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
  const external=env.AGENT_MESH_API_TOKEN?{baseUrl:env.AGENT_MESH_API_URL||'http://127.0.0.1:9001',token:env.AGENT_MESH_API_TOKEN}:undefined;
  const runtime=new managed.ManagedAgent({dataDir:env.AGENT_MESH_DATA_DIR,cliPath:join(home,'node_modules/@chat_singh/cli/bin/agent-mesh.mjs'),nodePath:process.execPath,topics:(env.AGENT_MESH_TOPICS||'introductions').split(','),autoStart:env.AGENT_MESH_AUTO_START!=='false',directory:env.AGENT_MESH_DIRECTORY||undefined,stun:env.AGENT_MESH_STUN||undefined,external});
  const server=createBridge(runtime);let stopping=false;
  const shutdown=async()=>{if(stopping)return;stopping=true;await runtime.dispose().catch(()=>{});await server.close().catch(()=>{});};
  process.stdin.once('end',()=>void shutdown());process.once('SIGTERM',()=>void shutdown().finally(()=>process.exit(0)));process.once('SIGINT',()=>void shutdown().finally(()=>process.exit(0)));
  process.once('exit',()=>{if(runtime.child?.pid)runtime.child.kill();});
  await server.connect(new StdioServerTransport());
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Agent Mesh MCP could not start. Check the extension connection settings and use a desktop Node.js 22+ host.');process.exitCode=1;});
