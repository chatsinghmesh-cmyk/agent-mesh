'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function validateTopics(topics){
  if(!Array.isArray(topics)||!topics.length||topics.length>10||topics.some(t=>typeof t!=='string'||!t.trim()||t.length>120||t.includes(',')||t.startsWith('group:')))throw Error('Use 1–10 exact topic names, each up to 120 characters, without commas or the group: prefix.');
  return [...new Set(topics)];
}
function validateConnection(connection){
  const u=new URL(connection.baseUrl);
  if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password||u.pathname!=='/'||u.search||u.hash||typeof connection.token!=='string'||!connection.token)throw Error('Use a loopback HTTP origin and local apiToken.');
  return {baseUrl:u.origin,token:connection.token};
}
async function freePort(){const server=net.createServer();await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});const port=server.address().port;await new Promise(r=>server.close(r));return port;}
class ManagedAgent {
  constructor({dataDir,cliPath,nodePath=process.execPath,topics=['introductions'],directory,stun,autoStart=true,external,fetcher=globalThis.fetch}){
    if(!path.isAbsolute(dataDir))throw Error('Agent data path must be absolute.');
    this.dataDir=dataDir;this.cliPath=cliPath;this.nodePath=nodePath;this.topics=validateTopics(topics);this.directory=directory;this.stun=stun;this.autoStart=autoStart;this.external=external?validateConnection(external):null;this.fetch=fetcher;
    this.lock=path.join(dataDir,'.vscode-owner');this.child=null;this.ownsLock=false;this.queue=Promise.resolve();this.closed=false;
  }
  serial(fn){const next=this.queue.then(()=>{if(this.closed)throw Error('Agent Mesh connection is closed.');return fn();});this.queue=next.catch(()=>{});return next;}
  async current(){
    if(this.external)return this.external;
    try{
      const identity=JSON.parse(await fs.readFile(path.join(this.dataDir,'identity.json'),'utf8')),runtime=JSON.parse(await fs.readFile(path.join(this.dataDir,'runtime.json'),'utf8'));
      if(!Number.isInteger(runtime.apiPort)||runtime.apiPort<1||runtime.apiPort>65535)return null;
      return {...validateConnection({baseUrl:'http://127.0.0.1:'+runtime.apiPort,token:identity.apiToken}),id:identity.id};
    }catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError)return null;throw e;}
  }
  async reachable(connection){
    if(!connection)return false;
    try{const r=await this.fetch(connection.baseUrl+'/topics',{headers:{authorization:'Bearer '+connection.token},redirect:'error',signal:AbortSignal.timeout(2000)});const reachable=[200,400].includes(r.status);await r.body?.cancel();return reachable;}catch{return false;}
  }
  async releaseLock(){
    if(!this.ownsLock)return;
    try{const owner=JSON.parse(await fs.readFile(path.join(this.lock,'owner.json'),'utf8'));if(owner.pid===process.pid){await fs.unlink(path.join(this.lock,'owner.json'));await fs.rmdir(this.lock);}}catch(e){if(e.code!=='ENOENT')throw e;}
    this.ownsLock=false;
  }
  async claim(){
    await fs.mkdir(this.dataDir,{recursive:true,mode:0o700});
    const deadline=Date.now()+20000;
    while(Date.now()<deadline){
      try{await fs.mkdir(this.lock,{mode:0o700});await fs.writeFile(path.join(this.lock,'owner.json'),JSON.stringify({pid:process.pid}),{mode:0o600});this.ownsLock=true;return null;}
      catch(e){if(e.code!=='EEXIST')throw e;}
      const current=await this.current();if(await this.reachable(current))return current;
      try{
        const owner=JSON.parse(await fs.readFile(path.join(this.lock,'owner.json'),'utf8'));
        let alive=true;try{process.kill(owner.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
        if(!alive){await fs.unlink(path.join(this.lock,'owner.json'));await fs.rmdir(this.lock);continue;}
      }catch(e){if(e.code==='ENOENT'){const stat=await fs.stat(this.lock).catch(()=>null);if(stat&&Date.now()-stat.mtimeMs>10000)await fs.rmdir(this.lock).catch(()=>{});}else throw e;}
      await sleep(150);
    }
    throw Error('This identity is starting in another VS Code window. Retry shortly, or choose a separate Agent Mesh data directory.');
  }
  async loadTopics(){try{this.topics=validateTopics(JSON.parse(await fs.readFile(path.join(this.dataDir,'vscode-topics.json'),'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}}
  async start(){
    const port=await freePort();
    const args=[this.cliPath,'connect','--data',this.dataDir,'--topics',this.topics.join(','),'--api-port',String(port)];
    if(this.directory)args.push('--directory',this.directory);
    if(this.stun)args.push('--stun',this.stun);
    await fs.writeFile(path.join(this.dataDir,'vscode-topics.json'),JSON.stringify(this.topics),{mode:0o600});
    let failed=false;
    this.child=spawn(this.nodePath,args,{shell:false,windowsHide:true,stdio:'ignore',env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});
    this.child.on('error',()=>{failed=true;});
    const deadline=Date.now()+25000;
    while(Date.now()<deadline){
      if(failed||this.child.exitCode!==null)break;
      const current=await this.current();if(current&&new URL(current.baseUrl).port===String(port)&&await this.reachable(current))return current;
      await sleep(150);
    }
    await this.stopChild();
    throw Error('Could not start the bundled Agent Mesh client. Check internet access, Node.js 22+, and the data-directory setting.');
  }
  async ensureInternal(){
    const current=await this.current();
    // A slow hosted directory must never cause a second process for our identity.
    if(!this.external&&this.child?.pid&&this.child.exitCode===null&&this.child.signalCode===null){if(!current)throw Error('Managed identity files are missing while its client is running. Restore the data or restart this MCP server.');return current;}
    if(await this.reachable(current)){if(!this.external&&!this.ownsLock)await this.loadTopics();return current;}
    if(this.external)throw Error('Configured local agent is unavailable. Start it or reset the connection to use the bundled client.');
    if(!this.autoStart)throw Error('Automatic agent startup is disabled. Enable agentMesh.autoStart or configure an existing local agent.');
    if(!this.ownsLock){const shared=await this.claim();if(shared)return shared;await this.loadTopics();}
    try{return await this.start();}catch(e){await this.releaseLock();throw e;}
  }
  ensure(){return this.serial(()=>this.ensureInternal());}
  async forward(route,options={}){
    return this.serial(async()=>{
      const connection=await this.ensureInternal();
      const response=await this.fetch(connection.baseUrl+route,{...options,headers:{...options.headers,authorization:'Bearer '+connection.token},redirect:'error'});
      return new Response(await response.arrayBuffer(),{status:response.status,headers:{'content-type':'application/json'}});
    });
  }
  connectTopics(topics,replace=false){
    topics=validateTopics(topics);
    return this.serial(async()=>{
      await this.ensureInternal();
      if(this.external||!this.ownsLock)throw Error('This agent is managed outside this MCP session. Join topics in its owning terminal/window, or reset the extension connection for a separate managed identity.');
      const next=validateTopics(replace?topics:[...new Set([...this.topics,...topics])]);
      if(JSON.stringify(next)!==JSON.stringify(this.topics)){
        await this.stopChild();this.topics=next;
        await fs.writeFile(path.join(this.dataDir,'vscode-topics.json'),JSON.stringify(next),{mode:0o600});
        await this.start();
      }
      return this.statusInternal();
    });
  }
  async statusInternal(){const current=await this.current();if(!this.external&&!this.ownsLock)await this.loadTopics();return {connected:await this.reachable(current),managed:!this.external,canChangeTopics:!this.external&&this.ownsLock,id:current?.id,topics:this.external?undefined:this.topics};}
  status(){return this.serial(()=>this.statusInternal());}
  async stopChild(){
    const child=this.child;this.child=null;if(!child||child.exitCode!==null||!child.pid)return;
    const ended=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');
    await Promise.race([ended,sleep(2500)]);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  }
  async dispose(){await this.queue;this.closed=true;await this.stopChild();await this.releaseLock();}
}
module.exports={ManagedAgent,validateTopics,validateConnection};
