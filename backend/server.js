import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { createReadStream, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { items as seed } from './seed.js';
import {createAuth,readToken,tokenCookie} from './auth.js';
import {chatRouter} from './chat.ts';
import {createPrivacy} from './privacy.js';
import {sortItems} from '../shared/item-order.js';
import {normalizeCampus,validateListing,publicItem,publicRequest,expireRequests,createRequest,actOnRequest} from '../shared/market.js';

const data=process.env.DATA_DIR||fileURLToPath(new URL('./data/',import.meta.url));
mkdirSync(data,{recursive:true});
const db=new DatabaseSync(`${data}/market.db`);
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS favorites (session TEXT, item_id INTEGER, PRIMARY KEY(session,item_id)); CREATE TABLE IF NOT EXISTS reservations (id INTEGER PRIMARY KEY AUTOINCREMENT, session TEXT, item_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(session,item_id)); CREATE TABLE IF NOT EXISTS trade_requests (id INTEGER PRIMARY KEY,body TEXT NOT NULL);');
if(!db.prepare('SELECT count(*) AS n FROM items').get().n){const insert=db.prepare('INSERT INTO items(id,body) VALUES (?,?)');seed.forEach(i=>insert.run(i.id,JSON.stringify(i)));}
const allItems=()=>db.prepare('SELECT id,body FROM items ORDER BY id DESC').all().map(r=>({...JSON.parse(r.body),id:r.id}));
// Keep historical one-click intentions without presenting them as agreed meetings.
for(const r of db.prepare('SELECT * FROM reservations').all()){
 const item=allItems().find(i=>i.id===r.item_id);if(!item)continue;
 db.prepare('INSERT OR IGNORE INTO trade_requests(id,body) VALUES (?,?)').run(r.id,JSON.stringify({id:r.id,item_id:r.item_id,buyer:r.session,seller:item.owner||'demo-seller-'+item.id,status:'legacy',created_at:r.created_at,buyerConfirmed:false,sellerConfirmed:false}));
}
const saveRequests=rs=>{const q=db.prepare('INSERT INTO trade_requests(id,body) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body');for(const r of rs)q.run(r.id,JSON.stringify(r));};
const readRequests=()=>{const rs=db.prepare('SELECT body FROM trade_requests ORDER BY id').all().map(r=>JSON.parse(r.body));const before=JSON.stringify(rs);expireRequests(rs);if(before!==JSON.stringify(rs))saveRequests(rs);return rs;};
const mutate=fn=>{db.exec('BEGIN IMMEDIATE');try{const rs=readRequests();const result=fn(rs);saveRequests(rs);db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
const auth=createAuth(db);
const privacy=createPrivacy(db,data);
const openPaths=new Set(['/health','/register','/login']);
const requireAccount=(req,res,next)=>{
 if(!req.user)return res.status(401).json({error:'请先登录后再操作'});
 next();
};
const purgeConversation=(conversationId)=>{
 db.prepare('DELETE FROM chat_messages WHERE conversation_id=?').run(conversationId);
 db.prepare('DELETE FROM chat_reads WHERE conversation_id=?').run(conversationId);
 db.prepare('DELETE FROM conversations WHERE id=?').run(conversationId);
};
const purgeItemData=(itemId)=>{
 const item=allItems().find(i=>i.id===itemId);
 if(item?.photoFile)privacy.removePhoto(item.photoFile);
 const threads=db.prepare('SELECT id FROM conversations WHERE item_id=?').all(itemId);
 for(const t of threads)purgeConversation(t.id);
 db.prepare('DELETE FROM favorites WHERE item_id=?').run(itemId);
 for(const r of readRequests()){
  if(r.item_id===itemId)db.prepare('DELETE FROM trade_requests WHERE id=?').run(r.id);
 }
 db.prepare('DELETE FROM items WHERE id=?').run(itemId);
};
const requireSteward=(req,res,next)=>{
 if(!req.user)return res.status(401).json({error:'请先登录'});
 if(!privacy.isSteward(req.user))return res.status(403).json({error:'当前账号没有值守权限'});
 next();
};
const enrichReports=rows=>{
 const items=allItems();
 return rows.map(r=>{
  if(r.targetType==='item'){
   const item=items.find(i=>String(i.id)===String(r.targetId));
   return {...r,targetLabel:item?item.title:'物品已不存在',targetGone:!item};
  }
  if(r.targetType==='conversation'){
   const row=db.prepare('SELECT id,item_id FROM conversations WHERE id=?').get(Number(r.targetId));
   return {...r,targetLabel:row?('会话 #'+row.id+' · 物品 '+row.item_id):'会话已不存在',targetGone:!row};
  }
  return {...r,targetLabel:'用户 '+r.targetId,targetGone:false};
 });
};
const app=express();app.disable('x-powered-by');app.use(express.json({limit:'2mb'}));
app.use('/api',(req,res,next)=>{
 res.set('Cache-Control','no-store');
 if(openPaths.has(req.path)||req.path.startsWith('/media/'))return next();
 const token=readToken(req);
 if(token){
  const user=auth.userFromToken(token);
  if(!user)return res.status(401).json({error:'登录已失效，请重新登录'});
  req.user=user;req.token=token;req.session='u:'+user.id;return next();
 }
 if(req.path==='/account'||req.path==='/logout'||req.path.startsWith('/account/'))return res.status(401).json({error:'请先登录'});
 const session=req.get('X-Demo-Session');
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(session||''))return res.status(400).json({error:'缺少有效的演示会话'});
 req.session=session;next();
});
const sendAuth=(req,res,status,payload)=>{
 res.set('Set-Cookie',tokenCookie(payload.token,{secure:req.get('X-Forwarded-Proto')==='https'||req.secure}));
 res.status(status).json(payload);
};
app.get('/api/health',(_,res)=>res.json({ok:true,mode:'demo',auth:true,retention:privacy.policy}));
app.get('/api/media/:name',(req,res)=>{
 const path=privacy.photoPath(req.params.name);
 if(!path)return res.status(404).json({error:'照片不存在'});
 res.set('Cache-Control','public, max-age=86400');
 res.type(path.endsWith('.png')?'image/png':path.endsWith('.webp')?'image/webp':'image/jpeg');
 createReadStream(path).pipe(res);
});
app.post('/api/register',(req,res)=>{
 try{
  const payload=auth.register(req.body||{});
  privacy.audit('u:'+payload.user.id,'register',{username:payload.user.username});
  sendAuth(req,res,201,payload);
 }catch(e){
  privacy.audit(null,'register_fail',{username:req.body?.username,error:e.message});
  throw e;
 }
});
app.post('/api/login',(req,res)=>{
 try{
  const payload=auth.login(req.body||{});
  privacy.audit('u:'+payload.user.id,'login',{username:payload.user.username});
  sendAuth(req,res,200,payload);
 }catch(e){
  privacy.audit(null,'login_fail',{username:req.body?.username});
  throw e;
 }
});
app.get('/api/account',(req,res)=>res.json({...req.user,steward:privacy.isSteward(req.user)}));
app.get('/api/account/export',requireAccount,(req,res)=>{
 const actor=req.session;
 const rs=readRequests();
 const items=allItems();
 const published=items.filter(i=>i.owner===actor).map(i=>{
  const pub=publicItem(i,rs,actor);
  const {photo,...safe}=pub;
  return {...safe,hasPhoto:Boolean(i.photoFile||i.photo)};
 });
 const threads=db.prepare('SELECT * FROM conversations WHERE buyer=? OR seller=?').all(actor,actor);
 const conversations=threads.map(t=>{
  const messages=db.prepare('SELECT id,kind,text,created_at,sender FROM chat_messages WHERE conversation_id=? ORDER BY id').all(t.id)
   .map(m=>({id:m.id,kind:m.kind,text:m.text,createdAt:m.created_at,mine:m.sender===actor}));
  return {id:t.id,itemId:t.item_id,role:t.buyer===actor?'buyer':'seller',createdAt:t.created_at,messages};
 });
 const payload={
  exportedAt:new Date().toISOString(),
  retention:privacy.policy,
  account:req.user,
  favorites:db.prepare('SELECT item_id FROM favorites WHERE session=?').all(actor).map(x=>x.item_id),
  published,
  tradeRequests:rs.filter(r=>r.buyer===actor||r.seller===actor).map(r=>publicRequest(r,items,rs,actor)),
  blocks:privacy.listBlocks(actor),
  conversations,
 };
 privacy.audit(actor,'export',{conversations:conversations.length,published:published.length});
 res.set('Content-Disposition','attachment; filename="campusreuse-export.json"');
 res.json(payload);
});
app.post('/api/logout',(req,res)=>{
 auth.logout(req.token);
 privacy.audit(req.session,'logout',{});
 res.set('Set-Cookie',tokenCookie('',{secure:req.get('X-Forwarded-Proto')==='https'||req.secure,clear:true}));
 res.json({ok:true});
});
app.post('/api/account/delete',(req,res)=>{
 if(!req.user)return res.status(401).json({error:'请先登录'});
 auth.assertPassword(req.user.id,req.body?.password);
 const actor=req.session;
 db.exec('BEGIN IMMEDIATE');
 try{
  const threads=db.prepare('SELECT id FROM conversations WHERE buyer=? OR seller=?').all(actor,actor);
  for(const t of threads){
   db.prepare('DELETE FROM chat_messages WHERE conversation_id=?').run(t.id);
   db.prepare('DELETE FROM chat_reads WHERE conversation_id=?').run(t.id);
  }
  db.prepare('DELETE FROM conversations WHERE buyer=? OR seller=?').run(actor,actor);
  db.prepare('DELETE FROM favorites WHERE session=?').run(actor);
  db.prepare('DELETE FROM reservations WHERE session=?').run(actor);
  db.prepare('DELETE FROM blocks WHERE actor=? OR target=?').run(actor,actor);
  for(const r of readRequests()){
   if(r.buyer===actor||r.seller===actor)db.prepare('DELETE FROM trade_requests WHERE id=?').run(r.id);
  }
  for(const item of allItems()){
   if(item.owner===actor)purgeItemData(item.id);
  }
  auth.deleteAccount(req.user.id);
  db.exec('COMMIT');
 }catch(e){
  db.exec('ROLLBACK');
  throw e;
 }
 privacy.audit(actor,'account_delete',{userId:req.user.id});
 res.set('Set-Cookie',tokenCookie('',{secure:req.get('X-Forwarded-Proto')==='https'||req.secure,clear:true}));
 res.json({ok:true});
});
app.get('/api/blocks',requireAccount,(req,res)=>res.json(privacy.listBlocks(req.session)));
app.put('/api/blocks/:userId',requireAccount,(req,res)=>{
 const target='u:'+Number(req.params.userId);
 if(!Number.isInteger(Number(req.params.userId))||Number(req.params.userId)<1)return res.status(400).json({error:'用户编号无效'});
 if(req.body?.blocked===false)privacy.unblock(req.session,target);
 else privacy.block(req.session,target);
 res.json({ok:true,blocked:req.body?.blocked!==false});
});
app.post('/api/reports',requireAccount,(req,res)=>res.status(201).json(privacy.report(req.session,req.body||{})));
app.get('/api/steward/reports',requireAccount,requireSteward,(req,res)=>{
 const status=String(req.query.status||'open');
 res.json(enrichReports(privacy.listReports(status==='all'?'all':status==='closed'?'closed':'open')));
});
app.patch('/api/steward/reports/:id',requireAccount,requireSteward,(req,res)=>{
 const id=Number(req.params.id);
 if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'举报编号无效'});
 const result=privacy.resolveReport(req.session,id,req.body||{},{removeItem:purgeItemData,removeConversation:purgeConversation});
 res.json(enrichReports([result])[0]);
});
app.use('/api/conversations',chatRouter(db,allItems,readRequests,{blockedPair:privacy.blockedPair,audit:privacy.audit}));
app.get('/api/items',(req,res)=>{
 const rs=readRequests();let result=allItems().map(i=>publicItem(i,rs,req.session));const {q,campus,category,sort,free,available}=req.query;
 if(q)result=result.filter(i=>(i.title+' '+i.description).toLocaleLowerCase().includes(String(q).toLocaleLowerCase()));
 if(campus)result=result.filter(i=>i.campus===normalizeCampus(campus));if(category)result=result.filter(i=>i.category===category);if(free==='true')result=result.filter(i=>i.price===0);if(available==='true')result=result.filter(i=>i.availability==='available');
 sortItems(result,sort);
 res.json(result);
});
app.get('/api/me',(req,res)=>{
 const rs=readRequests(),items=allItems();res.json({favorites:db.prepare('SELECT item_id FROM favorites WHERE session=?').all(req.session).map(x=>x.item_id),published:items.filter(i=>i.owner===req.session).map(i=>publicItem(i,rs,req.session)),reservations:rs.filter(r=>r.buyer===req.session).reverse().map(r=>publicRequest(r,items,rs,req.session)),incoming:rs.filter(r=>r.seller===req.session).reverse().map(r=>publicRequest(r,items,rs,req.session))});
});
app.put('/api/favorites/:id',requireAccount,(req,res)=>{
 const id=Number(req.params.id);if(!Number.isInteger(id)||!allItems().some(i=>i.id===id))return res.status(404).json({error:'商品不存在'});
 if(typeof req.body?.saved!=='boolean')return res.status(400).json({error:'收藏状态无效'});
 if(req.body.saved)db.prepare('INSERT OR IGNORE INTO favorites VALUES (?,?)').run(req.session,id);else db.prepare('DELETE FROM favorites WHERE session=? AND item_id=?').run(req.session,id);res.json({saved:req.body.saved});
});
app.post('/api/items',requireAccount,(req,res)=>{
 const clean=validateListing(req.body||{});
 const {photo,...fields}=clean;
 const photoFile=privacy.storePhoto(photo);
 const seller=req.user.username;
 const item={...fields,photoFile,image:'placeholder',seller,avatar:seller.slice(0,1),color:'#e3ecf4',tag:'新发布',wish:0,owner:req.session,createdAt:new Date().toISOString()};
 const row=db.prepare('INSERT INTO items(body) VALUES (?)').run(JSON.stringify(item));
 const saved={...item,id:Number(row.lastInsertRowid)};
 privacy.audit(req.session,'item_create',{id:saved.id});
 res.status(201).json(publicItem(saved,readRequests(),req.session));
});
app.delete('/api/items/:id',requireAccount,(req,res)=>{
 const id=Number(req.params.id);
 if(!Number.isInteger(id))return res.status(400).json({error:'商品编号无效'});
 const item=allItems().find(i=>i.id===id);
 if(!item)return res.status(404).json({error:'商品不存在'});
 if(item.owner!==req.session)return res.status(403).json({error:'只能删除自己发布的物品'});
 db.exec('BEGIN IMMEDIATE');
 try{purgeItemData(id);db.exec('COMMIT');}
 catch(e){db.exec('ROLLBACK');throw e;}
 privacy.audit(req.session,'item_delete',{id});
 res.json({ok:true});
});
app.post('/api/reservations',requireAccount,(req,res)=>{
 const items=allItems();
 const item=items.find(i=>i.id===req.body?.itemId);
 if(item?.owner&&privacy.blockedPair(req.session,item.owner))return res.status(403).json({error:'双方存在拉黑关系，无法预约'});
 const result=mutate(rs=>publicRequest(createRequest(items,rs,req.session,req.body||{}),items,rs,req.session));res.status(201).json(result);
});
app.patch('/api/reservations/:id',requireAccount,(req,res)=>{
 const items=allItems();const result=mutate(rs=>publicRequest(actOnRequest(rs,req.session,Number(req.params.id),req.body||{}),items,rs,req.session));res.json(result);
});
app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.status===413?'照片或内容太大':err.status?err.message:'服务暂时不可用，请稍后重试'}));
privacy.cleanup();
setInterval(()=>privacy.cleanup(),6*60*60*1000).unref?.();
const server=app.listen(Number(process.env.PORT)||3100,process.env.HOST||'127.0.0.1',()=>console.log(`Campus API ready on port ${server.address().port}`));
