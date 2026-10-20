import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertNoSensitive} from '../shared/sensitive.js';

test('sensitive scanner blocks contact and dorm leaks',()=>{
 assert.equal(assertNoSensitive('图书馆正门','地点'),'图书馆正门');
 for(const text of ['电话13812345678','加我微信 wxid_campus12','QQ:12345678','宿舍3栋201对面','南校区寝室 2 号床']){
  assert.throws(()=>assertNoSensitive(text,'测试'),e=>e.status===400);
 }
});
