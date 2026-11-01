import test from 'node:test';
import assert from 'node:assert/strict';
import {secureResponse} from '../worker/src/index.js';
test('private SEO header preserves success, redirect, denial and error semantics',async()=>{
  for(const status of [200,303,401,403,500,503]){
    const original=new Response('unchanged',{status,headers:{location:'/destination','set-cookie':'session=opaque; Secure; HttpOnly','x-custom':'preserved'}});
    const response=secureResponse(original,new Request('https://sunoto.grasany.com/auth/callback'),{ALLOWED_ORIGIN:'https://sunoto.grasany.com'});
    assert.equal(response.status,status);
    assert.equal(await response.text(),'unchanged');
    assert.equal(response.headers.get('location'),'/destination');
    assert.equal(response.headers.get('set-cookie'),'session=opaque; Secure; HttpOnly');
    assert.equal(response.headers.get('x-custom'),'preserved');
    assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
  }
});
const base=process.env.SUNOTO_LOCAL_HTTP;
test('actual local Worker SEO routing boundaries',{skip:!base},async()=>{
  for(const [path,status,type] of [['/',200,'text/html'],['/robots.txt',200,'text/plain'],['/sitemap.xml',200,'application/xml'],['/missing-seo-http',404,'application/json']]){
    const response=await fetch(base+path,{redirect:'manual'});
    assert.equal(response.status,status,path);
    assert.ok(response.headers.get('content-type')?.startsWith(type),path);
    assert.equal(response.headers.get('x-robots-tag'),null,path);
  }
  for(const path of ['/api/v1/auth/session','/api/v1/wallet','/auth/callback']){
    const response=await fetch(base+path,{redirect:'manual'});
    assert.equal(response.status,503,path);
    assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow',path);
    assert.equal(response.headers.get('cache-control'),'no-store',path);
    assert.equal((await response.json()).error,'identity_service_not_configured',path);
  }
  const health=await fetch(base+'/api/health');
  assert.equal(health.status,200);
  assert.equal(health.headers.get('x-robots-tag'),'noindex, nofollow');
});
