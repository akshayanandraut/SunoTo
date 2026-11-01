import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('built public SEO and private crawl boundaries',()=>{
  const html=read('dist/index.html'),xml=read('dist/sitemap.xml'),robots=read('dist/robots.txt');
  assert.match(html,/<link rel="canonical" href="https:\/\/sunoto.grasany.com\/"/);
  assert.match(html,/About SunoTo/);
  assert.match(html,/community-guidelines.html/);
  assert.equal((xml.match(/<loc>/g)||[]).length,1);
  assert.match(xml,/<loc>https:\/\/sunoto.grasany.com\/<\/loc>/);
  for(const path of ['/api/','/auth/','/admin.html'])assert.ok(robots.includes('Disallow: '+path));
  assert.ok(!xml.includes('/auth/')&&!xml.includes('/api/')&&!xml.includes('admin'));
  assert.match(read('worker/wrangler.toml'),/not_found_handling = "404-page"/);
});
