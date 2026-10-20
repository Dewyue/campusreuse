import React, {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Search,ChevronDown,ChevronRight,ArrowLeft,MapPin,Heart,House,Compass,Plus,MessageCircle,UserRound,BookOpen,Headphones,Armchair,Bike,Shirt,X,Check,Leaf,Package,ArrowUpRight,Camera,LoaderCircle,Bell,Send} from 'lucide-react';
import {motion, useReducedMotion} from 'motion/react';
import * as Dialog from '@radix-ui/react-dialog';
import {campuses, normalizeCampus} from '../shared/market.js';
import {Publish,Meeting,Trades} from './TradeViews.jsx';
import {ChatContact,ChatInbox,ChatThread} from './Chat';
import CampusFolders from './CampusFolders.jsx';
import './style.css';

let session=localStorage.getItem('campus-session');
if(!session){session=crypto.randomUUID();localStorage.setItem('campus-session',session);}
let token=localStorage.getItem('campus-token')||'';
const API=import.meta.env.VITE_API_BASE||'/api';
const preview=import.meta.env.MODE==='preview';
async function api(path,options={}){if(preview){const {previewApi}=await import('./preview-api.js');return previewApi(path,options);}const headers={'Content-Type':'application/json',...options.headers};if(token)headers.Authorization='Bearer '+token;else headers['X-Demo-Session']=session;const response=await fetch(API+path,{...options,headers});const body=await response.json();if(!response.ok)throw Error(body.error||'网络连接失败');return body;}
function AuthForm({busy,onSubmit}){
 const [mode,setMode]=useState('register'),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[accepted,setAccepted]=useState(false);
 const canSubmit=username.trim()&&password.length>=8&&(mode==='login'||accepted);
 return <form className="auth-form" onSubmit={e=>{e.preventDefault();if(!canSubmit)return;onSubmit(mode,{username:username.trim(),password,privacyAccepted:mode==='register'?accepted:undefined});}}>
  <p className="demo-notice">自创账号即可，不核验学号。密码至少 8 位。请勿填写真实手机号或证件信息。</p>
  <div className="profile-tabs auth-tabs">{[['register','注册'],['login','登录']].map(([v,l])=><button type="button" key={v} className={mode===v?'active':''} onClick={()=>setMode(v)}>{l}</button>)}</div>
  <label>账号<input value={username} autoComplete="username" onChange={e=>setUsername(e.target.value)} placeholder="2–20 位汉字、字母或数字"/></label>
  <label>密码<input type="password" value={password} autoComplete={mode==='register'?'new-password':'current-password'} onChange={e=>setPassword(e.target.value)} placeholder="至少 8 位"/></label>
  {mode==='register'&&<label className="consent-row"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>我已阅读并同意 <a href="/privacy.html" target="_blank" rel="noopener noreferrer">隐私说明</a></span></label>}
  <button className="primary" disabled={busy||!canSubmit} type="submit">{mode==='register'?'创建账号并登录':'登录'}</button>
 </form>;
}
function AccountTools({busy,onDelete,onExport}){
 const [open,setOpen]=useState(false),[password,setPassword]=useState('');
 return <div className="danger-zone">
  <button type="button" className="text-button" disabled={busy} onClick={onExport}>导出我的数据</button>
  <p className="demo-notice">可下载账号、发布、收藏、面交与聊天摘要（JSON）。聊天默认保留约 90 天。</p>
  {!open?<><button type="button" className="text-button danger" disabled={busy} onClick={()=>setOpen(true)}>注销账号</button><p className="demo-notice">注销后将删除你的发布、收藏、面交记录与私信，且不可恢复。</p></>:
  <form onSubmit={e=>{e.preventDefault();onDelete(password);}}>
   <p className="demo-notice">请输入当前密码确认注销。此操作不可撤销。</p>
   <label>确认密码<input type="password" value={password} autoComplete="current-password" onChange={e=>setPassword(e.target.value)} placeholder="当前密码"/></label>
   <div className="danger-actions">
    <button type="button" className="text-button" disabled={busy} onClick={()=>{setOpen(false);setPassword('');}}>取消</button>
    <button type="submit" className="danger-button" disabled={busy||password.length<8}>确认注销</button>
   </div>
  </form>}
 </div>;
}
function ReportDesk({api,busy,setBusy,notice}){
 const [tab,setTab]=useState('open'),[rows,setRows]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const load=async(status=tab)=>{
  setLoading(true);setError('');
  try{setRows(await api('/steward/reports?status='+status));}
  catch(e){setError(e.message);setRows([]);}
  finally{setLoading(false);}
 };
 useEffect(()=>{load(tab);},[tab]);
 const act=async(id,action)=>{
  if(busy)return;
  if(action==='remove_target'&&!window.confirm('确认下架/删除被举报对象？此操作不可恢复。'))return;
  setBusy(true);
  try{
   await api('/steward/reports/'+id,{method:'PATCH',body:JSON.stringify({action})});
   notice(action==='dismiss'?'已驳回该举报':'已处理并移除对象');
   await load(tab);
  }catch(e){notice(e.message);}
  finally{setBusy(false);}
 };
 return <section className="report-desk" aria-label="举报处理">
  <div className="page-title" style={{paddingTop:28}}><h1 style={{fontSize:20}}>举报处理</h1></div>
  <p className="demo-notice">值守可见。驳回仅结案；「下架/删除」会移除被举报的商品或会话。</p>
  <div className="profile-tabs">{[['open','待处理'],['closed','已处理'],['all','全部']].map(([v,l])=>
   <button key={v} type="button" className={tab===v?'active':''} onClick={()=>setTab(v)}>{l}</button>)}</div>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {loading?<p className="demo-notice">加载中…</p>:!rows.length?<p className="demo-notice">暂无举报</p>:rows.map(r=>
   <article key={r.id} className="report-card">
    <div className="trade-status"><b>{r.status==='open'?'待处理':'已处理'}</b><span>{r.targetType==='item'?'商品':r.targetType==='conversation'?'会话':'用户'} · #{r.id}</span></div>
    <p><strong>{r.targetLabel||r.targetId}</strong>{r.targetGone?'（已不存在）':''}</p>
    <p className="demo-notice">{r.reason}</p>
    <p className="demo-notice">{new Date(r.createdAt).toLocaleString('zh-CN')}{r.resolvedAt?' · 结案 '+new Date(r.resolvedAt).toLocaleString('zh-CN'):''}</p>
    {r.status==='open'&&<div className="trade-actions">
     <button type="button" disabled={busy} onClick={()=>act(r.id,'dismiss')}>驳回</button>
     {r.targetType!=='user'&&!r.targetGone&&<button type="button" className="primary" disabled={busy} onClick={()=>act(r.id,'remove_target')}>下架/删除对象</button>}
    </div>}
   </article>)}
 </section>;
}
const categories=[['书籍',BookOpen,'书籍教材','#fff2d3'],['数码',Headphones,'数码好物','#e2eeff'],['生活',Armchair,'宿舍生活','#fce3df'],['运动',Bike,'运动户外','#e0efd9'],['穿搭',Shirt,'穿搭配饰','#ede4f7']];
function Picture({item,...props}){return !item.photo&&item.image==='placeholder'?<div className="placeholder"><Package size={40}/><span>暂无实物照片</span></div>:<img src={item.photo||'/images/'+item.image} alt={item.title} {...props}/>;}
function App(){
 const reduced=useReducedMotion();
 const [conversation,setConversation]=useState(null);
 const [items,setItems]=useState([]),[me,setMe]=useState({favorites:[],published:[],reservations:[],incoming:[]}),[page,setPage]=useState('home'),[q,setQ]=useState(''),[search,setSearch]=useState(''),[campus,setCampus]=useState(()=>normalizeCampus(localStorage.getItem('campus-filter')||'')),[category,setCategory]=useState(''),[sort,setSort]=useState('new'),[free,setFree]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[sheet,setSheet]=useState(''),[detail,setDetail]=useState(null),[toast,setToast]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[profileTab,setProfileTab]=useState('published');
 const [tradeTab,setTradeTab]=useState('outgoing'),[account,setAccount]=useState(null);
 useEffect(()=>{localStorage.setItem('campus-filter',campus);},[campus]);
 useEffect(()=>{if(preview||!token)return;api('/account').then(setAccount).catch(()=>{token='';localStorage.removeItem('campus-token');});},[]);
 const toastTimer=useRef(),closeRef=useRef(),opener=useRef();
 const notice=message=>{setToast(message);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),3600);};
 const refreshMe=()=>api('/me').then(setMe);
 useEffect(()=>{refreshMe().catch(e=>setError(e.message));},[]);
 useEffect(()=>{if(!['messages','profile'].includes(page))return;let active=true;const sync=()=>api('/me').then(data=>{if(active)setMe(data);}).catch(e=>{if(active)notice(e.message);});sync();const timer=page==='messages'?setInterval(sync,15000):null;return()=>{active=false;if(timer)clearInterval(timer);};},[page]);
 useEffect(()=>{let active=true;setLoading(true);setError('');const params=new URLSearchParams({q:search,campus,category,sort,free:String(free),available:'true'});api('/items?'+params).then(x=>{if(active)setItems(x);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[search,campus,category,sort,free,revision]);
 const favorite=async item=>{if(needAccount()||busy)return;setBusy(true);try{const saved=!me.favorites.includes(item.id);await api('/favorites/'+item.id,{method:'PUT',body:JSON.stringify({saved})});await refreshMe();notice(saved?'已放进你的收藏夹':'已取消收藏');}catch(e){notice(e.message);}finally{setBusy(false);}};
 const deleteItem=async item=>{if(!item?.isMine||busy)return;if(!window.confirm('下架并删除「'+item.title+'」？照片与相关沟通也会一并清除。'))return;setBusy(true);try{await api('/items/'+item.id,{method:'DELETE'});await refreshMe();setRevision(x=>x+1);setDetail(null);setSheet('');notice('物品已删除');}catch(e){notice(e.message);}finally{setBusy(false);}};
 const actOnTrade=async(id,body)=>{setBusy(true);try{await api('/reservations/'+id,{method:'PATCH',body:JSON.stringify(body)});await refreshMe();setRevision(x=>x+1);notice('面交记录已更新');}catch(e){notice(e.message);}finally{setBusy(false);}};
 const currentRequest=detail?me.reservations.find(r=>r.item_id===detail.id&&['pending','accepted','completed','disputed'].includes(r.status)):null;
 const completedCount=[...me.reservations,...(me.incoming||[])].filter(r=>r.status==='completed').length;
 const navigate=p=>{if(p==='profile'&&page!=='profile')setProfileTab('published');setPage(p);window.scrollTo({top:0});};
 const remember=data=>{token=data.token;localStorage.setItem('campus-token',token);setAccount(data.user);};
 const signIn=async(mode,body)=>{setBusy(true);try{const data=await api(mode==='register'?'/register':'/login',{method:'POST',body:JSON.stringify(body)});remember(data);try{setAccount(await api('/account'));}catch{}await refreshMe();setRevision(x=>x+1);notice(mode==='register'?'账号已创建':'已登录');}catch(e){notice(e.message);}finally{setBusy(false);}};
 const signOut=async()=>{setBusy(true);try{await api('/logout',{method:'POST'});}catch{}token='';localStorage.removeItem('campus-token');setAccount(null);await refreshMe().catch(()=>{});notice('已退出登录');setBusy(false);};
 const deleteAccount=async password=>{setBusy(true);try{await api('/account/delete',{method:'POST',body:JSON.stringify({password})});token='';localStorage.removeItem('campus-token');setAccount(null);setMe({favorites:[],published:[],reservations:[],incoming:[]});setRevision(x=>x+1);notice('账号已注销');}catch(e){notice(e.message);}finally{setBusy(false);}};
 const exportData=async()=>{if(busy)return;setBusy(true);try{const data=await api('/account/export');const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='campusreuse-export.json';a.click();URL.revokeObjectURL(url);notice('已下载个人数据');}catch(e){notice(e.message);}finally{setBusy(false);}};
 const reportTarget=async(targetType,targetId)=>{if(needAccount()||busy)return;const reason=window.prompt('请填写举报原因（4–300 字）');if(reason===null)return;setBusy(true);try{await api('/reports',{method:'POST',body:JSON.stringify({targetType,targetId:String(targetId),reason})});notice('举报已提交，感谢反馈');}catch(e){notice(e.message);}finally{setBusy(false);}};
 const blockPeer=async peerId=>{if(needAccount()||busy||!peerId)return;if(!window.confirm('拉黑后双方将无法继续沟通或预约，确认？'))return;setBusy(true);try{await api('/blocks/'+peerId,{method:'PUT',body:JSON.stringify({blocked:true})});notice('已拉黑该用户');}catch(e){notice(e.message);}finally{setBusy(false);}};
 const needAccount=()=>{if(account||preview)return false;navigate('profile');notice('请先登录或注册');return true;};
 const reset=()=>{setSearch('');setQ('');setCategory('');setCampus('');setFree(false);setSort('new');};

 const cards=list=><div className="product-grid">{list.map((item,index)=>
  <motion.article className="product" key={item.id} initial={{opacity:0,y:reduced?0:8}} animate={{opacity:1,y:0}} transition={{duration:reduced?0:0.25,delay:reduced?0:Math.min(index,3)*0.035}}>
   <div className="product-visual">
    <button className="product-open image-button" aria-label={'查看'+item.title} onClick={()=>setDetail(item)}>
     <div className="product-image"><Picture item={item} loading={index<2?'eager':'lazy'}/></div>
    </button>
    <motion.button whileTap={reduced?undefined:{scale:0.9}} className={'save '+(me.favorites.includes(item.id)?'saved':'')} title="收藏商品" aria-label={(me.favorites.includes(item.id)?'取消收藏':'收藏')+item.title} aria-pressed={me.favorites.includes(item.id)} disabled={busy} onClick={()=>favorite(item)}><Heart size={18} strokeWidth={1.6}/></motion.button>
   </div>
   <button className="product-open product-copy" onClick={()=>setDetail(item)}>
    <div className="item-meta"><span>{item.availability==='completed'?'已交接':item.availability==='reserved'?'已预约':item.condition}</span><span>{item.category}</span></div>
    <h3>{item.title}</h3>
    <div className="price-line"><span className={'price '+(item.price===0?'free-price':'')}>{item.price===0?'免费领走':<><small>¥</small>{item.price.toLocaleString('zh-CN')}</>}</span></div>
   </button>
   <div className="seller"><span className="avatar" style={{background:item.color}}>{item.avatar}</span><span>{item.seller}</span></div>
   <div className="location">{item.campus}<span>·</span>校内面交</div>
  </motion.article>)}</div>;
 const home=<>
  <header className="market-header">
   <div className="topline"><div className={'campus-status '+(campus?'is-local':'is-all')} role="status" aria-live="polite" aria-atomic="true"><MapPin size={20} aria-hidden="true"/><strong key={campus||'all'}>{campus||'全部校区'}</strong></div></div>
   <div className="brand-row"><div><h1 className="brand" tabIndex={-1}>中南闲集<span>.</span></h1></div></div>
   <form className="search" onSubmit={e=>{e.preventDefault();setSearch(q.trim());}}><Search size={18} strokeWidth={1.7}/><input value={q} onChange={e=>setQ(e.target.value)} aria-label="搜索校园闲置" placeholder="搜索校园闲置"/>{q&&<button type="button" className="clear-search" aria-label="清空搜索" onClick={()=>{setQ('');setSearch('');}}><X size={15}/></button>}<button type="submit" aria-label="搜索" className="search-submit"><ArrowUpRight size={20}/></button></form>
  </header>
  <section className="category-row" aria-label="商品分类">
   <button aria-pressed={!category} className={!category?'chosen':''} onClick={()=>setCategory('')}><span><Compass size={25} strokeWidth={1.45}/></span>全部</button>
   {categories.map(([value,Icon])=><button key={value} aria-pressed={category===value} className={category===value?'chosen':''} onClick={()=>setCategory(category===value?'':value)}><span><Icon size={25} strokeWidth={1.45}/></span>{value}</button>)}
  </section>
  <section className="feed">
   <div className="section-heading"><h2>{search?'搜索结果':category?category:free?'免费赠送':'闲置物品'}</h2></div>
   <div className="feed-tabs"><div role="tablist" aria-label="商品排序">{[['new','最新发布'],['price','价格从低到高']].map(([v,label])=><button role="tab" aria-selected={sort===v} className={sort===v?'active':''} key={v} onClick={()=>setSort(v)}>{sort===v&&<motion.span className="segment-indicator" layoutId="sort-indicator" transition={{duration:reduced?0:0.2}}/>}<span>{label}</span></button>)}</div><label className="free-toggle"><input type="checkbox" checked={free} onChange={e=>setFree(e.target.checked)}/><Leaf size={13}/><span>免费送</span></label></div>
   {(category||campus||search)&&<div className="active-filters"><span>{[campus,category,search&&'“'+search+'”'].filter(Boolean).join(' · ')}</span><button onClick={()=>{reset();if(campus){notice('已切换为全部校区');window.scrollTo({top:0,behavior:reduced?'instant':'smooth'});}}}>清除<X size={12}/></button></div>}
   {loading?<div className="loading"><LoaderCircle className="spin"/>正在加载…</div>:error?<div className="empty"><p>{error}</p><button className="primary" onClick={()=>setRevision(x=>x+1)}>重新加载</button></div>:items.length?cards(items):<div className="empty"><Search size={32}/><h3>暂无匹配物品</h3><p>换个关键词，或看看其他校区</p><button className="primary" onClick={reset}>看看全部</button></div>}
  </section>
 </>;
 const profile=<section className="subpage"><div className="page-title"><h1>我的闲集</h1></div>{!preview&&!account?<AuthForm busy={busy} onSubmit={signIn}/>:<><div className="profile"><div className="large-avatar">{(account?.username||'我').slice(0,1)}</div><div><h2>{account?.username||'校园体验者'}</h2><p>{account?'已登录 · 未核验学号':'身份未认证 · 课程演示'} · <a href="/privacy.html" target="_blank" rel="noopener noreferrer">隐私说明</a></p></div>{account&&<button className="text-button" disabled={busy} onClick={signOut}>退出</button>}</div><div className="stats"><div><b>{me.published.length}</b>我发布的</div><div><b>{me.favorites.length}</b>我的收藏</div><div><b>{completedCount}</b>已确认交接</div></div><div className="profile-tabs">{[['published','我的发布'],['favorites','我的收藏']].map(([v,l])=><button className={profileTab===v?'active':''} onClick={()=>setProfileTab(v)} key={v}>{l}</button>)}</div><ProfileItems mode={profileTab} me={me} render={cards}/>{account?.steward&&<ReportDesk api={api} busy={busy} setBusy={setBusy} notice={notice}/>}{account&&<AccountTools busy={busy} onDelete={deleteAccount} onExport={exportData}/>}</>}</section>;
 const messages=<section className="subpage"><ChatInbox api={api} enabled={Boolean(account)} preview={preview} onLogin={()=>navigate('profile')} onOpen={c=>{setConversation(c);setDetail(null);setSheet('chat');}}/><div className="page-title"><h1>面交安排</h1></div><p className="demo-notice">请求不等于预约成功。实际验货后，双方分别确认交接；平台不托管资金。</p><div className="profile-tabs">{[['outgoing','我想要的'],['incoming','我发布的']].map(([v,label])=><button key={v} className={tradeTab===v?'active':''} onClick={()=>setTradeTab(v)}>{label}</button>)}</div><Trades records={tradeTab==='outgoing'?me.reservations:(me.incoming||[])} busy={busy} onAction={actOnTrade} onItem={setDetail} chat={{api,enabled:Boolean(account),preview,onLogin:()=>navigate('profile'),onOpen:c=>{setConversation(c);setDetail(null);setSheet('chat');}}}/></section>;
 const discover=<CampusFolders onSelect={c=>{reset();setCampus(c);navigate('home');requestAnimationFrame(()=>document.querySelector('.brand')?.focus({preventScroll:true}));}}/>;
 return <div className="app-shell"><main>{page==='home'?home:page==='profile'?profile:page==='messages'?messages:discover}</main><nav className="bottom-nav" aria-label="主导航">{[['home',House,'首页'],['discover',Compass,'逛校园'],['publish',Plus,'卖闲置'],['messages',MessageCircle,'面交'],['profile',UserRound,'我的']].map(([v,Icon,label])=><button key={v} aria-current={page===v?'page':undefined} className={`${page===v?'selected ':''}${v==='publish'?'publish-nav':''}`} onClick={()=>v==='publish'?(needAccount()?null:setSheet('publish')):navigate(v)}><span><Icon size={v==='publish'?27:23} strokeWidth={page===v?2.5:1.7}/></span><small>{label}</small></button>)}</nav>{toast&&<div className="toast" role="status">{toast}</div>}<Dialog.Root open={Boolean(sheet||detail)} onOpenChange={open=>{if(!open){setSheet('');setDetail(null);}}}><Dialog.Portal><Dialog.Overlay className="overlay"/><Dialog.Content className={'modal '+(detail?'detail-modal':'')} aria-describedby={undefined} onOpenAutoFocus={e=>{opener.current=document.activeElement;e.preventDefault();closeRef.current?.focus();}} onCloseAutoFocus={e=>{e.preventDefault();opener.current?.focus();}}><div className="modal-top"><Dialog.Title asChild><h2>{sheet==='chat'?'买卖沟通':sheet==='meeting'?'约定面交':detail?'物品详情':sheet==='publish'?'发布闲置':''}</h2></Dialog.Title><button ref={closeRef} aria-label="关闭" onClick={()=>{setSheet('');setDetail(null);}}><X size={22}/></button></div>{sheet==='chat'&&conversation?<ChatThread key={conversation.id} api={api} conversation={conversation} requests={me.reservations} onMeeting={item=>{setDetail(item);setSheet('meeting');}} onDeleted={()=>{setConversation(null);setSheet('');notice('会话已删除');}} onReport={()=>reportTarget('conversation',conversation.id)} onBlock={()=>blockPeer(conversation.peerId)}/>:sheet==='meeting'&&detail?<Meeting item={detail} busy={busy} submit={async body=>{if(needAccount())return;setBusy(true);try{await api('/reservations',{method:'POST',body:JSON.stringify(body)});await refreshMe();setRevision(x=>x+1);setDetail(null);setSheet('');setTradeTab('outgoing');navigate('messages');notice('面交请求已记录，等待卖家确认');}catch(e){notice(e.message);}finally{setBusy(false);}}}/>:detail?<><div className="detail-photo"><Picture item={detail}/></div><div className="detail-content"><div className="detail-price"><span className="price"><small>¥</small>{detail.price}</span>{detail.original&&<del>原价 ¥{detail.original}</del>}<span>{detail.condition}</span></div><h2>{detail.title}</h2><div className="detail-location"><MapPin size={15}/>{detail.campus} · 校内面交</div><dl className="item-facts"><div><dt>功能情况</dt><dd>{detail.functionStatus||'待卖家补充'}</dd></div><div><dt>已知瑕疵</dt><dd>{detail.defects||'尚未披露，请先核实'}</dd></div><div><dt>面交地点</dt><dd>{detail.pickupPlace||'待双方约定公共地点'}</dd></div><div><dt>可约时段</dt><dd>{detail.pickupWindow||'待双方商量'}</dd></div></dl><p className="demo-notice">品相与功能为发布者自述，不代表专业质检。请核对型号、版次、附件和已知瑕疵。</p><div className="detail-seller"><span className="avatar" style={{background:detail.color}}>{detail.avatar}</span><b>{detail.seller}</b><span>未认证 · 演示</span></div><p className="description">{detail.description||'卖家暂未填写详细描述。'}</p><div className="safety"><Leaf size={18}/><div><b>面交安全</b><p>请在公共场所当面验货，不预付定金。勿交换手机号或微信号。</p></div></div>{!detail.isMine&&!detail.isDemo&&<button type="button" className="text-button danger" disabled={busy} onClick={()=>reportTarget('item',detail.id)}>举报此物品</button>}</div><ChatContact key={detail.id} api={api} item={detail} enabled={Boolean(account)} preview={preview} onLogin={()=>{setDetail(null);setSheet('');navigate('profile');}} onOpen={c=>{setConversation(c);setDetail(null);setSheet('chat');}}/><div className="detail-actions">{detail.isMine?<button className="detail-save danger-outline" disabled={busy} onClick={()=>deleteItem(detail)}>下架删除</button>:<button className="detail-save" disabled={busy} onClick={()=>favorite(detail)}><Heart size={21} fill={me.favorites.includes(detail.id)?'#f35b43':'none'}/>{me.favorites.includes(detail.id)?'已收藏':'收藏'}</button>}<button className="primary" disabled={busy||detail.isMine||(!currentRequest&&detail.availability!=='available')} onClick={()=>{if(needAccount())return;if(currentRequest){setDetail(null);setSheet('');setTradeTab('outgoing');navigate('messages');}else setSheet('meeting');}}>{detail.isMine?'这是你发布的物品':currentRequest?'查看面交记录':detail.availability==='completed'?'已完成交接':detail.availability==='reserved'?'已有面交安排':'我想要 · 约定面交'}</button></div></>:sheet==='publish'?<Publish busy={busy} submit={async values=>{setBusy(true);try{await api('/items',{method:'POST',body:JSON.stringify(values)});await refreshMe();reset();setRevision(x=>x+1);setSheet('');navigate('profile');setProfileTab('published');notice('闲置已发布到演示集市');}catch(e){notice(e.message);}finally{setBusy(false);}}}/>:null}</Dialog.Content></Dialog.Portal></Dialog.Root></div>;
}
function ProfileItems({mode,me,render}){const [all,setAll]=useState([]),[failed,setFailed]=useState(false);useEffect(()=>{let alive=true;api('/items').then(x=>{if(alive)setAll(x);}).catch(()=>{if(alive)setFailed(true);});return()=>{alive=false;};},[me]);const data=mode==='published'?me.published:all.filter(i=>me.favorites.includes(i.id));return failed?<div className="empty">暂时无法加载，请刷新重试</div>:data.length?render(data):<div className="empty"><Package size={34}/><p>{mode==='published'?'还没有发布闲置':'暂无收藏'}</p></div>;}
createRoot(document.getElementById('root')).render(<App/>);
