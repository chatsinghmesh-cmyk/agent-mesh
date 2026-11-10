const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {setupMcp}=require('../src/mcp-provider.cjs');
const {ManagedAgent,validateConnection,validateTopics}=require('../src/managed-agent.cjs');

function fixture(){
 const calls=[],listeners=[],settings={},secrets=new Map();
 class EventEmitter{constructor(){this.event=fn=>listeners.push(fn);}fire(){for(const fn of listeners)fn();}dispose(){}}
 class McpStdioServerDefinition{constructor(label,command,args,env,version){Object.assign(this,{label,command,args,env,version});}}
 const vscode={EventEmitter,McpStdioServerDefinition,lm:{registerMcpServerDefinitionProvider:(id,provider)=>{calls.push({id,provider});return {dispose(){}};}},workspace:{isTrusted:true,workspaceFolders:[{uri:{toString:()=>'/project'}}],getConfiguration:()=>({get:(key,fallback)=>settings[key]??fallback}),onDidChangeConfiguration:fn=>{settings.changed=fn;return {dispose(){}};},onDidChangeWorkspaceFolders:()=>({dispose(){}})},window:{showWarningMessage:()=>{throw Error('Unexpected unsupported-host warning');}}};
 const context={extensionPath:path.resolve('extension'),globalStorageUri:{fsPath:path.resolve('storage')},subscriptions:[],secrets:{get:async key=>secrets.get(key),onDidChange:()=>({dispose(){}})}};
 return {vscode,context,calls,settings,secrets};
}
test('activation registers native MCP and resolves bundled runtime without exposed credentials in discovery',async()=>{
 const f=fixture(),integration=setupMcp(f.vscode,f.context);
 assert.equal(f.calls[0].id,'agent-mesh');
 const definition=f.calls[0].provider.provideMcpServerDefinitions()[0];assert.equal(definition.command,process.execPath);assert.ok(definition.args[0].endsWith(path.join('dist','mcp','bridge.mjs')));assert.equal(definition.env.AGENT_MESH_API_TOKEN,undefined);
 const resolved=await integration.provider.resolveMcpServerDefinition(definition);assert.equal(resolved.env.AGENT_MESH_AUTO_START,'true');assert.equal(resolved.env.AGENT_MESH_API_TOKEN,null);assert.ok(path.isAbsolute(resolved.env.AGENT_MESH_DATA_DIR));assert.equal(resolved.env.ELECTRON_RUN_AS_NODE,'1');
 f.secrets.set('agentMesh.connection',JSON.stringify({baseUrl:'http://127.0.0.1:9011',token:'private-token'}));
 const external=await integration.provider.resolveMcpServerDefinition(definition);assert.equal(external.env.AGENT_MESH_API_TOKEN,'private-token');assert.doesNotMatch(JSON.stringify(integration.provider.provideMcpServerDefinitions()),/private-token/);
 f.vscode.workspace.isTrusted=false;assert.deepEqual(integration.provider.provideMcpServerDefinitions(),[]);assert.equal(await integration.provider.resolveMcpServerDefinition(definition),undefined);
});
test('workspace identities are stable and isolated; settings refresh definitions',()=>{
 const f=fixture(),integration=setupMcp(f.vscode,f.context);const first=integration.dataDirectory();assert.equal(integration.dataDirectory(),first);
 f.vscode.workspace.workspaceFolders=[{uri:{toString:()=>'/another'}}];assert.notEqual(integration.dataDirectory(),first);
 let changed=0;integration.provider.onDidChangeMcpServerDefinitions(()=>changed++);f.settings.changed({affectsConfiguration:k=>k==='agentMesh'});assert.equal(changed,1);
 f.settings.dataDirectory='relative/path';assert.throws(()=>integration.dataDirectory(),/absolute/);
});
test('runtime rejects unsafe credentials/topics and honors disabled automatic startup',async()=>{
 assert.throws(()=>validateConnection({baseUrl:'https://example.com',token:'secret'}),/loopback/);
 for(const topics of [[],['bad,topic'],['group:abc'],Array(11).fill('a')])assert.throws(()=>validateTopics(topics));
 const runtime=new ManagedAgent({dataDir:path.resolve('nonexistent-disabled-runtime'),cliPath:'',autoStart:false});
 await assert.rejects(runtime.ensure(),/disabled/);await runtime.dispose();
});
test('a slow directory never spawns a duplicate of an owned active client',async()=>{
 const runtime=new ManagedAgent({dataDir:path.resolve('owned-runtime'),cliPath:'',autoStart:true});
 const connection={baseUrl:'http://127.0.0.1:9001',token:'test'};runtime.current=async()=>connection;
 runtime.child={pid:123,exitCode:null,signalCode:null};runtime.ownsLock=true;
 runtime.reachable=async()=>false;runtime.start=async()=>{throw Error('Duplicate process started');};
 assert.equal(await runtime.ensure(),connection);
 runtime.current=async()=>null;await assert.rejects(runtime.ensure(),/files are missing/);
});
