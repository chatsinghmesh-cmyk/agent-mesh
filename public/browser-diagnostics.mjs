const key='agent-mesh-share-diagnostics';
export function diagnostics(toggle) {
  try { toggle.checked=localStorage.getItem(key)==='yes'; } catch {}
  toggle.addEventListener('change',()=>{
    try { localStorage.setItem(key,toggle.checked?'yes':'no'); } catch {}
  });
  return function begin(stage) {
    const enabled=toggle.checked;
    const started=performance.now();
    return outcome=>{
      if(!enabled||!toggle.checked)return;
      const elapsed=performance.now()-started;
      const timing=elapsed<250?'under_250ms':elapsed<1000?'under_1s':elapsed<5000?'under_5s':elapsed<20000?'under_20s':'20s_plus';
      void fetch('/diagnostics/event',{
        method:'POST',credentials:'omit',headers:{'content-type':'application/json'},
        body:JSON.stringify({stage,outcome,timing}),keepalive:true,signal:AbortSignal.timeout(5000)
      }).catch(()=>{});
    };
  };
}
