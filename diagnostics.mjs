const stages = new Set(['storage','connect','lock','identity','register','presence','directory','signaling','peer','delivery','drop','group_delivery']);
const outcomes = new Set(['ok','failed','unavailable','partial']);
const timings = new Set(['under_250ms','under_1s','under_5s','under_20s','20s_plus']);
const dayMs = 86400000;

export async function handleDiagnostics({path,body,storage,now=Date.now()}) {
  const day = Math.floor(now / dayMs);
  if (path === '/diagnostics/report') {
    const rows = await storage.list({prefix:'diagnostics:'});
    return [200,{days:[...rows.values()].filter(row=>row.day>day-30).sort((a,b)=>b.day-a.day).map(row=>({...row,date:new Date(row.day*dayMs).toISOString().slice(0,10)}))}];
  }
  if (path !== '/diagnostics/event') return [404,{error:'Unknown diagnostics route'}];
  if (!body || Object.keys(body).length!==3 || !stages.has(body.stage) || !outcomes.has(body.outcome) || !timings.has(body.timing)) return [400,{error:'Invalid diagnostic event'}];
  const key='diagnostics:'+day%30;
  return storage.transaction(async tx=>{
    const previous=await tx.get(key);
    const row=previous?.day===day?previous:{day,total:0,counts:{}};
    if(row.total>=100000)return [429,{error:'Daily diagnostic limit reached'}];
    const bucket=[body.stage,body.outcome,body.timing].join('/');
    row.counts[bucket]=(row.counts[bucket]||0)+1;
    row.total++;
    await tx.put(key,row);
    return [200,{ok:true}];
  });
}
