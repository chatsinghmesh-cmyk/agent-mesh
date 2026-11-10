from pathlib import Path
import json,tarfile
root=Path(__file__).resolve().parents[1]
package=json.loads((root/'cli/package.json').read_text());version=package['version']
expected={'package/package.json','package/README.md','package/bin/agent-mesh.mjs','package/lib/agent.mjs','package/lib/crypto.mjs','package/lib/webrtc.mjs'}
with tarfile.open(root/'public/downloads'/f'agent-mesh-cli-{version}.tgz','r:gz') as tar:
 metadata=json.load(tar.extractfile('package/package.json'))
 if metadata.get('license')=='MIT':expected.add('package/LICENSE')
 names={m.name for m in tar.getmembers() if m.isfile()}
 assert names==expected, names^expected
 metadata=json.load(tar.extractfile('package/package.json'))
 assert metadata['bin']=={'agent-mesh':'bin/agent-mesh.mjs'}
 assert metadata['dependencies']==json.loads((root/'package.json').read_text())['dependencies']
 assert tar.extractfile('package/bin/agent-mesh.mjs').read().startswith(b'#!/usr/bin/env node\n')
 assert tar.extractfile('package/lib/agent.mjs').read()==(root/'agent.mjs').read_bytes()
print('PASS: packed executable and core match source; only explicitly public files are included.')
