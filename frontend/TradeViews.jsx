import React,{useState} from 'react';
import {ChatContact} from './Chat';
import {Camera,MapPin,Clock,Leaf,ChevronRight,CircleX} from 'lucide-react';
import {campuses,categories,conditions,functions as functionStates,statusLabels,validatePhoto} from '../shared/market.js';

export function Publish({submit,busy}){
 const [photo,setPhoto]=useState(''),[error,setError]=useState(''),[reading,setReading]=useState(false);
 const upload=async e=>{const file=e.target.files?.[0];setPhoto('');setError('');if(!file)return;setReading(true);try{
  if(file.size>1048576)throw Error('请选择 1 MB 内的照片');
  const value=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('照片读取失败'));reader.readAsDataURL(file);});
  validatePhoto(value);const img=new Image();img.src=value;await img.decode();setPhoto(value);
 }catch(err){setError(err.message||'照片无法读取');e.target.value='';}finally{setReading(false);}};
 return <form className="publish-form" onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);submit({...Object.fromEntries(d),photo,price:Number(d.get('price')),disclosureConfirmed:d.get('disclosureConfirmed')==='on'});}}>
  <label className="photo-field">实物照片{photo&&<img src={photo} alt="待发布物品照片"/>}<input aria-label="实物照片" type="file" accept="image/jpeg,image/png,image/webp" required onChange={upload}/><span>JPG、PNG 或 WebP，最多 1 MB；不含证件或个人隐私。</span></label>
  {error&&<p className="form-error" role="alert">{error}</p>}
  <label>宝贝名称<input name="title" required maxLength={60} placeholder="例如：高等数学第七版，上下册"/></label>
  <label>物品说明<textarea name="description" required maxLength={1000} rows={3} placeholder="型号或版次、附件、使用情况、转手原因"/></label>
  <div className="form-row"><label>价格（元）<input name="price" type="number" required min="0" max="100000" step="0.01" placeholder="免费送填 0"/></label><label>分类<select aria-label="分类" name="category" required><option value="">请选择</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label></div>
  <div className="form-row"><label>品相<select aria-label="品相" name="condition" required><option value="">请选择</option>{conditions.map(c=><option key={c}>{c}</option>)}</select></label><label>功能情况<select aria-label="功能情况" name="functionStatus" required><option value="">请选择</option>{functionStates.map(c=><option key={c}>{c}</option>)}</select></label></div>
  <label>已知瑕疵<textarea name="defects" required maxLength={300} rows={2} placeholder="具体写出划线、缺页、维修、故障等；没有则填无已知瑕疵"/></label>
  <label>物品所在校区<select aria-label="物品所在校区" name="campus" required><option value="">请选择</option>{campuses.map(c=><option key={c}>{c}</option>)}</select></label>
  <label>建议面交地点<input name="pickupPlace" required maxLength={80} placeholder="校内公共地点，如图书馆正门；勿填宿舍号"/></label>
  <label>可面交时段<input name="pickupWindow" required maxLength={80} placeholder="例如：工作日 17:00—19:00"/></label>
  <label className="consent"><input name="disclosureConfirmed" type="checkbox" required/><span>物品归我所有，照片与描述属实，已披露已知瑕疵；未写入手机号、微信号或证件信息。</span></label>
  <p className="demo-notice">课程演示，未接入学校身份认证、专业质检或资金托管。禁止发布违禁物品、证件、账号；描述与地点中不要填写手机、微信或宿舍房间号。</p>
  <button className="primary" disabled={busy||reading||!photo}>{busy?'正在发布…':reading?'读取照片中…':'发布闲置'}</button>
 </form>;
}

export function Meeting({item,busy,submit}){
 return <form className="publish-form" onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);submit({itemId:item.id,place:d.get('place'),meetingAt:new Date(d.get('meetingAt')).toISOString(),safetyConfirmed:d.get('safetyConfirmed')==='on'});}}>
  <h3>{item.title}</h3><p className="meeting-campus"><MapPin size={15}/>{item.campus} · {item.price===0?'免费赠送':'标价 ¥'+item.price}</p>
  <p className="demo-notice">卖家可面交时段：{item.pickupWindow||'待双方商量'}。提交请求不代表卖家已接受，不收取预约金。</p>
  <label>建议面交地点<input name="place" required maxLength={80} defaultValue={item.pickupPlace||''} placeholder="双方可到达的校内公共地点"/></label>
  <label>建议面交时间<input name="meetingAt" type="datetime-local" required/></label>
  <label className="consent"><input name="safetyConfirmed" type="checkbox" required/><span>已核对校区和品相，将在公共场所当面验货后再决定是否交接，不预付定金。</span></label>
  {item.isDemo&&<p className="demo-notice">这是样例商品，没有真实卖家；请求仅用于演示，不会自动被接受。</p>}
  <button className="primary" disabled={busy}>{busy?'提交中…':'提交面交请求'}</button>
 </form>;
}

function Evidence({record,busy,submit}){
 const e=record.evidence||{};
 return <details className="evidence"><summary>{record.evidence?'查看或修改再使用记录':'补充再使用记录'}</summary><form onSubmit={event=>{event.preventDefault();const d=Object.fromEntries(new FormData(event.currentTarget));submit({action:'evidence',evidence:{...d,extraKm:Number(d.extraKm),expectedMonths:Number(d.expectedMonths)}});}}>
  <label>如果没有这次二手交易，你会<select aria-label="如果没有这次二手交易，你会" name="alternative" required defaultValue={e.alternative||''}><option value="">请选择实际情况</option><option value="buy_new">购买同类新品</option><option value="buy_used">购买其他二手物品</option><option value="not_buy">不购买</option><option value="unknown">不确定</option></select></label>
  <label>此次面交的主要出行方式<select aria-label="此次面交的主要出行方式" name="travelMode" required defaultValue={e.travelMode||''}><option value="">请选择</option><option value="walk">步行</option><option value="bike">自行车</option><option value="bus">公共交通</option><option value="car">汽车 / 网约车</option><option value="unknown">不确定</option></select></label>
  <div className="form-row"><label>额外往返里程（km）<input name="extraKm" type="number" min="0" max="1000" step="0.1" required defaultValue={e.extraKm??''}/></label><label>预计继续使用（月）<input name="expectedMonths" type="number" min="0.1" max="240" step="0.1" required defaultValue={e.expectedMonths??''}/></label></div>
  <p className="demo-notice">这是自报数据，不是减碳结果。还需核实替代率、寿命、清洁维修及排放因子，不将每笔二手交易等同于少生产一件新品。</p>
  <button className="primary" disabled={busy}>保存再使用记录</button>
 </form></details>;
}

function TradeCard({r,busy,onAction,onItem,chat}){
 const [confirmed,setConfirmed]=useState(false);const ownConfirmed=r.role==='buyer'?r.buyerConfirmed:r.sellerConfirmed;
 return <article className="trade-record"><div className="trade-status"><b>{statusLabels[r.status]||'待确认'}</b><span>{r.role==='buyer'?'我想要的':'我发布的'}</span></div>
  <button className="reservation" onClick={()=>onItem(r.item)}>{r.item.photo||r.item.image!=='placeholder'?<img src={r.item.photo||'/images/'+r.item.image} alt={r.item.title}/>:<Camera size={24}/>}<div><b>{r.item.title}</b><p>{r.item.campus} · {r.agreedPrice===0?'免费赠送':'约定价格 ¥'+(r.agreedPrice??r.item.price)}</p></div><ChevronRight size={17}/></button>
  {r.meetingAt&&<div className="meeting-facts"><p><Clock size={14}/>{new Date(r.meetingAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}</p><p><MapPin size={14}/>{r.place}</p></div>}
  {r.item.isDemo&&r.status==='pending'&&<p className="demo-notice">样例商品，无真实卖家响应。</p>}
  {chat&&<ChatContact {...chat} item={r.item} requestId={r.id}/>}
  {r.status==='pending'&&r.role==='seller'&&<div className="trade-actions"><button className="primary" disabled={busy} onClick={()=>onAction(r.id,{action:'accept'})}>接受面交</button><button disabled={busy} onClick={()=>onAction(r.id,{action:'decline'})}>暂不接受</button></div>}
  {r.status==='accepted'&&!ownConfirmed&&<><label className="consent"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>已核对物品情况，并且实际完成物品交接。</span></label><button className="primary" disabled={busy||!confirmed} onClick={()=>onAction(r.id,{action:'confirm',confirmed:true})}>确认实际交接</button></>}
  {r.status==='accepted'&&ownConfirmed&&<p className="demo-notice">你已确认交接，等待对方确认；此时尚不计入完成记录。</p>}
  {['pending','accepted','legacy'].includes(r.status)&&!r.buyerConfirmed&&!r.sellerConfirmed&&<div className="trade-cancel-row"><button className="cancel-request" disabled={busy} onClick={()=>onAction(r.id,{action:'cancel'})}><CircleX size={17} aria-hidden="true"/><span>取消本次请求</span></button></div>}
  {r.status==='accepted'&&<button className="text-action" disabled={busy} onClick={()=>onAction(r.id,{action:'issue'})}>记录交付分歧</button>}
  {r.status==='disputed'&&<p className="demo-notice">已暂停这件物品的后续预约，不计入完成记录。请双方核实并协商；本原型不提供客服仲裁。</p>}
  {r.status==='completed'&&<p className="reuse-status"><Leaf size={15}/>交接已记录 · 减碳待核算</p>}
  {r.status==='completed'&&r.role==='buyer'&&<Evidence record={r} busy={busy} submit={body=>onAction(r.id,body)}/>}
  {r.reason&&<p className="demo-notice">{r.reason}</p>}
 </article>;
}
export function Trades({records,busy,onAction,onItem,chat}){return records.length?records.map(r=><TradeCard key={r.id} r={r} busy={busy} onAction={onAction} onItem={onItem} chat={chat}/>):<div className="empty"><Clock size={32}/><h3>还没有面交安排</h3><p>请求经卖家确认后，才形成面交约定。</p></div>;}
