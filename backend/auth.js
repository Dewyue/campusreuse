import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';

const USERNAME=/^[\u4e00-\u9fffA-Za-z0-9_]{2,20}$/;
const TOKEN_MS=30*24*60*60*1000;

export function validateUsername(value){
 const username=typeof value==='string'?value.trim():'';
 if(!USERNAME.test(username))throw Object.assign(new Error('账号为 2–20 位汉字、字母、数字或下划线'),{status:400});
 return username;
}
export function validatePassword(value){
 if(typeof value!=='string'||value.length<8||value.length>72)throw Object.assign(new Error('密码为 8–72 个字符'),{status:400});
 return value;
}
function hashPassword(password){
 const salt=randomBytes(16);
 return salt.toString('hex')+':'+scryptSync(password,salt,64).toString('hex');
}
function verifyPassword(password,stored){
 const [salt,hash]=String(stored||'').split(':');
 if(!salt||!hash)return false;
 const actual=scryptSync(password,Buffer.from(salt,'hex'),64);
 const expected=Buffer.from(hash,'hex');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
function publicUser(row){return {id:row.id,username:row.username,createdAt:row.created_at};}
function nowIso(){return new Date().toISOString();}
function expiryIso(from=Date.now()){return new Date(from+TOKEN_MS).toISOString();}
export function newToken(){return randomBytes(32).toString('hex');}
export function readToken(req){
 const header=req.get('authorization')||'';
 const bearer=header.match(/^Bearer\s+([a-f0-9]{64})$/i);
 if(bearer)return bearer[1];
 const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('campus_token='));
 return cookie?cookie.slice('campus_token='.length):'';
}
export function tokenCookie(token,{secure=false,clear=false}={}){
 const parts=clear
  ?['campus_token=','Max-Age=0']
  :[`campus_token=${token}`,`Max-Age=${Math.floor(TOKEN_MS/1000)}`];
 parts.push('Path=/','HttpOnly','SameSite=Lax');
 if(secure)parts.push('Secure');
 return parts.join('; ');
}

export function createAuth(db){
 db.exec(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
 ); CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
 );`);
 const insertUser=db.prepare('INSERT INTO users(username,password_hash,created_at) VALUES (?,?,?)');
 const findUserByName=db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE');
 const findUserById=db.prepare('SELECT * FROM users WHERE id=?');
 const insertSession=db.prepare('INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES (?,?,?,?)');
 const findSession=db.prepare('SELECT user_id,expires_at FROM sessions WHERE token=?');
 const deleteSession=db.prepare('DELETE FROM sessions WHERE token=?');
 const deleteExpired=db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')");

 const issue=(userId)=>{
  deleteExpired.run();
  const token=newToken();
  const created=nowIso();
  insertSession.run(token,userId,created,expiryIso(Date.parse(created)));
  return token;
 };

 const deleteSessionsForUser=db.prepare('DELETE FROM sessions WHERE user_id=?');
 const deleteUser=db.prepare('DELETE FROM users WHERE id=?');

 return {
  register(body){
   if(body?.privacyAccepted!==true)throw Object.assign(new Error('请先阅读并同意隐私说明'),{status:400});
   const username=validateUsername(body?.username);
   const password=validatePassword(body?.password);
   if(findUserByName.get(username))throw Object.assign(new Error('该账号已被注册'),{status:409});
   const created=nowIso();
   let row;
   try{row=insertUser.run(username,hashPassword(password),created);}
   catch{throw Object.assign(new Error('该账号已被注册'),{status:409});}
   const user=publicUser({id:Number(row.lastInsertRowid),username,created_at:created});
   return {token:issue(user.id),user};
  },
  login(body){
   const username=validateUsername(body?.username);
   const password=validatePassword(body?.password);
   const row=findUserByName.get(username);
   if(!row||!verifyPassword(password,row.password_hash))throw Object.assign(new Error('账号或密码不正确'),{status:401});
   return {token:issue(row.id),user:publicUser(row)};
  },
  userFromToken(token){
   if(!token)return null;
   deleteExpired.run();
   const session=findSession.get(token);
   if(!session||Date.parse(session.expires_at)<=Date.now()){if(session)deleteSession.run(token);return null;}
   const row=findUserById.get(session.user_id);
   return row?publicUser(row):null;
  },
  logout(token){if(token)deleteSession.run(token);},
  assertPassword(userId,password){
   const value=validatePassword(password);
   const row=findUserById.get(userId);
   if(!row||!verifyPassword(value,row.password_hash))throw Object.assign(new Error('密码不正确，无法注销'),{status:401});
  },
  deleteAccount(userId){
   deleteSessionsForUser.run(userId);
   deleteUser.run(userId);
  },
 };
}
