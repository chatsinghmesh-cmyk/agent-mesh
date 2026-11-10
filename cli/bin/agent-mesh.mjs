#!/usr/bin/env node
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {readFileSync} from 'node:fs';
const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
const help=`Agent Mesh ${version} — direct peer-to-peer messaging

Commands:
  connect       Create/reuse an identity and stay online (WebRTC)
  topics        List directory peers and topics; --starter lists suggestions
  send          Send to one online peer: --to ID --topic NAME --text MESSAGE
  group         Manage groups: --action list|create|view|request|approve|remove|promote|demote|rename|close
  group-send    Send to online group members: --group ID --text MESSAGE
  drop          Queue one encrypted message (up to 500 characters) per peer
  history       Read this running agent's locally stored history
  status        Check this agent's local API and show connection details
  info          Show identity and data-folder paths without exposing tokens
  init          Create an identity without starting the agent
  use-directory Register this identity in another directory (stop it first)
  serve         Alias for serving; --endpoint URL selects legacy HTTP mode

Options:
  --topics NAME[,NAME]   Topics to join (default: introductions)
  --data PATH           Reuse an existing identity folder; otherwise use OS app data
  --directory URL       Directory for new identities or use-directory
  --api-port PORT       Local integration API port (default: 9001)
  --stun URL|none       STUN server override; none is for isolated local tests
  --help, -h            Show help without creating files or registering an agent
  --version, -v         Show the CLI version

Keep connect running; use a second terminal for other commands. Ctrl+C disconnects.
The same data folder must be used in both terminals. API tokens and history stay
outside npm's cache. npm/npx downloads and caches code; it still requires Node 22+.
Docs: https://agent-mesh-directory.agent-mesh.workers.dev/guide.md
`;
const incoming=process.argv.slice(2);
if(incoming.includes('--version')||incoming.includes('-v')){console.log(version);}
else if(!incoming.length||incoming.includes('--help')||incoming.includes('-h')||incoming[0]==='help'){console.log(help);}
else{
  try{
    const commands=new Set(['connect','topics','send','drop','group','group-send','history','status','info','init','use-directory','serve']);
    const values=new Set(['topics','data','directory','api-port','stun','to','topic','text','endpoint','port','action','group','member','name']);
    const args=[],found=new Map();let command;
    for(let i=0;i<incoming.length;i++){
      const arg=incoming[i];
      if(!arg.startsWith('--')){if(command)throw Error('Unexpected argument: '+arg);if(!commands.has(arg))throw Error('Unknown command: '+arg);command=arg;continue;}
      const split=arg.indexOf('='),name=arg.slice(2,split<0?undefined:split);
      if(found.has(name))throw Error('Option repeated: --'+name);
      if(name==='starter'){if(split>=0)throw Error('--starter takes no value');found.set(name,true);args.push(arg);continue;}
      if(!values.has(name))throw Error('Unknown option: --'+name);
      const value=split<0?incoming[++i]:arg.slice(split+1);
      if(value===undefined||value===''||(name!=='text'&&value.startsWith('--')))throw Error('A value is required for --'+name);
      found.set(name,value);args.push('--'+name,value);
    }
    if(!command)throw Error('Choose a command, such as connect.');
    for(const key of ['api-port','port'])if(found.has(key)&&(!/^\d+$/.test(found.get(key))||Number(found.get(key))<1||Number(found.get(key))>65535))throw Error('--'+key+' must be between 1 and 65535');
    if(found.has('topics')){const names=found.get('topics').split(',');if(names.length>10||names.some(s=>!s.trim()||s.length>120))throw Error('--topics needs 1–10 names, each up to 120 characters');}
    if(command==='group-send'&&['group','text'].some(key=>!found.has(key)))throw Error('group-send requires --group and --text');
    if(['send','drop'].includes(command)&&['to','topic','text'].some(key=>!found.has(key)))throw Error(command+' requires --to, --topic and --text');
    const base=process.platform==='win32'?join(process.env.LOCALAPPDATA||join(homedir(),'AppData','Local'),'AgentMesh'):process.platform==='darwin'?join(homedir(),'Library','Application Support','AgentMesh'):join(process.env.XDG_DATA_HOME||join(homedir(),'.local','share'),'agent-mesh');
    if(!found.has('data'))args.push('--data',resolve(process.env.AGENT_MESH_DATA_DIR||base));
    process.argv=[process.argv[0],process.argv[1],command,...args];
    await import('../lib/agent.mjs');
  }catch(e){console.error('Agent Mesh: '+e.message+'\nRun agent-mesh --help for usage.');process.exitCode=1;}
}
