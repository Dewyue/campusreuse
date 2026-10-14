export const campuses=['南校区','新校区','校本部','铁道校区','湘雅新校区','湘雅老校区'];
export const categories=['书籍','数码','生活','运动','穿搭'];
export const conditions=['近全新','轻微使用痕迹','明显使用痕迹'];
export const functions=['功能正常','部分功能异常'];
export const statusLabels={pending:'待卖家确认',accepted:'待当面交接',completed:'双方已确认交接',cancelled:'已取消',declined:'未达成预约',expired:'预约已过期',legacy:'旧意向，尚未约定面交',disputed:'交付有分歧'};
export const normalizeCampus=c=>c==='本部'?'校本部':c;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const text=(x,max)=>typeof x==='string'&&x.trim().length>0&&x.trim().length<=max;
export function validatePhoto(photo){
 if(typeof photo!=='string'||photo.length>1500000||!/^data:image\/(jpeg|png|webp);base64,/.test(photo))fail('请上传 1 MB 内的 JPG、PNG 或 WebP 实物照片');
 let bytes;try{bytes=atob(photo.split(',')[1]);}catch{fail('照片格式无效');}
 if(bytes.length>1048576)fail('照片不能超过 1 MB');
 const mime=photo.slice(5,photo.indexOf(';'));
 if(!(mime==='image/png'&&bytes.startsWith('\x89PNG\r\n\x1a\n')||mime==='image/jpeg'&&bytes.startsWith('\xff\xd8\xff')||mime==='image/webp'&&bytes.startsWith('RIFF')&&bytes.slice(8,12)==='WEBP'))fail('照片内容与格式不匹配');
}
export function validateListing(body){
 if(!text(body.title,60)||!text(body.description,1000)||typeof body.price!=='number'||!Number.isFinite(body.price)||body.price<0||body.price>100000||!categories.includes(body.category)||!campuses.includes(normalizeCampus(body.campus)))fail('请补全名称、描述、价格、分类和校区');
 if(!conditions.includes(body.condition)||!functions.includes(body.functionStatus)||!text(body.defects,300)||!text(body.pickupPlace,80)||!text(body.pickupWindow,80))fail('请补全品相、功能、瑕疵和面交安排');
 if(body.disclosureConfirmed!==true)fail('请确认已如实披露物品信息');
 validatePhoto(body.photo);
 return {title:body.title.trim(),description:body.description.trim(),price:Math.round(body.price*100)/100,category:body.category,campus:normalizeCampus(body.campus),condition:body.condition,functionStatus:body.functionStatus,defects:body.defects.trim(),pickupPlace:body.pickupPlace.trim(),pickupWindow:body.pickupWindow.trim(),photo:body.photo};
}
export function expireRequests(requests,now=Date.now()){
 for(const r of requests){const time=Date.parse(r.meetingAt);if(r.status==='pending'&&time<=now||r.status==='accepted'&&!r.buyerConfirmed&&!r.sellerConfirmed&&time+86400000<=now)r.status='expired';}
}
export function availability(item,requests){
 const states=requests.filter(r=>r.item_id===item.id).map(r=>r.status);
 return states.includes('completed')?'completed':states.some(s=>['accepted','disputed'].includes(s))?'reserved':'available';
}
export function publicItem(item,requests,actor){
 const {owner,...data}=item;
 return {...data,campus:normalizeCampus(item.campus),isMine:owner===actor,isDemo:!owner,availability:availability(item,requests),seller:owner?(owner===actor?'我':(item.seller||'校园发布者')):item.seller};
}
export function publicRequest(r,items,requests,actor){
 const {buyer,seller,...safe}=r;
 return {...safe,role:buyer===actor?'buyer':'seller',item:publicItem(items.find(i=>i.id===r.item_id),requests,actor)};
}
export function createRequest(items,requests,actor,body,now=Date.now()){
 const item=items.find(i=>i.id===body.itemId);if(!item)fail('商品不存在',404);
 if(item.owner===actor)fail('不能预约自己发布的物品');
 const existing=requests.find(r=>r.item_id===item.id&&r.buyer===actor&&['pending','accepted','completed','disputed'].includes(r.status));if(existing)return existing;
 if(availability(item,requests)!=='available')fail('物品已被预约或完成交接',409);
 const time=Date.parse(body.meetingAt);
 if(!text(body.place,80)||!Number.isFinite(time)||time<=now||time>now+30*86400000||body.safetyConfirmed!==true)fail('请填写未来 30 天内的时间、公共面交地点并确认面交约定');
 const record={id:Math.max(0,...requests.map(r=>r.id))+1,item_id:item.id,buyer:actor,seller:item.owner||'demo-seller-'+item.id,created_at:new Date(now).toISOString(),status:'pending',meetingAt:new Date(time).toISOString(),place:body.place.trim(),buyerConfirmed:false,sellerConfirmed:false,agreedPrice:item.price,evidence:null};
 requests.push(record);return record;
}
export function actOnRequest(requests,actor,id,body){
 const r=requests.find(r=>r.id===id);if(!r)fail('面交记录不存在',404);
 const role=r.buyer===actor?'buyer':r.seller===actor?'seller':null;if(!role)fail('无权操作这条记录',403);
 const {action}=body;
 if(action==='accept'){
  if(role!=='seller')fail('只有卖家能确认预约',403);
  if(r.status!=='pending')fail('这条请求已不能接受',409);
  if(requests.some(x=>x.id!==id&&x.item_id===r.item_id&&['accepted','completed','disputed'].includes(x.status)))fail('物品已有其他交接安排',409);
  r.status='accepted';for(const other of requests)if(other.id!==id&&other.item_id===r.item_id&&other.status==='pending'){other.status='declined';other.reason='卖家已确认其他预约';}
 }else if(action==='decline'){
  if(role!=='seller')fail('只有卖家能婉拒请求',403);if(r.status!=='pending')fail('当前状态不能婉拒',409);r.status='declined';
 }else if(action==='cancel'){
  if(!['pending','accepted','legacy'].includes(r.status)||r.buyerConfirmed||r.sellerConfirmed)fail('当前不能取消；已交接有分歧时请记录分歧',409);r.status='cancelled';
 }else if(action==='confirm'){
  if(r.status==='completed')return r;
  if(r.status!=='accepted'||body.confirmed!==true)fail('请在实际验货与交接后确认',409);
  r[role+'Confirmed']=true;
  if(r.buyerConfirmed&&r.sellerConfirmed){r.status='completed';r.completedAt=new Date().toISOString();}
 }else if(action==='issue'){
  if(r.status!=='accepted')fail('当前状态不能记录交付分歧',409);r.status='disputed';
 }else if(action==='evidence'){
  if(role!=='buyer'||r.status!=='completed')fail('仅买家可在双方确认交接后补充再使用记录',403);
  const e=body.evidence;
  if(!e||!['buy_new','buy_used','not_buy','unknown'].includes(e.alternative)||!['walk','bike','bus','car','unknown'].includes(e.travelMode)||!Number.isFinite(e.extraKm)||e.extraKm<0||e.extraKm>1000||!Number.isFinite(e.expectedMonths)||e.expectedMonths<=0||e.expectedMonths>240)fail('请补全替代购买情况、出行方式、额外往返里程和预计使用月数');
  r.evidence={alternative:e.alternative,travelMode:e.travelMode,extraKm:e.extraKm,expectedMonths:e.expectedMonths,recordedAt:new Date().toISOString(),carbonStatus:'not_calculated'};
 }else fail('不支持的操作');
 return r;
}
