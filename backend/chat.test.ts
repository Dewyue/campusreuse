import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, type ChildProcess} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import type {Conversation,ChatMessage,MessagePage} from '../shared/chat.ts';

test('account chat: ownership, two-way messages, retry, reads, proposals and persistence',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'campus-chat-'));
  let server:ChildProcess;
  const start=async()=>{
    server=spawn(process.execPath,['--experimental-strip-types','backend/server.js'],{env:{...process.env,DATA_DIR:dir,PORT:'3196'},stdio:['ignore','pipe','pipe']});
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Startup timeout')),8000);
      server.stdout!.on('data',d=>{if(String(d).includes('ready')){clearTimeout(timer);resolve();}});
      server.on('exit',code=>{clearTimeout(timer);reject(Error('Exit '+code));});
      server.on('error',reject);
    });
  };
  const stop=async()=>{if(server?.exitCode===null){const done=once(server,'exit');server.kill();await done;}};
  const request=async<T=Record<string,unknown>>(path:string,token='',method='GET',body?:unknown)=>{
    const res=await fetch('http://127.0.0.1:3196/api'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{'X-Demo-Session':'test-demo-1234567890'})},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:res.status,body:await res.json() as T};
  };
  try{
    await start();
    const register=async(username:string)=>(await request<{token:string}>('/register','','POST',{username,password:'test-only-password'})).body.token;
    const seller=await register('seller'),buyer=await register('buyer'),stranger=await register('stranger');
    const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    const item=(await request<{id:number}>('/items',seller,'POST',{title:'聊天测试教材',description:'教材两册',price:12,category:'书籍',campus:'新校区',condition:'轻微使用痕迹',functionStatus:'功能正常',defects:'少量划线',pickupPlace:'图书馆',pickupWindow:'下午',photo,disclosureConfirmed:true})).body;
    assert.equal((await request('/conversations')).status,401);
    assert.equal((await request('/conversations',seller,'POST',{itemId:item.id})).status,400);
    assert.equal((await request('/conversations',buyer,'POST',{itemId:1})).status,409);
    const c=(await request<Conversation>('/conversations',buyer,'POST',{itemId:item.id})).body;
    assert.equal(c.peer,'seller');
    assert.equal((await request<Conversation>('/conversations',buyer,'POST',{itemId:item.id})).body.id,c.id);
    assert.equal((await request('/conversations/'+c.id+'/messages',stranger)).status,404);
    const path='/conversations/'+c.id+'/messages';
    const body={kind:'text',text:'你好，在哪里面交？',clientId:crypto.randomUUID()};
    const sent=await request<ChatMessage>(path,buyer,'POST',body);
    assert.equal(sent.status,201);
    assert.equal((await request<ChatMessage>(path,buyer,'POST',body)).body.id,sent.body.id);
    assert.equal((await request(path,buyer,'POST',{...body,text:'different'})).status,409);
    assert.equal((await request(path,stranger,'POST',body)).status,404);
    for(const text of ['', ' '.repeat(5),'x'.repeat(1001)])assert.equal((await request(path,buyer,'POST',{...body,text,clientId:crypto.randomUUID()})).status,400);
    const inbox=(await request<Conversation[]>('/conversations',seller)).body;
    assert.equal(inbox[0].unread,1);assert.equal(inbox[0].peer,'buyer');
    const messages=(await request<MessagePage>(path,seller)).body;
    assert.equal(messages.messages[0].mine,false);
    assert.ok(!('sender' in messages.messages[0]));assert.ok(!('owner' in messages.conversation.item));
    assert.equal((await request('/conversations/'+c.id+'/read',stranger,'POST',{lastId:sent.body.id})).status,404);
    await request('/conversations/'+c.id+'/read',seller,'POST',{lastId:sent.body.id});
    assert.equal((await request<Conversation[]>('/conversations',seller)).body[0].unread,0);
    const proposal=(await request<ChatMessage>(path,seller,'POST',{kind:'place',text:'图书馆正门',clientId:crypto.randomUUID()})).body;
    assert.equal((await request<MessagePage>(path+'?after='+sent.body.id,buyer)).body.messages[0].text,'图书馆正门');
    assert.equal((await request<MessagePage>(path+'?after='+proposal.id,buyer)).body.messages.length,0);
    const trade=(await request<{id:number;place:string;status:string}>('/reservations',buyer,'POST',{itemId:item.id,place:proposal.text,meetingAt:new Date(Date.now()+3600000).toISOString(),safetyConfirmed:true})).body;
    assert.equal(trade.place,proposal.text);assert.equal(trade.status,'pending');
    assert.equal((await request<Conversation>('/conversations',seller,'POST',{requestId:trade.id})).body.id,c.id);
    assert.equal((await request('/conversations',stranger,'POST',{requestId:trade.id})).status,404);
    assert.equal((await request<{status:string}>('/reservations/'+trade.id,seller,'PATCH',{action:'accept'})).body.status,'accepted');
    await stop();await start();
    assert.equal((await request<MessagePage>(path,buyer)).body.messages.length,2);
    assert.equal((await request<Conversation[]>('/conversations',buyer)).body[0].unread,1);
    await request('/logout',buyer,'POST');
    assert.equal((await request(path,buyer)).status,401);
  }finally{await stop();rmSync(dir,{recursive:true,force:true});}
});
