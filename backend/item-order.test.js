import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sortItems} from '../shared/item-order.js';

test('listing order uses publication order or price, never demo promotion scores',()=>{
 const items=[{id:1,price:5,featured:1,wish:999},{id:3,price:5},{id:2,price:0}];
 for(const mode of [undefined,'new','recommend','unknown'])assert.deepEqual(sortItems([...items],mode).map(i=>i.id),[3,2,1]);
 assert.deepEqual(sortItems([...items],'price').map(i=>i.id),[2,3,1]);
});
