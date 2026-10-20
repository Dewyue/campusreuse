import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

test('privacy: disk photos, export, report, block, retention hooks',async()=>{
 const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 const listing={title:'合规教材',description:'两册教材',price:8,category:'书籍',campus:'新校区',condition:'轻微使用痕迹',functionStatus:'功能正常',defects:'少量划线',pickupPlace:'图书馆',pickupWindow:'下午',photo,disclosureConfirmed:true};
 const dir=mkdtempSync(join(tmpdir(),'campus-privacy-'));
 let server;
 const start=async()=>{
  server=spawn(process.execPath,['--experimental-strip-types','backend/server.js'],{env:{...process.env,DATA_DIR:dir,PORT:'3198',CHAT_RETENTION_DAYS:'90'},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),8000);server.stdout.on('data',d=>{if(String(d).includes('ready')){clearTimeout(timer);resolve();}});server.on('exit',code=>{clearTimeout(timer);reject(Error('exit '+code));});});
 };
 const stop=async()=>{if(server?.exitCode===null){const ended=once(server,'exit');server.kill();await ended;}};
 const request=async(path,method='GET',body,token)=>{
  const headers={'Content-Type':'application/json'};
  if(token)headers.Authorization='Bearer '+token;
  else headers['X-Demo-Session']='privacy-demo-session-1';
  const r=await fetch('http://127.0.0.1:3198/api'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text();
  let parsed;try{parsed=JSON.parse(text);}catch{parsed=text;}
  return {status:r.status,body:parsed,headers:r.headers};
 };
 try{
  await start();
  const health=(await request('/health')).body;
  assert.equal(health.retention.chatDays,90);
  const seller=(await request('/register','POST',{username:'privSeller',password:'password1',privacyAccepted:true},null)).body.token;
  const buyer=(await request('/register','POST',{username:'privBuyer',password:'password1',privacyAccepted:true},null)).body.token;
  const item=(await request('/items','POST',listing,seller)).body;
  assert.match(item.photo,/^\/api\/media\/[a-f0-9]+\.png$/);
  assert.ok(!JSON.stringify(item).includes('base64'));
  const media=await fetch('http://127.0.0.1:3198'+item.photo);
  assert.equal(media.status,200);
  assert.equal(readdirSync(join(dir,'photos')).length,1);
  const exported=await request('/account/export','GET',undefined,seller);
  assert.equal(exported.status,200);
  assert.equal(exported.body.published[0].hasPhoto,true);
  assert.ok(!('photo' in exported.body.published[0])||!String(exported.body.published[0].photo||'').startsWith('data:'));
  assert.match(exported.headers.get('content-disposition')||'',/campusreuse-export\.json/);
  assert.equal((await request('/reports','POST',{targetType:'item',targetId:item.id,reason:'疑似违禁物品描述'},buyer)).status,201);
  assert.equal((await request('/reports','POST',{targetType:'item',targetId:item.id,reason:'短'},buyer)).status,400);
  const sellerId=(await request('/account','GET',undefined,seller)).body.id;
  assert.equal((await request('/blocks/'+sellerId,'PUT',{blocked:true},buyer)).status,200);
  assert.equal((await request('/conversations','POST',{itemId:item.id},buyer)).status,403);
  assert.equal((await request('/blocks/'+sellerId,'PUT',{blocked:false},buyer)).status,200);
  const thread=(await request('/conversations','POST',{itemId:item.id},buyer)).body;
  assert.equal(thread.peerId,sellerId);
  assert.equal((await request('/items/'+item.id,'DELETE',undefined,seller)).status,200);
  assert.equal(readdirSync(join(dir,'photos')).length,0);
 }finally{await stop();rmSync(dir,{recursive:true,force:true});}
});
