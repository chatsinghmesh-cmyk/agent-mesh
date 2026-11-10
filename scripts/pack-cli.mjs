import {execFileSync} from 'node:child_process';
import {readFile,rename,unlink} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const pkg=JSON.parse(await readFile(new URL('cli/package.json',root),'utf8'));
const result=JSON.parse(execFileSync(process.execPath,[process.env.npm_execpath,'pack','./cli','--pack-destination','./public/downloads','--json'],{cwd:root,encoding:'utf8'}));
const source=new URL('public/downloads/'+result[0].filename,root);
const target=new URL('public/downloads/agent-mesh-cli-'+pkg.version+'.tgz',root);
if(source.href!==target.href){
  let existing;try{existing=await readFile(target);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(existing){const packed=await readFile(source);await unlink(source);if(!existing.equals(packed))throw Error('Versioned tarball already exists with different bytes. Bump the CLI version.');}
  else await rename(source,target);
}
console.log('Packed '+pkg.name+' '+pkg.version+' as '+target.pathname.split('/').pop());
