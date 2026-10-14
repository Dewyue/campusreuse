import {Router, type Request} from 'express';
import type {DatabaseSync} from 'node:sqlite';
import type {ChatItem, Conversation, ChatMessage} from '../shared/chat.ts';

interface Item extends ChatItem {owner?: string}
interface Thread {id: number; item_id: number; buyer: string; seller: string; created_at: string}
interface Trade {id:number;item_id:number;buyer:string;seller:string}
interface Row {id: number; sender: string; kind: 'text' | 'place'; text: string; created_at: string}
type AuthRequest = Request & {session?: string; user?: {id: number}};
const fail = (message: string, status = 400): never => {throw Object.assign(new Error(message), {status});};
const positive = (value: unknown): number => {
  if(typeof value!=='number'&&!(typeof value==='string'&&/^[0-9]+$/.test(value)))return fail('编号无效');
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<1)fail('编号无效');
  return n;
};

export function chatRouter(db: DatabaseSync, allItems: () => Item[], readTrades: () => Trade[]) {
  db.exec(`CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL, buyer TEXT NOT NULL,
    seller TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(item_id,buyer));
    CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY, conversation_id INTEGER NOT NULL, sender TEXT NOT NULL,
    client_id TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(conversation_id,sender,client_id));
    CREATE INDEX IF NOT EXISTS chat_thread_messages ON chat_messages(conversation_id,id);
    CREATE INDEX IF NOT EXISTS chat_sender_time ON chat_messages(sender,created_at);
    CREATE TABLE IF NOT EXISTS chat_reads (
    conversation_id INTEGER NOT NULL, actor TEXT NOT NULL, last_id INTEGER NOT NULL,
    PRIMARY KEY(conversation_id,actor));`);
  const router=Router();
  router.use((req,res,next)=>{
    if(!(req as AuthRequest).user||!(req as AuthRequest).session?.startsWith('u:'))return res.status(401).json({error:'请先登录后沟通'});
    next();
  });
  const thread=(id: number, actor: string): Thread=>{
    const row=db.prepare('SELECT * FROM conversations WHERE id=? AND (buyer=? OR seller=?)').get(id,actor,actor) as unknown as Thread|undefined;
    if(!row)return fail('会话不存在或无权访问',404);
    return row;
  };
  const summary=(t: Thread, actor: string): Conversation=>{
    const item=allItems().find(i=>i.id===t.item_id);
    if(!item)return fail('商品不存在',404);
    const peer=t.buyer===actor?t.seller:t.buyer;
    const user=db.prepare('SELECT username FROM users WHERE id=?').get(Number(peer.slice(2)));
    const last=db.prepare('SELECT * FROM chat_messages WHERE conversation_id=? ORDER BY id DESC LIMIT 1').get(t.id) as unknown as Row|undefined;
    const count=db.prepare('SELECT count(*) AS n FROM chat_messages WHERE conversation_id=? AND sender!=? AND id>COALESCE((SELECT last_id FROM chat_reads WHERE conversation_id=? AND actor=?),0)').get(t.id,actor,t.id,actor);
    return {id:t.id,item:{id:item.id,title:item.title,campus:item.campus,price:item.price,image:item.image,
      pickupPlace:item.pickupPlace,pickupWindow:item.pickupWindow,isMine:item.owner===actor},role:t.buyer===actor?'buyer':'seller',
      peer:String(user?.username||'校园用户'),unread:Number(count?.n||0),
      lastText:last?(last.kind==='place'?'建议地点：':'')+last.text:'尚未发送消息',updatedAt:last?.created_at||t.created_at};
  };
  const message=(r: Row,actor: string): ChatMessage=>({id:r.id,mine:r.sender===actor,kind:r.kind,text:r.text,createdAt:r.created_at});
  router.get('/',(req,res)=>{
    const actor=(req as AuthRequest).session!;
    const ts=db.prepare('SELECT * FROM conversations WHERE buyer=? OR seller=?').all(actor,actor) as unknown as Thread[];
    res.json(ts.map(t=>summary(t,actor)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.id-a.id));
  });
  router.post('/',(req,res)=>{
    const actor=(req as AuthRequest).session!;
    const tradeId=req.body?.requestId;
    const trade=tradeId===undefined?undefined:readTrades().find(r=>r.id===positive(tradeId)&&(r.buyer===actor||r.seller===actor));
    if(tradeId!==undefined&&!trade)return fail('面交请求不存在或无权访问',404);
    const buyer=trade?.buyer||actor;
    const id=trade?.item_id||positive(req.body?.itemId),item=allItems().find(i=>i.id===id);
    if(!item)return fail('商品不存在',404);
    if(item.owner===buyer)return fail('不能与自己创建会话');
    if(!item.owner?.startsWith('u:')||!db.prepare('SELECT id FROM users WHERE id=?').get(Number(item.owner.slice(2))))return fail('该物品没有可联系的注册卖家',409);
    if(!buyer.startsWith('u:')||!db.prepare('SELECT id FROM users WHERE id=?').get(Number(buyer.slice(2))))return fail('对方尚未使用注册账号，无法在线沟通',409);
    if(trade&&trade.seller!==item.owner)return fail('物品归属发生变化',409);
    db.prepare('INSERT OR IGNORE INTO conversations(item_id,buyer,seller,created_at) VALUES (?,?,?,?)').run(id,buyer,item.owner,new Date().toISOString());
    const t=db.prepare('SELECT * FROM conversations WHERE item_id=? AND buyer=?').get(id,buyer) as unknown as Thread;
    res.json(summary(t,actor));
  });
  router.get('/:id/messages',(req,res)=>{
    const actor=(req as AuthRequest).session!,t=thread(positive(req.params.id),actor);
    const after=req.query.after===undefined?0:Number(req.query.after);
    if(!Number.isSafeInteger(after)||after<0)return fail('消息游标无效');
    const rows=db.prepare('SELECT * FROM chat_messages WHERE conversation_id=? AND id>? ORDER BY id LIMIT 101').all(t.id,after) as unknown as Row[];
    res.json({conversation:summary(t,actor),messages:rows.slice(0,100).map(r=>message(r,actor)),hasMore:rows.length>100});
  });
  router.post('/:id/messages',(req,res)=>{
    const actor=(req as AuthRequest).session!,t=thread(positive(req.params.id),actor);
    const body=req.body as Record<string,unknown>|undefined;
    const kind=body?.kind,text=typeof body?.text==='string'?body.text.trim():'',clientId=body?.clientId;
    if((kind!=='text'&&kind!=='place')||!text||text.length>(kind==='place'?80:1000))return fail('请填写有效消息，文字最多 1000 字，地点最多 80 字');
    if(typeof clientId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(clientId))return fail('消息标识无效');
    const existing=db.prepare('SELECT * FROM chat_messages WHERE conversation_id=? AND sender=? AND client_id=?').get(t.id,actor,clientId) as unknown as Row|undefined;
    if(existing){
      if(existing.kind!==kind||existing.text!==text)return fail('消息标识已被使用',409);
      return res.json(message(existing,actor));
    }
    const recent=db.prepare('SELECT count(*) AS n FROM chat_messages WHERE sender=? AND created_at>?').get(actor,new Date(Date.now()-60000).toISOString());
    if(Number(recent?.n)>=30)return fail('发送太频繁，请稍后再试',429);
    const created=new Date().toISOString();
    const result=db.prepare('INSERT INTO chat_messages(conversation_id,sender,client_id,kind,text,created_at) VALUES (?,?,?,?,?,?)').run(t.id,actor,clientId,kind,text,created);
    res.status(201).json(message({id:Number(result.lastInsertRowid),sender:actor,kind,text,created_at:created},actor));
  });
  router.post('/:id/read',(req,res)=>{
    const actor=(req as AuthRequest).session!,t=thread(positive(req.params.id),actor);
    const id=positive(req.body?.lastId);
    if(!db.prepare('SELECT id FROM chat_messages WHERE id=? AND conversation_id=?').get(id,t.id))return fail('消息不存在',404);
    db.prepare('INSERT INTO chat_reads(conversation_id,actor,last_id) VALUES (?,?,?) ON CONFLICT(conversation_id,actor) DO UPDATE SET last_id=MAX(last_id,excluded.last_id)').run(t.id,actor,id);
    res.json({ok:true});
  });
  return router;
}
