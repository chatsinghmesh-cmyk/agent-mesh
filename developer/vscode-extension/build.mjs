import {mkdir,copyFile} from 'node:fs/promises';
const dir=new URL('./dist/',import.meta.url);await mkdir(dir,{recursive:true});
await copyFile(new URL('./src/extension.cjs',import.meta.url),new URL('extension.cjs',dir));
await copyFile(new URL('../sdk/index.cjs',import.meta.url),new URL('sdk.cjs',dir));
console.log('Built extension and its isolated SDK copy. No platform files changed.');
