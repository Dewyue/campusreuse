import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

test('independent API: search, validation, publish, favorites, reservations, persistence',async()=>{
 const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 const listing={title:'测试教材',description:'第七版含两册',price:12,category:'书籍',campus:'新校区',condition:'轻微使用痕迹',functionStatus:'功能正常',defects:'内页有划线',pickupPlace:'图书馆外公共区域',pickupWindow:'工作日下午',photo,disclosureConfirmed:true};
 const meeting={meetingAt:new Date(Date.now()+3600000).toISOString(),place:'图书馆外公共区域',safetyConfirmed:true};
 const buyer='buyer-session-1234567',other='other-session-1234567';
 const dir=mkdtempSync(join(tmpdir(),'campus-api-test-'));
 let server;
 const start=async()=>{
   server=spawn(process.execPath,['--experimental-strip-types','backend/server.js'],{env:{...process.env,DATA_DIR:dir,PORT:'3197'},stdio:['ignore','pipe','pipe']});
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('API startup timeout')),8000);server.stdout.on('data',d=>{if(String(d).includes('ready')){clearTimeout(timer);resolve();}});server.on('error',reject);server.on('exit',code=>{clearTimeout(timer);reject(Error('API exited '+code));});});
 };
 const stop=async()=>{if(server&&server.exitCode===null){const ended=once(server,'exit');server.kill();await ended;}};
 const request=async(path,method='GET',body,session='test-session-123456789')=>{const r=await fetch('http://127.0.0.1:3197/api'+path,{method,headers:{'Content-Type':'application/json','X-Demo-Session':session},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 try{
  await start();
  assert.equal((await request('/health')).body.ok,true);
  assert.equal((await request('/items','GET',undefined,'')).status,400);
  assert.equal((await request('/items')).body.length,8);
  assert.deepEqual((await request('/items')).body.map(i=>i.id),[8,7,6,5,4,3,2,1]);
  const priced=(await request('/items?sort=price')).body;
  assert.ok(priced.every((item,index)=>index===0||priced[index-1].price<=item.price));
  assert.equal((await request('/items?q='+encodeURIComponent('相机'))).body.length,1);
  assert.ok((await request('/items?free=true')).body.every(x=>x.price===0));
  assert.equal((await request('/items','POST',{title:'坏数据',price:-1})).status,400);
  const published=await request('/items','POST',listing);
  assert.equal(published.status,201);assert.ok(!('owner' in published.body));
  const id=published.body.id;
  assert.equal((await request('/items')).body[0].id,id);
  assert.equal((await request('/items?sort=recommend')).body[0].id,id);
  await request('/favorites/'+id,'PUT',{saved:true});await request('/favorites/'+id,'PUT',{saved:true});
  assert.deepEqual((await request('/me')).body.favorites,[id]);
  assert.deepEqual((await request('/me','GET',undefined,'other-session-123456')).body.favorites,[]);

  for(const patch of [{price:-1},{condition:''},{photo:'data:image/svg+xml;base64,QQ=='},{defects:''},{disclosureConfirmed:false}])assert.equal((await request('/items','POST',{...listing,...patch})).status,400);
  assert.equal((await request('/items?campus='+encodeURIComponent('新校区'))).body.length,1);
  assert.equal((await request('/reservations','POST',{...meeting,itemId:id})).status,400);
  assert.equal((await request('/reservations','POST',{itemId:id},buyer)).status,400);
  assert.equal((await request('/reservations','POST',{...meeting,itemId:id,meetingAt:'2000-01-01'},buyer)).status,400);
  const first=await request('/reservations','POST',{...meeting,itemId:id},buyer);assert.equal(first.status,201);assert.equal(first.body.status,'pending');const trade=first.body.id;
  assert.equal((await request('/reservations','POST',{...meeting,itemId:id},buyer)).body.id,trade);
  assert.equal((await request('/reservations','POST',{...meeting,itemId:id},other)).status,201);
  const action=(id,action,actor='test-session-123456789',extra={})=>request('/reservations/'+id,'PATCH',{action,...extra},actor);
  assert.equal((await action(trade,'accept',buyer)).status,403);assert.equal((await action(trade,'accept',other)).status,403);
  assert.equal((await action(trade,'confirm',buyer,{confirmed:true})).status,409);
  assert.equal((await action(trade,'accept')).body.status,'accepted');
  assert.equal((await request('/me','GET',undefined,other)).body.reservations[0].status,'declined');
  assert.equal((await request('/items?available=true')).body.some(i=>i.id===id),false);
  assert.equal((await request('/reservations','POST',{...meeting,itemId:id},'third-session-123456')).status,409);
  assert.equal((await action(trade,'evidence',buyer,{evidence:{}})).status,403);
  assert.equal((await action(trade,'confirm',undefined,{confirmed:true})).body.status,'accepted');
  assert.equal((await action(trade,'cancel',buyer)).status,409);
  assert.equal((await action(trade,'confirm',buyer,{confirmed:true})).body.status,'completed');
  assert.equal((await action(trade,'confirm',buyer,{confirmed:true})).body.status,'completed');
  const evidence={alternative:'buy_new',travelMode:'walk',extraKm:0.5,expectedMonths:12};
  assert.equal((await action(trade,'evidence',undefined,{evidence})).status,403);
  assert.equal((await action(trade,'evidence',buyer,{evidence:{...evidence,extraKm:-1}})).status,400);
  assert.equal((await action(trade,'evidence',buyer,{evidence})).body.evidence.carbonStatus,'not_calculated');
  const canceled=await request('/reservations','POST',{...meeting,itemId:1},buyer);assert.equal((await action(canceled.body.id,'cancel',buyer)).body.status,'cancelled');
  assert.notEqual((await request('/reservations','POST',{...meeting,itemId:1},buyer)).body.id,canceled.body.id);

  assert.equal((await request('/reservations','POST',{itemId:99999})).status,404);
  await stop();await start();
  assert.equal((await request('/me')).body.published.length,1);
  const persisted=(await request('/me','GET',undefined,buyer)).body.reservations.find(r=>r.id===trade);assert.equal(persisted.status,'completed');assert.equal(persisted.evidence.alternative,'buy_new');assert.ok(!('buyer' in persisted));assert.ok(!('seller' in persisted));
  assert.deepEqual((await request('/me')).body.favorites,[id]);
  await request('/favorites/'+id,'PUT',{saved:false});assert.deepEqual((await request('/me')).body.favorites,[]);
 }finally{await stop();rmSync(dir,{recursive:true,force:true});}
});
