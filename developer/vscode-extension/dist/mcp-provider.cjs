'use strict';
const path=require('node:path');
const {createHash}=require('node:crypto');
const {ManagedAgent,validateTopics,validateConnection}=require('./managed-agent.cjs');
const PROVIDER_ID='agent-mesh';
const CONNECTION_KEY='agentMesh.connection';
function setupMcp(vscode,context){
  const changes=new vscode.EventEmitter();let revision=0;
  const config=()=>vscode.workspace.getConfiguration('agentMesh');
  const dataDirectory=()=>{
    const chosen=config().get('dataDirectory','');if(chosen){if(!path.isAbsolute(chosen))throw Error('Agent Mesh dataDirectory must be an absolute path.');return chosen;}
    const folders=(vscode.workspace.workspaceFolders||[]).map(f=>f.uri.toString()).sort().join('\n')||'empty-window';
    return path.join(context.globalStorageUri.fsPath,'agents',createHash('sha256').update(folders).digest('hex').slice(0,16));
  };
  const definitions=()=>{
    if(!vscode.workspace.isTrusted)return [];
    return [new vscode.McpStdioServerDefinition('Agent Mesh',process.execPath,[path.join(context.extensionPath,'dist/mcp/bridge.mjs')],{ELECTRON_RUN_AS_NODE:'1'},'0.3.0-'+revision)];
  };
  const provider={onDidChangeMcpServerDefinitions:changes.event,provideMcpServerDefinitions:definitions,resolveMcpServerDefinition:async definition=>{
    if(!vscode.workspace.isTrusted)return undefined;
    const topics=validateTopics(config().get('topics',['introductions']));
    const env={ELECTRON_RUN_AS_NODE:'1',AGENT_MESH_DATA_DIR:dataDirectory(),AGENT_MESH_TOPICS:topics.join(','),AGENT_MESH_AUTO_START:String(config().get('autoStart',true)),AGENT_MESH_API_TOKEN:null,AGENT_MESH_API_URL:null,AGENT_MESH_DIRECTORY:null,AGENT_MESH_STUN:null};
    const raw=await context.secrets.get(CONNECTION_KEY);
    if(raw){const saved=validateConnection(JSON.parse(raw));env.AGENT_MESH_API_URL=saved.baseUrl;env.AGENT_MESH_API_TOKEN=saved.token;}
    return new vscode.McpStdioServerDefinition(definition.label,process.execPath,[path.join(context.extensionPath,'dist/mcp/bridge.mjs')],env,definition.version);
  }};
  const changed=()=>{revision++;changes.fire();};
  context.subscriptions.push(changes);
  if(vscode.lm?.registerMcpServerDefinitionProvider&&vscode.McpStdioServerDefinition)context.subscriptions.push(vscode.lm.registerMcpServerDefinitionProvider(PROVIDER_ID,provider));
  else vscode.window.showWarningMessage('Agent Mesh automatic agent tools require VS Code 1.102+ with native MCP support. Other AI extensions may require separate MCP configuration.');
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e=>{if(e.affectsConfiguration('agentMesh'))changed();}));
  if(vscode.workspace.onDidChangeWorkspaceFolders)context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(changed));
  if(context.secrets.onDidChange)context.subscriptions.push(context.secrets.onDidChange(e=>{if(e.key===CONNECTION_KEY)changed();}));
  const localConnection=async()=>{
    const raw=await context.secrets.get(CONNECTION_KEY);if(raw)return validateConnection(JSON.parse(raw));
    const runtime=new ManagedAgent({dataDir:dataDirectory(),cliPath:'',autoStart:false});
    const current=await runtime.current();if(!current||!await runtime.reachable(current))throw Error('Ask your VS Code agent to use an Agent Mesh tool first, or run Configure Local Connection for an existing agent.');
    return current;
  };
  return {provider,changed,dataDirectory,localConnection};
}
module.exports={setupMcp,PROVIDER_ID,CONNECTION_KEY};
