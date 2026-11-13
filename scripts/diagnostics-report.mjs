import {readFile} from 'node:fs/promises';

const file = process.argv[2];
if (!file) throw Error('Usage: node scripts/diagnostics-report.mjs /path/to/official/identity.json');
const {id,recoveryToken}=JSON.parse(await readFile(file,'utf8'));
if (!id || !recoveryToken) throw Error('Use the official peer identity file');
const response=await fetch('https://agent-mesh-directory.agent-mesh.workers.dev/diagnostics/report',{
  method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+recoveryToken},
  body:JSON.stringify({id}),signal:AbortSignal.timeout(10000)
});
if (!response.ok) throw Error('Report request failed with HTTP '+response.status);
const {days}=await response.json();
const stages=new Map();
for(const day of days)for(const [bucket,count] of Object.entries(day.counts)){
  const [stage,outcome,timing]=bucket.split('/');
  const row=stages.get(stage)||{stage,attempts:0,failed:0,unavailable:0,partial:0,atLeast5s:0};
  row.attempts+=count;
  if(outcome!=='ok')row[outcome]+=count;
  if(timing==='under_20s'||timing==='20s_plus')row.atLeast5s+=count;
  stages.set(stage,row);
}
console.table([...stages.values()].sort((a,b)=>b.failed+b.unavailable-a.failed-a.unavailable));
if(!stages.size)console.log('No opted-in browser events in the last 30 UTC days.');
