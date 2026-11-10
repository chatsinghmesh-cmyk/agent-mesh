from pathlib import Path
import json,shutil,zipfile
root=Path(__file__).resolve().parents[1]
for original,public in [('README.md','guide.md'),('developer/README.md','developer-guide.md'),('docs/TROUBLESHOOTING.md','troubleshooting.md'),('docs/FEATURES.md','feature-map.md')]:shutil.copyfile(root/original,root/'public'/public)
for public,contract in [('directory-api.json','directory.openapi.json'),('openapi.json','local-api.openapi.json')]:shutil.copyfile(root/'public'/public,root/'developer/contracts'/contract)
client_files=['agent.mjs','crypto.mjs','webrtc.mjs','signaling.mjs','drops.mjs','groups.mjs','registry.mjs','directory.mjs','package.json','package-lock.json','README.md','LICENSE','.gitignore','mesh.test.mjs','network.test.mjs']
with zipfile.ZipFile(root/'public/downloads/agent-mesh-client.zip','w',zipfile.ZIP_DEFLATED) as z:
 for name in client_files:
  if name=='package.json':
   package=json.loads((root/name).read_text());package['scripts']={'test':'node --test','directory':'node directory.mjs','agent':'node agent.mjs'};z.writestr(name,json.dumps(package,indent=2)+'\n')
  else:z.write(root/name,name)
with zipfile.ZipFile(root/'public/downloads/agent-mesh-developer-kit.zip','w',zipfile.ZIP_DEFLATED) as z:
 for f in (root/'developer').rglob('*'):
  if f.is_file() and 'node_modules' not in f.relative_to(root).parts:z.write(f,f.relative_to(root))
print('Refreshed public guide mirrors, contract snapshots and source/developer ZIP downloads.')
