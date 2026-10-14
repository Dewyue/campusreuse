import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {resolve,extname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
const data=mkdtempSync(join(tmpdir(),'campus-ui-test-'));mkdirSync('test-results',{recursive:true});
const api=spawn(process.execPath,['backend/server.js'],{env:{...process.env,DATA_DIR:data,PORT:'3198'},stdio:['ignore','pipe','pipe']});
let browser,server;
try{
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('API startup timeout')),8000);api.stdout.on('data',d=>{if(String(d).includes('ready')){clearTimeout(t);resolve();}});api.on('error',reject);});
 const root=resolve('frontend/dist');
 server=createServer(async(req,res)=>{try{
  if(req.url.startsWith('/api/')){let body='';for await(const chunk of req)body+=chunk;const r=await fetch('http://127.0.0.1:3198'+req.url,{method:req.method,headers:{'Content-Type':'application/json','X-Demo-Session':req.headers['x-demo-session']||''},body:body||undefined});res.writeHead(r.status,{'Content-Type':'application/json'});return res.end(await r.text());}
  const pathname=new URL(req.url,'http://localhost').pathname;const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+'/')){res.writeHead(403);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.jpg':'image/jpeg'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));
 }catch{res.writeHead(500);res.end();}});
 await new Promise(resolve=>server.listen(5181,'127.0.0.1',resolve));browser=await chromium.launch();
 const sellerContext=await browser.newContext({viewport:{width:390,height:844}}),buyerContext=await browser.newContext({viewport:{width:390,height:844}});
 const s=await sellerContext.newPage(),b=await buyerContext.newPage(),errors=[];for(const p of[s,b])p.on('pageerror',e=>errors.push(e.message));
 await s.goto('http://127.0.0.1:5181');await s.getByRole('button',{name:'卖闲置',exact:true}).click();
 await s.getByLabel('实物照片',{exact:true}).setInputFiles('frontend/public/images/headphones_studio.jpg');
 await s.getByLabel('宝贝名称').fill('双会话测试耳机');await s.getByLabel('物品说明',{exact:true}).fill('有线耳机，附件齐全');await s.getByLabel('价格（元）').fill('35');
 for(const [label,value] of [['分类','数码'],['品相','轻微使用痕迹'],['功能情况','功能正常'],['物品所在校区','新校区']])await s.getByLabel(label,{exact:true}).selectOption(value);
 await s.getByLabel('已知瑕疵',{exact:true}).fill('外壳轻微划痕');await s.getByLabel('建议面交地点',{exact:true}).fill('图书馆门外公共区域');await s.getByLabel('可面交时段',{exact:true}).fill('明天下午');await s.locator('input[name=disclosureConfirmed]').check();await s.getByRole('button',{name:'发布闲置',exact:true}).click();await s.getByRole('heading',{name:'双会话测试耳机'}).waitFor();
 await s.locator('.image-button').click();assert.ok(await s.getByRole('button',{name:'这是你发布的物品'}).isDisabled());await s.getByLabel('关闭',{exact:true}).click();
 await b.goto('http://127.0.0.1:5181');await b.getByLabel('搜索校园闲置').fill('双会话测试耳机');await b.getByRole('button',{name:'搜索',exact:true}).click();await b.locator('.image-button').click();await b.getByRole('button',{name:'我想要 · 约定面交'}).click();
 const dt=new Date(Date.now()+3600000);await b.getByLabel('建议面交时间',{exact:true}).fill(new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,16));await b.locator('input[name=safetyConfirmed]').check();await b.getByRole('button',{name:'提交面交请求'}).click();await b.getByText('待卖家确认',{exact:true}).waitFor();
 await s.getByRole('button',{name:'面交',exact:true}).click();await s.getByRole('button',{name:'我发布的',exact:true}).click();await s.getByRole('button',{name:'接受面交'}).click();await s.getByText('待当面交接',{exact:true}).waitFor();
 await s.screenshot({path:'test-results/seller-meeting.png'});
 const visitTrades=async p=>{await p.reload();await p.getByRole('button',{name:'面交',exact:true}).click();};
 await visitTrades(b);await b.getByText('待当面交接',{exact:true}).waitFor();await b.locator('.trade-record .consent input').check();await b.getByRole('button',{name:'确认实际交接'}).click();await b.getByText('你已确认交接，等待对方确认；此时尚不计入完成记录。',{exact:true}).waitFor();
 await s.locator('.trade-record .consent input').check();await s.getByRole('button',{name:'确认实际交接'}).click();await s.getByText('双方已确认交接',{exact:true}).waitFor();
 await visitTrades(b);await b.getByText('双方已确认交接',{exact:true}).waitFor();await b.locator('.evidence summary').click();await b.getByLabel('如果没有这次二手交易，你会',{exact:true}).selectOption('not_buy');await b.getByLabel('此次面交的主要出行方式',{exact:true}).selectOption('walk');await b.getByLabel('额外往返里程（km）',{exact:true}).fill('0.5');await b.getByLabel('预计继续使用（月）',{exact:true}).fill('12');await b.getByRole('button',{name:'保存再使用记录'}).click();await b.getByText('查看或修改再使用记录',{exact:true}).waitFor();
 await b.screenshot({path:'test-results/reuse-record.png'});assert.deepEqual(errors,[]);
 console.log('PASS: real API + two isolated browsers: photo listing, no self-reservation, seller acceptance, bilateral completion, reuse evidence');
}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));if(api.exitCode===null){const exit=once(api,'exit');api.kill();await exit;}rmSync(data,{recursive:true,force:true});}
