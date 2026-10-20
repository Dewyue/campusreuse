import {chromium} from 'playwright';
import {spawn,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync,readFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';

const dir=mkdtempSync(join(tmpdir(),'campus-chat-ui-'));
const processes:ChildProcess[]=[];
const start=async(args:string[],env:NodeJS.ProcessEnv,ready:string)=>{
  const child=spawn(process.execPath,args,{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});processes.push(child);
  let log='';
  await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error(log||'Startup timeout')),15000);
    child.stdout!.on('data',d=>{log+=String(d);if(log.includes(ready)){clearTimeout(timer);resolve();}});
    child.stderr!.on('data',d=>{log+=String(d);});
    child.on('error',reject);child.on('exit',()=>{clearTimeout(timer);reject(Error(log));});
  });
};
const browser=await chromium.launch();
try{
  await start(['--experimental-strip-types','backend/server.js'],{DATA_DIR:dir,PORT:'3195'},'ready');
  await start(['node_modules/vite/bin/vite.js','frontend','--host','127.0.0.1','--port','5183','--strictPort'],{CAMPUS_API_TARGET:'http://127.0.0.1:3195'},'Local:');
  const post=async<T>(path:string,body:unknown,token='')=>{
    const r=await fetch('http://127.0.0.1:3195/api'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
    assert.ok(r.ok,await r.clone().text());return await r.json() as T;
  };
  const seller=await post<{token:string}>('/register',{username:'sellerUI',password:'test-only-password',privacyAccepted:true});
  const buyer=await post<{token:string}>('/register',{username:'buyerUI',password:'test-only-password',privacyAccepted:true});
  await post('/items',{title:'双人聊天测试教材',description:'第七版两册',price:20,category:'书籍',campus:'新校区',condition:'轻微使用痕迹',functionStatus:'功能正常',defects:'少量划线',pickupPlace:'图书馆',pickupWindow:'下午',photo:'data:image/jpeg;base64,'+readFileSync('frontend/public/images/books.jpg').toString('base64'),disclosureConfirmed:true},seller.token);
  const a=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const b=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await a.addInitScript(token=>localStorage.setItem('campus-token',token),buyer.token);
  await b.addInitScript(token=>localStorage.setItem('campus-token',token),seller.token);
  const buyerPage=await a.newPage(),sellerPage=await b.newPage();
  const errors:string[]=[];
  for(const page of [buyerPage,sellerPage])page.on('pageerror',e=>errors.push(e.message));
  await buyerPage.goto('http://127.0.0.1:5183');
  await sellerPage.goto('http://127.0.0.1:5183');
  await buyerPage.getByRole('button',{name:'查看双人聊天测试教材',exact:true}).click();
  await buyerPage.getByRole('button',{name:'联系卖家',exact:true}).click();
  await buyerPage.getByLabel('消息内容').fill('你好，在哪里面交？');
  await buyerPage.getByRole('button',{name:'发送消息',exact:true}).click();
  await buyerPage.getByRole('log').getByText('你好，在哪里面交？',{exact:true}).waitFor();
  await sellerPage.getByRole('button',{name:'面交',exact:true}).click();
  await sellerPage.locator('.chat-inbox-row').first().waitFor();
  assert.equal(await sellerPage.locator('.chat-inbox-row em').innerText(),'1');
  await sellerPage.locator('.chat-inbox-row').first().click();
  await sellerPage.getByRole('log').getByText('你好，在哪里面交？',{exact:true}).waitFor();
  await sellerPage.getByRole('button',{name:'建议地点',exact:true}).click();
  await sellerPage.getByLabel('公共面交地点').fill('新校区图书馆正门');
  await sellerPage.getByRole('button',{name:'发送地点',exact:true}).click();
  await buyerPage.getByRole('log').getByText('新校区图书馆正门',{exact:true}).waitFor();
  mkdirSync('test-results',{recursive:true});
  for(const [width,height] of [[320,568],[390,844],[1440,1000]]){
    await buyerPage.setViewportSize({width,height});
    assert.ok(await buyerPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await buyerPage.screenshot({path:'test-results/chat-'+width+'.png'});
  }
  await buyerPage.setViewportSize({width:390,height:844});
  await buyerPage.getByRole('button',{name:'用此地点约面交',exact:true}).click();
  assert.equal(await buyerPage.getByLabel('建议面交地点',{exact:true}).inputValue(),'新校区图书馆正门');
  const dt=new Date(Date.now()+3600000);
  await buyerPage.getByLabel('建议面交时间',{exact:true}).fill(new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,16));
  await buyerPage.locator('input[name=safetyConfirmed]').check();
  await buyerPage.getByRole('button',{name:'提交面交请求',exact:true}).click();
  await buyerPage.getByText('待卖家确认',{exact:true}).waitFor();
  await sellerPage.getByRole('button',{name:'关闭',exact:true}).click();
  await sellerPage.getByRole('button',{name:'我发布的',exact:true}).click();
  await sellerPage.getByRole('button',{name:'接受面交',exact:true}).waitFor({timeout:20000});
  await sellerPage.getByRole('button',{name:'接受面交',exact:true}).click();
  await sellerPage.getByText('待当面交接',{exact:true}).waitFor();
  await buyerPage.reload();
  await buyerPage.getByRole('button',{name:'面交',exact:true}).click();
  await buyerPage.locator('.chat-inbox-row').first().click();
  await buyerPage.getByRole('log').getByText('新校区图书馆正门',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: two account browsers, unread, text, place, meeting request/accept, responsive layout and reload');
}finally{
  await browser.close();
  for(const child of processes.reverse())if(child.exitCode===null){const done=once(child,'exit');child.kill();await done;}
  rmSync(dir,{recursive:true,force:true});
}
