import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

test('register, login, account session, and publish under a real user',async()=>{
 const listing={title:'测试教材',description:'第七版含两册',price:12,category:'书籍',campus:'新校区',condition:'轻微使用痕迹',functionStatus:'功能正常',defects:'内页有划线',pickupPlace:'图书馆外公共区域',pickupWindow:'工作日下午',photo:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',disclosureConfirmed:true};
 const dir=mkdtempSync(join(tmpdir(),'campus-auth-test-'));
 let server;
 const start=async()=>{
  server=spawn(process.execPath,['backend/server.js'],{env:{...process.env,DATA_DIR:dir,PORT:'3195'},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('API startup timeout')),8000);server.stdout.on('data',d=>{if(String(d).includes('ready')){clearTimeout(timer);resolve();}});server.on('error',reject);server.on('exit',code=>{clearTimeout(timer);reject(Error('API exited '+code));});});
 };
 const stop=async()=>{if(server&&server.exitCode===null){const ended=once(server,'exit');server.kill();await ended;}};
 const request=async(path,method='GET',body,token)=>{
  const headers={'Content-Type':'application/json'};
  if(token)headers.Authorization='Bearer '+token;
  const r=await fetch('http://127.0.0.1:3195/api'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json(),cookie:r.headers.getSetCookie?.()||[]};
 };
 try{
  await start();
  assert.equal((await request('/health')).body.auth,true);
  assert.equal((await request('/register','POST',{username:'ab',password:'short'})).status,400);
  assert.equal((await request('/register','POST',{username:'bad name',password:'password1'})).status,400);
  const created=await request('/register','POST',{username:'南6阿栗',password:'password1'});
  assert.equal(created.status,201);
  assert.equal(created.body.user.username,'南6阿栗');
  assert.match(created.body.token,/^[a-f0-9]{64}$/);
  assert.equal((await request('/register','POST',{username:'南6阿栗',password:'password1'})).status,409);
  assert.equal((await request('/login','POST',{username:'南6阿栗',password:'wrongpass'})).status,401);
  const logged=await request('/login','POST',{username:'南6阿栗',password:'password1'});
  assert.equal(logged.status,200);assert.equal(logged.body.user.id,created.body.user.id);
  assert.equal((await request('/account')).status,401);
  assert.deepEqual((await request('/account','GET',undefined,logged.body.token)).body.username,'南6阿栗');
  const published=await request('/items','POST',listing,logged.body.token);
  assert.equal(published.status,201);
  assert.equal(published.body.seller,'我');
  assert.equal(published.body.isMine,true);
  const other=await request('/register','POST',{username:'zhouyan',password:'password1'});
  const seen=(await request('/items','GET',undefined,other.body.token)).body.find(i=>i.id===published.body.id);
  assert.equal(seen.seller,'南6阿栗');assert.equal(seen.isMine,false);
  assert.equal((await request('/logout','POST',{},logged.body.token)).status,200);
  assert.equal((await request('/account','GET',undefined,logged.body.token)).status,401);
  const demo=await request('/items','GET',undefined);
  assert.equal(demo.status,400);
  const demoOk=await fetch('http://127.0.0.1:3195/api/items',{headers:{'X-Demo-Session':'test-session-123456789'}});
  assert.equal(demoOk.status,200);
 }finally{await stop();rmSync(dir,{recursive:true,force:true});}
});
