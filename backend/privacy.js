import {createHash,randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {join} from 'node:path';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const days=name=>{
 const raw=Number(process.env[name]);
 return Number.isFinite(raw)&&raw>0?raw:undefined;
};

export function createPrivacy(db,dataDir){
 const photoDir=join(dataDir,'photos');
 mkdirSync(photoDir,{recursive:true});
 db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   at TEXT NOT NULL,
   actor TEXT,
   action TEXT NOT NULL,
   detail TEXT
  ); CREATE TABLE IF NOT EXISTS blocks (
   actor TEXT NOT NULL,
   target TEXT NOT NULL,
   created_at TEXT NOT NULL,
   PRIMARY KEY(actor,target)
  ); CREATE TABLE IF NOT EXISTS reports (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   reporter TEXT NOT NULL,
   target_type TEXT NOT NULL,
   target_id TEXT NOT NULL,
   reason TEXT NOT NULL,
   created_at TEXT NOT NULL,
   status TEXT NOT NULL DEFAULT 'open',
   note TEXT,
   resolved_at TEXT,
   resolver TEXT
  );`);
 const reportCols=new Set(db.prepare('PRAGMA table_info(reports)').all().map(c=>c.name));
 if(!reportCols.has('status'))db.exec("ALTER TABLE reports ADD COLUMN status TEXT NOT NULL DEFAULT 'open'");
 if(!reportCols.has('note'))db.exec('ALTER TABLE reports ADD COLUMN note TEXT');
 if(!reportCols.has('resolved_at'))db.exec('ALTER TABLE reports ADD COLUMN resolved_at TEXT');
 if(!reportCols.has('resolver'))db.exec('ALTER TABLE reports ADD COLUMN resolver TEXT');

 const insertAudit=db.prepare('INSERT INTO audit_log(at,actor,action,detail) VALUES (?,?,?,?)');
 const insertBlock=db.prepare('INSERT OR IGNORE INTO blocks(actor,target,created_at) VALUES (?,?,?)');
 const deleteBlock=db.prepare('DELETE FROM blocks WHERE actor=? AND target=?');
 const listBlocks=db.prepare('SELECT target,created_at FROM blocks WHERE actor=? ORDER BY created_at DESC');
 const isBlocked=db.prepare('SELECT 1 AS ok FROM blocks WHERE (actor=? AND target=?) OR (actor=? AND target=?)');
 const insertReport=db.prepare("INSERT INTO reports(reporter,target_type,target_id,reason,created_at,status) VALUES (?,?,?,?,?,'open')");
 const findReport=db.prepare('SELECT * FROM reports WHERE id=?');
 const updateReport=db.prepare('UPDATE reports SET status=?, note=?, resolved_at=?, resolver=? WHERE id=?');
 const stewardNames=new Set(String(process.env.STEWARD_USERNAMES||'').split(/[,，]/).map(s=>s.trim().toLowerCase()).filter(Boolean));
 const isSteward=user=>Boolean(user?.username&&stewardNames.has(String(user.username).toLowerCase()));

 const chatDays=days('CHAT_RETENTION_DAYS')??90;
 const tradeDays=days('TRADE_RETENTION_DAYS')??180;
 const auditDays=days('AUDIT_RETENTION_DAYS')??365;

 const audit=(actor,action,detail={})=>{
  try{insertAudit.run(new Date().toISOString(),actor||null,action,JSON.stringify(detail));}
  catch(e){console.error('audit log failed',e);}
 };

 const storePhoto=(dataUrl)=>{
  const match=String(dataUrl||'').match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
  if(!match)fail('照片格式无效');
  const ext=match[1]==='jpeg'?'jpg':match[1];
  const bytes=Buffer.from(match[2],'base64');
  const name=createHash('sha256').update(bytes).update(randomBytes(8)).digest('hex').slice(0,40)+'.'+ext;
  writeFileSync(join(photoDir,name),bytes);
  return name;
 };

 const removePhoto=(name)=>{
  if(!name||typeof name!=='string'||!/^[a-f0-9]{16,64}\.(jpg|png|webp)$/.test(name))return;
  const path=join(photoDir,name);
  if(existsSync(path))try{unlinkSync(path);}catch(e){console.error('photo delete failed',path,e);}
 };

 const photoPath=(name)=>{
  if(!name||!/^[a-f0-9]{16,64}\.(jpg|png|webp)$/.test(name))return null;
  const path=join(photoDir,name);
  return existsSync(path)?path:null;
 };

 const blockedPair=(a,b)=>Boolean(a&&b&&isBlocked.get(a,b,b,a));

 const block=(actor,target)=>{
  if(!target||!/^u:\d+$/.test(target))fail('拉黑对象无效');
  if(target===actor)fail('不能拉黑自己');
  insertBlock.run(actor,target,new Date().toISOString());
  audit(actor,'block',{target});
 };

 const unblock=(actor,target)=>{
  deleteBlock.run(actor,target);
  audit(actor,'unblock',{target});
 };

 const report=(reporter,{targetType,targetId,reason})=>{
  const type=targetType;
  if(!['item','conversation','user'].includes(type))fail('举报类型无效');
  const id=String(targetId||'').trim();
  if(!id||id.length>40)fail('举报对象无效');
  const text=typeof reason==='string'?reason.trim():'';
  if(text.length<4||text.length>300)fail('请填写 4–300 字的举报说明');
  const created=new Date().toISOString();
  const row=insertReport.run(reporter,type,id,text,created);
  audit(reporter,'report',{targetType:type,targetId:id,id:Number(row.lastInsertRowid)});
  return {ok:true,id:Number(row.lastInsertRowid)};
 };

 const publicReport=(row,extras={})=>({
  id:row.id,
  targetType:row.target_type,
  targetId:row.target_id,
  reason:row.reason,
  createdAt:row.created_at,
  status:row.status||'open',
  note:row.note||'',
  resolvedAt:row.resolved_at||null,
  resolver:row.resolver||null,
  reporter:row.reporter,
  ...extras,
 });

 const listReports=(status='open')=>{
  const rows=status==='all'
   ?db.prepare('SELECT * FROM reports ORDER BY id DESC LIMIT 200').all()
   :db.prepare("SELECT * FROM reports WHERE status=? ORDER BY id DESC LIMIT 200").all(status==='closed'?'closed':'open');
  return rows.map(r=>publicReport(r));
 };

 const resolveReport=(resolver,id,body={},hooks={})=>{
  const row=findReport.get(id);
  if(!row)fail('举报不存在',404);
  if((row.status||'open')!=='open')fail('该举报已处理',409);
  const action=body.action;
  if(!['dismiss','remove_target'].includes(action))fail('请选择驳回或下架/删除对象');
  const note=typeof body.note==='string'?body.note.trim().slice(0,300):'';
  let effect='none';
  if(action==='remove_target'){
   if(row.target_type==='item'){
    const itemId=Number(row.target_id);
    if(!Number.isInteger(itemId)||!hooks.removeItem)fail('无法下架该物品',409);
    hooks.removeItem(itemId);
    effect='item_removed';
   }else if(row.target_type==='conversation'){
    const conversationId=Number(row.target_id);
    if(!Number.isInteger(conversationId)||!hooks.removeConversation)fail('无法删除该会话',409);
    hooks.removeConversation(conversationId);
    effect='conversation_removed';
   }else fail('用户举报请选择驳回，并另行人工处理账号');
  }
  const resolvedAt=new Date().toISOString();
  updateReport.run('closed',note||null,resolvedAt,resolver,id);
  audit(resolver,'report_resolve',{id,action,effect,targetType:row.target_type,targetId:row.target_id});
  return publicReport({...row,status:'closed',note:note||null,resolved_at:resolvedAt,resolver},{effect,action});
 };

 const cleanup=()=>{
  const now=Date.now();
  const chatCut=new Date(now-chatDays*86400000).toISOString();
  const tradeCut=new Date(now-tradeDays*86400000).toISOString();
  const auditCut=new Date(now-auditDays*86400000).toISOString();
  let messages=0,conversations=0,trades=0,audits=0;
  try{
   const msg=db.prepare('DELETE FROM chat_messages WHERE created_at<?').run(chatCut);
   messages=msg.changes||0;
   const empty=db.prepare('DELETE FROM conversations WHERE id NOT IN (SELECT DISTINCT conversation_id FROM chat_messages) AND created_at<?').run(chatCut);
   conversations=empty.changes||0;
   db.prepare('DELETE FROM chat_reads WHERE conversation_id NOT IN (SELECT id FROM conversations)').run();
   const rs=db.prepare('SELECT id,body FROM trade_requests').all();
   for(const row of rs){
    const r=JSON.parse(row.body);
    if(['completed','cancelled','declined','expired','disputed'].includes(r.status)&&r.created_at&&r.created_at<tradeCut){
     db.prepare('DELETE FROM trade_requests WHERE id=?').run(row.id);
     trades+=1;
    }
   }
   audits=db.prepare('DELETE FROM audit_log WHERE at<?').run(auditCut).changes||0;
  }catch(e){console.error('retention cleanup failed',e);}
  if(messages||conversations||trades||audits)audit('system','retention_cleanup',{messages,conversations,trades,audits,chatDays,tradeDays,auditDays});
  return {messages,conversations,trades,audits,chatDays,tradeDays,auditDays};
 };

 return {
  audit,storePhoto,removePhoto,photoPath,photoDir,
  blockedPair,block,unblock,listBlocks:(actor)=>listBlocks.all(actor),
  report,listReports,resolveReport,isSteward,
  cleanup,
  policy:{chatDays,tradeDays,auditDays,stewardConfigured:stewardNames.size>0},
 };
}
