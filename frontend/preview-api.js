import {items as seed} from '../backend/seed.js';
import {sortItems} from '../shared/item-order.js';
import {normalizeCampus,validateListing,publicItem,publicRequest,expireRequests,createRequest,actOnRequest} from '../shared/market.js';
const key='csu-market-preview-v1',actor='local-preview-buyer';
function read(){try{const value=JSON.parse(localStorage.getItem(key));if(value&&Array.isArray(value.published)&&Array.isArray(value.favorites)&&Array.isArray(value.reservations))return value;}catch{}return {published:[],favorites:[],reservations:[]};}
export async function previewApi(path,options={}){
 const state=read(),url=new URL(path,'https://preview.invalid'),method=options.method||'GET',body=options.body?JSON.parse(options.body):{};
 state.published=state.published.map(i=>({...i,owner:i.owner||actor}));
 state.reservations=state.reservations.map((r,n)=>r.status?r:{...r,id:n+1,buyer:actor,seller:'demo-seller-'+r.item_id,status:'legacy',buyerConfirmed:false,sellerConfirmed:false});
 const items=[...seed,...state.published],rs=state.reservations;
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(state));}catch{throw Error('浏览器存储空间不足，未保存此次操作；请减少照片大小');}};
 expireRequests(rs);
 if(url.pathname==='/me'){save();return {favorites:state.favorites,published:state.published.map(i=>publicItem(i,rs,actor)),reservations:rs.filter(r=>r.buyer===actor).slice().reverse().map(r=>publicRequest(r,items,rs,actor)),incoming:rs.filter(r=>r.seller===actor).slice().reverse().map(r=>publicRequest(r,items,rs,actor))};}
 if(url.pathname==='/items'&&method==='GET'){
  let result=items.map(i=>publicItem(i,rs,actor));const p=url.searchParams;
  if(p.get('q'))result=result.filter(i=>(i.title+' '+i.description).toLocaleLowerCase().includes(p.get('q').toLocaleLowerCase()));
  if(p.get('campus'))result=result.filter(i=>i.campus===normalizeCampus(p.get('campus')));
  if(p.get('category'))result=result.filter(i=>i.category===p.get('category'));
  if(p.get('free')==='true')result=result.filter(i=>i.price===0);
  if(p.get('available')==='true')result=result.filter(i=>i.availability==='available');
  sortItems(result,p.get('sort'));
  return result;
 }
 if(url.pathname==='/items'&&method==='POST'){
  const clean=validateListing(body);const item={...clean,id:Math.max(...items.map(i=>i.id))+1,image:'placeholder',seller:'校园发布者',avatar:'同',color:'#e3ecf4',tag:'新发布',wish:0,owner:actor};state.published.push(item);save();return publicItem(item,rs,actor);
 }
 if(url.pathname.startsWith('/favorites/')&&method==='PUT'){
  const id=Number(url.pathname.split('/').at(-1));if(!items.some(i=>i.id===id))throw Error('商品不存在');state.favorites=state.favorites.filter(x=>x!==id);if(body.saved)state.favorites.push(id);save();return {saved:body.saved};
 }
 if(url.pathname==='/reservations'&&method==='POST'){const r=createRequest(items,rs,actor,body);save();return publicRequest(r,items,rs,actor);}
 if(url.pathname.startsWith('/reservations/')&&method==='PATCH'){const r=actOnRequest(rs,actor,Number(url.pathname.split('/').at(-1)),body);save();return publicRequest(r,items,rs,actor);}
 throw Error('预览暂不支持此操作');
}
