import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expireRequests,createRequest,actOnRequest,availability,normalizeCampus} from '../shared/market.js';
test('expiry, cancellation and disputes do not become reuse outcomes',()=>{
 const now=Date.now(),items=[{id:1,owner:'seller',price:0}],rs=[];
 const create=buyer=>createRequest(items,rs,buyer,{itemId:1,meetingAt:new Date(now+3600000).toISOString(),place:'公共区域',safetyConfirmed:true},now);
 const r=create('buyer');expireRequests(rs,now+3600001);assert.equal(r.status,'expired');assert.equal(availability(items[0],rs),'available');
 const r2=create('buyer');actOnRequest(rs,'seller',r2.id,{action:'accept'});actOnRequest(rs,'buyer',r2.id,{action:'cancel'});assert.equal(availability(items[0],rs),'available');
 const r3=create('buyer');actOnRequest(rs,'seller',r3.id,{action:'accept'});actOnRequest(rs,'buyer',r3.id,{action:'issue'});assert.equal(r3.status,'disputed');assert.equal(availability(items[0],rs),'reserved');assert.throws(()=>actOnRequest(rs,'seller',r3.id,{action:'confirm',confirmed:true}));
 assert.equal(normalizeCampus('本部'),'校本部');assert.notEqual(normalizeCampus('南校区'),normalizeCampus('新校区'));
});
