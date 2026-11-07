const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const assert = require('node:assert/strict');
const source = readFileSync('app/page.tsx', 'utf8');
const helpers = source.slice(source.indexOf('type NodeItem'), source.indexOf('function IconButton'));
const context = vm.createContext({});
vm.runInContext(stripTypeScriptTypes(helpers + '\nglobalThis.api = {initial, layoutMindmap, overlaps, reflowDrag, insertAndLayout, zoomAtPoint};'), context);
const { initial, layoutMindmap, overlaps, reflowDrag, insertAndLayout, zoomAtPoint } = context.api;
const deep = [...initial];
for (let i = 0; i < 12; i++) deep.push({id: `deep${i}`, parent: i ? `deep${i-1}` : 'a1', text: 'nested', kind: 'plain', x: 210, y: 30, pinned: true});
const arranged = layoutMindmap(deep);
for (let i = 0; i < arranged.length; i++) for (let j = i + 1; j < arranged.length; j++) assert.ok(!overlaps(arranged[i], arranged[j]), `${arranged[i].id} overlaps ${arranged[j].id}`);
for (let i = 0; i < 12; i++) {
 const child = arranged.find(n => n.id === `deep${i}`);
 const parent = arranged.find(n => n.id === child.parent);
 assert.ok(child.x < parent.x, 'deep descendants must extend outward');
}
assert.equal(JSON.stringify(layoutMindmap(arranged)), JSON.stringify(arranged), 'layout must be stable');
let growing = layoutMindmap(initial);
for (let i = 0; i < 60; i++) {
  const parent = growing[(i * 7) % growing.length];
  const before = JSON.stringify(growing);
  const next = context.api.insertAndLayout(growing, { id: `added${i}`, parent: parent.id, text: 'new', kind: i % 3 ? 'plain' : 'memo', color: 'blue', x: parent.x + 200, y: parent.y });
  assert.equal(JSON.stringify(growing), before, 'insertion must preserve the undo snapshot');
  for (let a = 0; a < next.length; a++) for (let b = a + 1; b < next.length; b++) assert.ok(!overlaps(next[a], next[b]), `insertion ${i}: overlapping nodes`);
  // Descendants of sibling branches must occupy disjoint vertical bands.
  const collect = id => next.filter(n => n.parent === id).flatMap(n => [n, ...collect(n.id)]);
  for (const branch of next.filter(n => n.parent)) {
    const siblings = next.filter(n => n.parent === branch.id).sort((a,b) => a.y-b.y);
    for (let j = 1; j < siblings.length; j++) {
      const upper = [siblings[j-1], ...collect(siblings[j-1].id)];
      const lower = [siblings[j], ...collect(siblings[j].id)];
      assert.ok(Math.max(...upper.map(n => n.y + (n.kind === 'plain' ? 32 : 46))) < Math.min(...lower.map(n => n.y)), 'sibling subtree bands must not cross');
    }
  }
  growing = next;
}
console.log('PASS: 60 mixed-depth insertions, subtree separation, immutable undo snapshots');

const offset = {x: 80, y: -45};
const point = {x: -130, y: 120};
const zoomed = zoomAtPoint(100, 180, offset, point);
for (const axis of ['x', 'y']) assert.ok(Math.abs((point[axis] - offset[axis]) / 100 - (point[axis] - zoomed.offset[axis]) / zoomed.zoom) < 1e-10, 'pointer anchor must remain fixed');
const restored = zoomAtPoint(zoomed.zoom, 100, zoomed.offset, point);
assert.ok(Math.abs(restored.offset.x-offset.x) < 1e-10 && Math.abs(restored.offset.y-offset.y) < 1e-10, 'zoom round trip');
assert.equal(zoomAtPoint(100, 0, offset, point).zoom, 20);
assert.equal(zoomAtPoint(100, 900, offset, point).zoom, 300);
assert.equal(zoomAtPoint(300, 900, offset, point).offset.x, offset.x, 'no movement at limit');
console.log('PASS: pointer anchored zoom, round trip, zoom limits');

const dragSource = layoutMindmap(initial);
const movingIds = new Set(['a','a1','a2','a3']);
const originalSnapshot = JSON.stringify(dragSource);
const near = dragSource.find(n => n.id === 'b');
const held = dragSource.find(n => n.id === 'a');
for (const [dx, dy] of [[0, near.y-held.y], [300, 120], [-1200,800], [0,0]]) {
 const result = reflowDrag(dragSource, movingIds, dx, dy);
 for (const node of result) {
   const original = dragSource.find(n => n.id === node.id);
   if (movingIds.has(node.id)) { assert.equal(node.x,original.x+dx); assert.equal(node.y,original.y+dy); }
 }
 for (let i=0;i<result.length;i++) for(let j=i+1;j<result.length;j++) assert.ok(!overlaps(result[i],result[j]), `drag overlaps: ${result[i].id}/${result[j].id}`);
 const branch = result.find(n=>n.id==='b');
 for (const id of ['b1','b2','b3']) {
  const child = result.find(n=>n.id===id); const original = dragSource.find(n=>n.id===id);
  assert.equal(child.y-branch.y, original.y-near.y, 'neighbor subtree keeps its geometry');
 }
 assert.equal(JSON.stringify(result),JSON.stringify(reflowDrag(dragSource,movingIds,dx,dy)), 'deterministic reflow');
}
assert.equal(JSON.stringify(dragSource),originalSnapshot,'drag must preserve undo snapshot');
const returned = reflowDrag(dragSource,movingIds,0,0);
assert.equal(JSON.stringify(returned), originalSnapshot,'returning pointer restores original layout');
console.log('PASS: drag follows pointer, neighbor spacing, branch geometry, deterministic reflow, immutable history, return to origin');
