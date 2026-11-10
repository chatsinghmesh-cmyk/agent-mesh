const assert=require('node:assert/strict');
const vscode=require('vscode');
exports.run=async function(){
 const extension=vscode.extensions.getExtension('agent-mesh-local.agent-mesh-tools');assert.ok(extension,'Extension was not discovered by VS Code');
 const api=await extension.activate();assert.equal(api.mcpProviderId,'agent-mesh');assert.equal(extension.isActive,true);
 assert.equal(typeof vscode.lm.registerMcpServerDefinitionProvider,'function');
 assert.equal(extension.packageJSON.contributes.mcpServerDefinitionProviders[0].id,'agent-mesh');
 const commands=await vscode.commands.getCommands(true);for(const name of ['configure','topics','send','history','disconnect','agentGuide'])assert.ok(commands.includes('agentMesh.'+name),'Missing command '+name);
 const path=require('node:path'),{pathToFileURL}=require('node:url');
 const {Client}=await import(pathToFileURL(path.join(extension.extensionPath,'node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js')).href);
 const {StdioClientTransport}=await import(pathToFileURL(path.join(extension.extensionPath,'node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js')).href);
 const transport=new StdioClientTransport({command:process.execPath,args:[path.join(extension.extensionPath,'dist/mcp/bridge.mjs')],env:{...process.env,ELECTRON_RUN_AS_NODE:'1',AGENT_MESH_DATA_DIR:path.join(extension.extensionPath,'../../work/vscode-runtime-check'),AGENT_MESH_AUTO_START:'false',AGENT_MESH_API_TOKEN:''},stderr:'pipe'});
 const client=new Client({name:'vscode-host-check',version:'1.0.0'});await client.connect(transport);try{assert.equal((await client.listTools()).tools.length,12);}finally{await client.close();}
 console.log('PASS: real VS Code extension host activated Agent Mesh, registered its native MCP provider, and exposed six commands.');
};
