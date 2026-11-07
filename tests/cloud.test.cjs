const assert = require('node:assert/strict');
const {test}=require('node:test');
const {writeCloudLibrary}=require('../lib/cloud.ts');
const {createLibrary}=require('../lib/library.ts');
const library=createLibrary([{id:'root',text:'test',color:'green',x:0,y:0}]);
test('cloud writes workspace before dependent maps, scopes both to owner',async()=>{
 const calls=[];
 const client={from(table){return {async upsert(rows,options){calls.push({table,rows,options});return {error:null};}};}};
 await writeCloudLibrary(client,'owner-a',library);
 assert.deepEqual(calls.map(c=>c.table),['workspaces','mindmaps']);
 assert.ok(calls.every(c=>c.rows.every(r=>r.owner_id==='owner-a')));
 assert.equal(calls[1].rows[0].workspace_id,calls[0].rows[0].id);
 assert.deepEqual(calls[1].rows[0].content.nodes,library.maps[0].nodes);
});
test('workspace failures prevent map writes and are surfaced',async()=>{
 const calls=[]; const failure=new Error('permission denied');
 const client={from(table){calls.push(table);return {async upsert(){return {error:failure};}};}};
 await assert.rejects(writeCloudLibrary(client,'owner-a',library),failure);
 assert.deepEqual(calls,['workspaces']);
});
test('map write failures are not reported as success',async()=>{
 const client={from(table){return {async upsert(){return {error:table==='mindmaps'?new Error('network error'):null};}};}};
 await assert.rejects(writeCloudLibrary(client,'owner-a',library),/network error/);
});
