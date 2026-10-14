import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('dist');
mkdirSync('test-results',{recursive:true});
const server=createServer((req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+'/')){res.writeHead(403);return res.end();}const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.jpg':'image/jpeg'};res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(5180,'127.0.0.1',resolve));
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[],apiRequests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api'))apiRequests.push(r.url());});
 await page.goto('http://127.0.0.1:5180');await page.locator('.product').first().waitFor();assert.equal(await page.locator('.product').count(),8);
 for(const [width,height] of [[320,740],[390,844],[430,932],[1440,1000]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);
  await page.locator('.product img').first().evaluate(img=>img.decode());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);
  assert.ok(await page.locator('.product img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0)));
  const nav=await page.locator('.bottom-nav').boundingBox();assert.ok(nav.y>=height-100);
  const tabs=await page.locator('.feed-tabs').evaluate(el=>el.scrollWidth<=el.clientWidth);assert.ok(tabs);
  await page.screenshot({path:`test-results/apple-${width}.png`});
 }
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('.brand-subtitle,.end-note').count(),0);
 await page.getByRole('button',{name:'我的',exact:true}).click();
 await page.getByText('暂无收藏',{exact:true}).waitFor();
 assert.equal(await page.locator('.eco-note').count(),0);
 await page.screenshot({path:'test-results/profile-clean.png'});
 await page.getByRole('button',{name:'逛校园',exact:true}).click();
 assert.equal(await page.locator('.discover-intro').count(),0);
 assert.equal(await page.locator('.campus-list').count(),6);
 await page.getByRole('button',{name:'首页',exact:true}).click();
 await page.getByLabel('筛选商品',{exact:true}).click();
 await page.getByRole('dialog').waitFor();
 await page.keyboard.press('Shift+Tab');
 assert.ok(await page.evaluate(()=>Boolean(document.activeElement.closest('[role="dialog"]'))));
 await page.keyboard.press('Escape');
 await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.waitForFunction(()=>document.activeElement.getAttribute('aria-label')==='筛选商品',{},{timeout:2000});
 assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'筛选商品');
 await page.getByLabel('搜索校园闲置').fill('相机');await page.getByRole('button',{name:'搜索',exact:true}).click();assert.equal(await page.locator('.product').count(),1);
 await page.locator('.image-button').click();await page.getByRole('button',{name:'收藏',exact:true}).click();await page.getByRole('button',{name:'已收藏',exact:true}).waitFor();

 await page.getByRole('button',{name:'我想要 · 约定面交'}).click();
 await page.getByLabel('建议面交地点',{exact:true}).fill('图书馆外公共区域');
 const dt=new Date(Date.now()+3600000);const local=new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,16);
 await page.getByLabel('建议面交时间',{exact:true}).fill(local);
 await page.locator('input[name=safetyConfirmed]').check();
 await page.getByRole('button',{name:'提交面交请求',exact:true}).click();
 await page.getByText('待卖家确认',{exact:true}).waitFor();
 await page.screenshot({path:'test-results/meeting-pending.png'});
 await page.getByRole('button',{name:'取消本次请求'}).click();await page.getByText('已取消',{exact:true}).waitFor();

 await page.reload();await page.getByRole('button',{name:'我的',exact:true}).click();await page.locator('.product').waitFor();
 await page.getByRole('button',{name:'卖闲置',exact:true}).click();await page.getByLabel('宝贝名称').fill('本地预览发布测试');await page.getByLabel('价格（元）').fill('15');
 await page.getByLabel('实物照片',{exact:true}).setInputFiles('frontend/public/images/headphones_studio.jpg');
 await page.getByLabel('物品说明',{exact:true}).fill('第七版教材，两册齐全');
 await page.getByLabel('分类',{exact:true}).selectOption('书籍');
 await page.getByLabel('品相',{exact:true}).selectOption('轻微使用痕迹');
 await page.getByLabel('功能情况',{exact:true}).selectOption('功能正常');
 await page.getByLabel('已知瑕疵',{exact:true}).fill('有少量划线');
 await page.getByLabel('物品所在校区',{exact:true}).selectOption('新校区');
 await page.getByLabel('建议面交地点',{exact:true}).fill('图书馆外公共区域');
 await page.getByLabel('可面交时段',{exact:true}).fill('下午 3 点');
 await page.locator('input[name=disclosureConfirmed]').check();
await page.getByRole('button',{name:'发布闲置',exact:true}).click();await page.getByRole('heading',{name:'本地预览发布测试'}).waitFor();
 assert.deepEqual(apiRequests,[]);assert.deepEqual(errors,[]);console.log('PASS: published build works without backend; search, favorites, reservation, publish, reload persistence');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
