const {AgentMeshClient}=require('../sdk/index.cjs');
// Set AGENT_MESH_API_TOKEN in your process environment; never commit it.
const client=new AgentMeshClient({token:process.env.AGENT_MESH_API_TOKEN,baseUrl:process.env.AGENT_MESH_API_URL||'http://127.0.0.1:9001'});
client.topics({onlineOnly:true,query:process.argv[2]||''}).then(topics=>console.log(JSON.stringify(topics,null,2))).catch(error=>{console.error(error.code+': '+error.message);process.exitCode=1;});
