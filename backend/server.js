import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { items as seed } from './seed.js';
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
const app=express();app.disable('x-powered-by');app.use(express.json({limit:'2mb'}));
app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');const session=req.get('X-Demo-Session');if(req.path!='/health'&&!/^[a-zA-Z0-9-]{16,80}$/.test(session||''))return res.status(400).json({error:'缺少有效的演示会话'});req.session=session;next();});
app.get('/api/health',(_,res)=>res.json({ok:true,mode:'demo'}));
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
app.put('/api/favorites/:id',(req,res)=>{
 const id=Number(req.params.id);if(!Number.isInteger(id)||!allItems().some(i=>i.id===id))return res.status(404).json({error:'商品不存在'});
 if(typeof req.body?.saved!=='boolean')return res.status(400).json({error:'收藏状态无效'});
 if(req.body.saved)db.prepare('INSERT OR IGNORE INTO favorites VALUES (?,?)').run(req.session,id);else db.prepare('DELETE FROM favorites WHERE session=? AND item_id=?').run(req.session,id);res.json({saved:req.body.saved});
});
app.post('/api/items',(req,res)=>{
 const clean=validateListing(req.body||{});const item={...clean,image:'placeholder',seller:'校园发布者',avatar:'同',color:'#e3ecf4',tag:'新发布',wish:0,owner:req.session};
 const row=db.prepare('INSERT INTO items(body) VALUES (?)').run(JSON.stringify(item));res.status(201).json(publicItem({...item,id:Number(row.lastInsertRowid)},readRequests(),req.session));
});
app.post('/api/reservations',(req,res)=>{
 const items=allItems();const result=mutate(rs=>publicRequest(createRequest(items,rs,req.session,req.body||{}),items,rs,req.session));res.status(201).json(result);
});
app.patch('/api/reservations/:id',(req,res)=>{
 const items=allItems();const result=mutate(rs=>publicRequest(actOnRequest(rs,req.session,Number(req.params.id),req.body||{}),items,rs,req.session));res.json(result);
});
app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.status===413?'照片或内容太大':err.status?err.message:'服务暂时不可用，请稍后重试'}));
const server=app.listen(Number(process.env.PORT)||3100,process.env.HOST||'127.0.0.1',()=>console.log(`Campus API ready on port ${server.address().port}`));
