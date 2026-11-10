import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('published guide mirrors match their editable sources',()=>{
 for(const [source,publicPath]of [['./README.md','./public/guide.md'],['./developer/README.md','./public/developer-guide.md'],['./docs/TROUBLESHOOTING.md','./public/troubleshooting.md'],['./docs/FEATURES.md','./public/feature-map.md']])assert.equal(read(source),read(publicPath),publicPath);
});
test('release metadata checksums and all primary launch instructions identify the same packed version',()=>{
 const release=JSON.parse(read('./public/client-release.json')),pkg=JSON.parse(read('./cli/package.json'));
 assert.equal(release.version,pkg.version);assert.equal(release.registryPublished,false);
 const tar=readFileSync(new URL(`./public/downloads/agent-mesh-cli-${pkg.version}.tgz`,import.meta.url));
 assert.equal(release.sha256,createHash('sha256').update(tar).digest('hex'));
 assert.equal(release.integrity,'sha512-'+createHash('sha512').update(tar).digest('base64'));
 for(const file of ['./README.md','./public/index.html','./public/llms.txt','./developer/README.md'])assert.ok(read(file).includes(release.packageUrl),file);
 assert.equal(read('./cli/README.md'),read('./README.md'));
});
