import {test} from 'node:test';
import assert from 'node:assert/strict';
import {githubVerify} from '../github-verify.mjs';
import {handleGroups} from '../groups.mjs';

test('a device grant verifies only its requesting agent and configured team',async()=>{
 const id='a'.repeat(64),owner='b'.repeat(64),groupId='c'.repeat(32);
 const group={id:groupId,githubTeam:'acme/frontend',requests:[id],members:{[owner]:'owner'}};
 const entries=new Map();
 const storage={get:async k=>entries.get(k),put:async(k,v)=>entries.set(k,v),delete:async k=>entries.delete(k),transaction:fn=>fn(storage)};
 const fetcher=async url=>{
  if(url.endsWith('/device/code'))return Response.json({device_code:'private-code',user_code:'PUBLIC',expires_in:900,interval:5});
  if(url.endsWith('/oauth/access_token'))return Response.json({access_token:'private-token'});
  if(url.endsWith('/user'))return Response.json({id:123,login:'alice'});
  assert.equal(url,'https://api.github.com/orgs/acme/teams/frontend/memberships/alice');
  return Response.json({state:'active'});
 };
 const options={id,storage,clientId:'test',getGroup:()=>group,body:{groupId},fetcher};
 const [,start]=await githubVerify({...options,path:'/github/start',now:1000});
 assert.equal(start.code,'PUBLIC');
 assert.equal(start.device,undefined);
 assert.deepEqual(await githubVerify({...options,path:'/github/check',now:2000}),[200,{pending:true}]);
 const [status,result]=await githubVerify({...options,path:'/github/check',now:6000});
 assert.equal(status,200);
 assert.equal(result.verified.login,'alice');
 assert.equal(entries.size,0);
 const approve=now=>handleGroups({[groupId]:group},{authenticate:()=>true},'/groups/action',{id:owner,groupId,action:'approve',target:id},'test',now);
 assert.equal(approve(result.verified.checkedAt)[0],409);
 group.githubChecks={[id]:result.verified};
 assert.equal(approve(result.verified.checkedAt+900000)[0],409);
 assert.equal(approve(result.verified.checkedAt)[0],200);
});
