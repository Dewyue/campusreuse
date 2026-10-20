import {useEffect,useRef,useState,type MouseEvent as ReactMouseEvent} from 'react';
import {ChevronRight,MapPin,MessageCircle,Send} from 'lucide-react';
import type {ChatApi,ChatItem,ChatMessage,Conversation,MessagePage} from '../shared/chat';

const errorText=(e:unknown)=>e instanceof Error?e.message:'网络连接失败，请重试';
export function ChatContact({api,item,enabled,preview,onOpen,onLogin,requestId}:{api:ChatApi;item:ChatItem;enabled:boolean;preview:boolean;onOpen:(c:Conversation)=>void;onLogin:()=>void;requestId?:number}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const open=async()=>{
    if(!enabled){onLogin();return;}
    setBusy(true);setError('');
    try{onOpen(await api<Conversation>('/conversations',{method:'POST',body:JSON.stringify(requestId?{requestId}:{itemId:item.id})}));}
    catch(e){setError(errorText(e));}finally{setBusy(false);}
  };
  return <div className="chat-contact"><button disabled={busy||preview||item.isDemo||(!requestId&&item.isMine)} onClick={()=>void open()}><MessageCircle size={19}/>{busy?'正在连接…':requestId?'联系对方':'联系卖家'}</button>
    {(preview||item.isDemo)&&<small>{preview?'单机预览暂不可在线沟通':'样例物品没有真实卖家'}</small>}
    {error&&<p role="alert" className="form-error">{error}</p>}</div>;
}
export function ChatInbox({api,enabled,preview,onOpen,onLogin}:{api:ChatApi;enabled:boolean;preview:boolean;onOpen:(c:Conversation)=>void;onLogin:()=>void}){
  const [threads,setThreads]=useState<Conversation[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busyId,setBusyId]=useState<number|null>(null);
  useEffect(()=>{
    if(!enabled||preview)return;
    let active=true,timer:ReturnType<typeof setTimeout>;
    const sync=async()=>{
      try{if(!document.hidden){const result=await api<Conversation[]>('/conversations');if(active){setThreads(result);setError('');}}}
      catch(e){if(active)setError(errorText(e));}
      finally{if(active){setLoading(false);timer=setTimeout(sync,4000);}}
    };
    void sync();return()=>{active=false;clearTimeout(timer);};
  },[enabled,preview,api]);
  const remove=async(c:Conversation,e:ReactMouseEvent)=>{
    e.stopPropagation();
    if(busyId||!window.confirm('删除与「'+c.peer+'」关于「'+c.item.title+'」的会话？聊天记录将不可恢复。'))return;
    setBusyId(c.id);setError('');
    try{await api('/conversations/'+c.id,{method:'DELETE'});setThreads(list=>list.filter(x=>x.id!==c.id));}
    catch(err){setError(errorText(err));}
    finally{setBusyId(null);}
  };
  return <section className="chat-inbox" aria-label="买卖沟通"><h2>沟通</h2>
    {preview?<p className="demo-notice">当前为单机预览，在线沟通需连接服务器。</p>:!enabled?<button className="chat-login" onClick={onLogin}>登录后查看消息<ChevronRight size={18}/></button>:<>
    <p className="demo-notice">请勿在聊天中发送手机号、微信号或宿舍房间号；面交请选校内公共地点。</p>
    {error&&<p role="alert" className="form-error">{error}</p>}
    {loading?<p className="chat-empty">正在加载消息…</p>:!threads.length?<p className="chat-empty">暂无会话</p>:threads.map(c=>
      <div key={c.id} className="chat-inbox-row">
        <button type="button" className="chat-inbox-open" onClick={()=>onOpen(c)}>
          <MessageCircle size={22}/><span><b>{c.peer}<small>{c.role==='buyer'?'卖家':'买家'}</small></b><strong>{c.item.title}</strong><span>{c.lastText}</span></span>
          {c.unread>0&&<em aria-label={c.unread+'条未读消息'}>{c.unread>99?'99+':c.unread}</em>}<ChevronRight size={18}/>
        </button>
        <button type="button" className="chat-delete" disabled={busyId===c.id} onClick={e=>void remove(c,e)}>删除</button>
      </div>)}</>}
  </section>;
}

export function ChatThread({api,conversation,onMeeting,onDeleted,onReport,onBlock,requests}:{api:ChatApi;conversation:Conversation;onMeeting:(item:ChatItem)=>void;onDeleted?:()=>void;onReport?:()=>void;onBlock?:()=>void;requests:Array<{item_id:number;status:string}>}){
  const [messages,setMessages]=useState<ChatMessage[]>([]),[text,setText]=useState(''),[place,setPlace]=useState(''),[showPlace,setShowPlace]=useState(false);
  const [error,setError]=useState(''),[syncError,setSyncError]=useState(''),[sending,setSending]=useState(false),[loading,setLoading]=useState(true),[removing,setRemoving]=useState(false);
  const scroll=useRef<HTMLDivElement>(null),cursor=useRef(0),syncing=useRef(false),lastRead=useRef(0);
  const draft=useRef<{kind:string;text:string;id:string}|null>(null),alive=useRef(true);
  const meeting=(item:ChatItem)=>{
    if(requests.some(r=>r.item_id===item.id&&['pending','accepted','completed','disputed'].includes(r.status))){
      setError('已有面交记录，不能重复预约。待确认或未交接的请求需取消后才能重新约定地点。');return;
    }
    onMeeting(item);
  };
  const append=(rows:ChatMessage[])=>{
    const el=scroll.current,nearBottom=!el||el.scrollHeight-el.scrollTop-el.clientHeight<100;
    setMessages(old=>[...new Map([...old,...rows].map(m=>[m.id,m])).values()].sort((a,b)=>a.id-b.id));
    if(nearBottom)requestAnimationFrame(()=>{if(scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;});
  };
  useEffect(()=>{
    alive.current=true;
    let active=true,timer:ReturnType<typeof setTimeout>;
    const sync=async()=>{
      if(!active)return;
      if(!document.hidden&&!syncing.current){
        syncing.current=true;
        try{
          let more=true;
          while(more&&active){
            const page=await api<MessagePage>('/conversations/'+conversation.id+'/messages?after='+cursor.current);
            if(!active)return;
            if(page.messages.length){append(page.messages);cursor.current=page.messages.at(-1)!.id;}
            more=page.hasMore;
          }
          if(cursor.current>lastRead.current&&!document.hidden){
            const readTo=cursor.current;
            await api('/conversations/'+conversation.id+'/read',{method:'POST',body:JSON.stringify({lastId:readTo})});
            lastRead.current=readTo;
          }
          if(active)setSyncError('');
        }catch(e){if(active)setSyncError(errorText(e));}
        finally{syncing.current=false;if(active)setLoading(false);}
      }
      if(active)timer=setTimeout(sync,2500);
    };
    void sync();return()=>{active=false;alive.current=false;clearTimeout(timer);};
  },[api,conversation.id]);
  const send=async(kind:'text'|'place')=>{
    const value=(kind==='text'?text:place).trim();
    if(!value||sending)return;
    const request=draft.current?.kind===kind&&draft.current.text===value?draft.current:{kind,text:value,id:crypto.randomUUID()};
    draft.current=request;setSending(true);setError('');
    try{
      const m=await api<ChatMessage>('/conversations/'+conversation.id+'/messages',{method:'POST',body:JSON.stringify({kind,text:value,clientId:request.id})});
      if(!alive.current)return;
      append([m]);draft.current=null;
      if(kind==='text')setText('');else{setPlace('');setShowPlace(false);}
    }catch(e){if(alive.current)setError(errorText(e));}
    finally{if(alive.current)setSending(false);}
  };
  const removeThread=async()=>{
    if(removing||!window.confirm('删除此会话及全部消息？不可恢复。'))return;
    setRemoving(true);setError('');
    try{await api('/conversations/'+conversation.id,{method:'DELETE'});onDeleted?.();}
    catch(e){setError(errorText(e));setRemoving(false);}
  };
  return <section className="chat-thread" aria-label={'与'+conversation.peer+'的会话'}>
    <div className="chat-context"><div><b>{conversation.peer}</b><span>{conversation.item.title}</span><small>{conversation.item.campus} · ¥{conversation.item.price}</small></div>
      <div className="chat-moderation">
        {onReport&&<button type="button" className="chat-delete" onClick={onReport}>举报</button>}
        {onBlock&&conversation.peerId&&<button type="button" className="chat-delete" onClick={onBlock}>拉黑</button>}
        <button type="button" className="chat-delete" disabled={removing} onClick={()=>void removeThread()}>删除会话</button>
      </div></div>
    <p className="demo-notice">勿发手机号、微信号或宿舍号；约在图书馆、食堂等公共地点面交。</p>
    <div className="chat-history" ref={scroll} role="log" aria-label="聊天记录">
      {loading&&!messages.length?<p className="chat-empty">正在加载消息…</p>:!messages.length?<p className="chat-empty">暂无消息</p>:messages.map(m=>
        <article key={m.id} className={'chat-message '+(m.mine?'is-mine':'')}>
          <div>{m.kind==='place'&&<b className="chat-place-label"><MapPin size={16}/>建议面交地点</b>}<p>{m.text}</p>
          {m.kind==='place'&&conversation.role==='buyer'&&<button className="chat-use-place" onClick={()=>meeting({...conversation.item,pickupPlace:m.text})}>用此地点约面交<ChevronRight size={16}/></button>}</div>
          <time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}</time>
        </article>)}
    </div>
    {(error||syncError)&&<p role="alert" className="form-error">{error||syncError}</p>}
    <div className="chat-tools"><button type="button" aria-expanded={showPlace} onClick={()=>setShowPlace(v=>!v)}><MapPin size={17}/>建议地点</button>
      {conversation.role==='buyer'&&<button type="button" onClick={()=>meeting(conversation.item)}>约定面交<ChevronRight size={17}/></button>}</div>
    {showPlace&&<form className="chat-place-form" onSubmit={e=>{e.preventDefault();void send('place');}}>
      <label>公共面交地点<input value={place} onChange={e=>setPlace(e.target.value)} maxLength={80} required placeholder="例如：图书馆正门" disabled={sending}/></label>
      <button type="submit" className="primary" disabled={sending||!place.trim()}>发送地点</button>
    </form>}
    <form className="chat-compose" onSubmit={e=>{e.preventDefault();void send('text');}}>
      <textarea aria-label="消息内容" value={text} onChange={e=>setText(e.target.value)} maxLength={1000} rows={2} placeholder="发送消息，勿填微信或手机号" disabled={sending}/>
      <button type="submit" title="发送消息" aria-label="发送消息" disabled={sending||!text.trim()}><Send size={21}/></button>
    </form>
  </section>;
}
