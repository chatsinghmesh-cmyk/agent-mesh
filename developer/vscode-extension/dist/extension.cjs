const vscode=require('vscode');
const {AgentMeshClient}=require('./sdk.cjs');
function activate(context){
  const output=vscode.window.createOutputChannel('Agent Mesh');context.subscriptions.push(output);
  const connectionKey='agentMesh.connection';
  const connection=async()=>{const raw=await context.secrets.get(connectionKey);if(!raw)throw Error('Run “Agent Mesh: Configure Local Connection” first.');return new AgentMeshClient(JSON.parse(raw));};
  const register=(name,fn)=>context.subscriptions.push(vscode.commands.registerCommand('agentMesh.'+name,async()=>{try{await fn();}catch(e){vscode.window.showErrorMessage('Agent Mesh: '+e.message);}}));
  register('configure',async()=>{
    const baseUrl=await vscode.window.showInputBox({title:'Local Agent Mesh API URL',value:'http://127.0.0.1:9001',prompt:'Use the local API port, not the public directory or peer port.'});if(!baseUrl)return;
    const token=await vscode.window.showInputBox({title:'Local API token',password:true,ignoreFocusOut:true,prompt:'Paste apiToken from your local identity.json. Do not use recoveryToken.'});if(!token)return;
    const client=new AgentMeshClient({baseUrl,token});await client.peers();
    await context.secrets.store(connectionKey,JSON.stringify({baseUrl,token}));vscode.window.showInformationMessage('Agent Mesh local connection saved.');
  });
  register('topics',async()=>{
    const client=await connection();const query=await vscode.window.showInputBox({title:'Find topics',prompt:'Optional keyword; matching happens locally.'});if(query===undefined)return;
    const topics=await client.topics({onlineOnly:true,query});
    if(!topics.length){vscode.window.showInformationMessage('No matching topics with online agents.');return;}
    const selected=await vscode.window.showQuickPick(topics.map(t=>({label:t.topic,description:`${t.onlineCount} online`,topic:t})),{title:'Online Agent Mesh topics'});if(!selected)return;
    output.clear();output.appendLine(JSON.stringify(selected.topic,null,2));output.show(true);
  });
  register('send',async()=>{
    const client=await connection(),peers=await client.peers({onlineOnly:true});
    const peer=await vscode.window.showQuickPick(peers.map(p=>({label:p.id,description:p.topics.join(', '),peer:p})),{title:'Choose an online recipient'});if(!peer)return;
    const topic=await vscode.window.showQuickPick(peer.peer.topics,{title:'Choose a topic (your agent must also have joined it)'});if(!topic)return;
    const text=await vscode.window.showInputBox({title:'Message to '+peer.peer.id.slice(0,12),prompt:'Text is sent only to this peer. Maximum 16000 UTF-8 bytes.'});if(!text)return;
    const result=await client.send({to:peer.peer.id,topic,text});vscode.window.showInformationMessage('Delivered: '+result.id);
  });
  register('history',async()=>{const client=await connection(),history=await client.history();output.clear();output.appendLine(JSON.stringify(history.slice(-50),null,2));output.show(true);});
  register('disconnect',async()=>{await context.secrets.delete(connectionKey);output.clear();vscode.window.showInformationMessage('Saved API token removed. The agent process is still running.');});
}
module.exports={activate};
