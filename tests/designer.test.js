import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDesigns } from '../src/designer.js';
import { boxInsidePolygon, boxesOverlap, orientInward } from '../src/geometry.js';
import { STYLES } from '../src/catalog.js';

const rect = (w, h) => orientInward([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]);
const lShape = orientInward([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 5 }, { x: 0, y: 5 }]);
const rooms = {
  rect: { points: rect(4.5, 3.8), openings: [{ type: 'door', wall: 3, t: 0.7, width: 0.85 }, { type: 'window', wall: 0, t: 2.2, width: 1.4 }], height: 2.5 },
  small: { points: rect(3, 3.2), openings: [{ type: 'door', wall: 2, t: 0.6, width: 0.8 }, { type: 'window', wall: 0, t: 1.5, width: 1.0 }], height: 2.5 },
  L: { points: lShape, openings: [{ type: 'door', wall: 5, t: 4, width: 0.9 }, { type: 'window', wall: 0, t: 2.5, width: 1.6 }], height: 2.5 },
};

for (const [rn, room] of Object.entries(rooms)) {
  for (const roomType of ['living', 'bedroom', 'office', 'dining']) {
    test(`${rn} ${roomType}`, () => {
      const ds = generateDesigns(room, { roomType, style: 'scandinavian', seed: 3, iterations: 30 });
      assert.ok(ds.length >= 1);
      const d = ds[0];
      assert.ok(d.items.length >= 3, `only ${d.items.length} items`);
      for (const it of d.items) assert.ok(boxInsidePolygon(it, room.points, 0.01), `${it.type} outside room`);
      const solid = d.items.filter((i) => !i.flat);
      for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i], b = solid[j];
        if (a.parent === b.id || b.parent === a.id || (a.parent && a.parent === b.parent)) continue;
        assert.ok(!boxesOverlap(a, b), `${a.type} overlaps ${b.type}`);
      }
      assert.ok(d.wallItems.some((w) => w.type === 'frame' || w.type === 'shelf' || w.type === 'mirror'), 'no wall decor');
      assert.ok(d.items.some((i) => i.type.startsWith('plant')), 'no plants');
      console.log(rn, roomType, 'rating', d.rating, d.metrics, d.items.map((i) => i.type).join(','), '| wall:', d.wallItems.map((w) => w.type).join(','));
    });
  }
}

test('all styles run', () => {
  for (const style of Object.keys(STYLES)) assert.ok(generateDesigns(rooms.rect, { roomType: 'living', style, iterations: 5 }).length);
});

import { naeemBedroom } from '../src/presets.js';
test('naeem keep-furniture', () => {
  const room = naeemBedroom();
  const ds = generateDesigns(room, { roomType: 'bedroom', style: 'scandinavian', keep: true, iterations: 20 });
  const d = ds[0];
  assert.equal(d.items.filter((i) => i.fixed).length, 6);
  assert.ok(d.wallItems.some((w) => w.type === 'bike'));
  console.log('naeem', d.rating, d.metrics, d.items.map((i) => i.type).join(','), '|', d.wallItems.filter((w) => !w.fixed).map((w) => w.type).join(','));
  console.log(d.notes.join('\n'));
});

test('carpet: no rug in bedroom, flat-weave in living room', () => {
  const base = rooms.rect;
  const carpet = { ...base, floor: { type: 'carpet', color: '#b9ad9a' } };
  const bed = generateDesigns(carpet, { roomType: 'bedroom', style: 'boho', iterations: 10 })[0];
  assert.ok(!bed.items.some((i) => i.type === 'rug'));
  assert.ok(bed.notes.some((n) => n.startsWith('Carpeted floor')));
  const liv = generateDesigns(carpet, { roomType: 'living', style: 'boho', iterations: 10 })[0];
  const rug = liv.items.find((i) => i.type === 'rug');
  assert.ok(!rug || (rug.w <= 2.0 && rug.d <= 1.4));
  const naeem = generateDesigns(naeemBedroom(), { roomType: 'bedroom', style: 'scandinavian', keep: true, iterations: 10 })[0];
  assert.ok(!naeem.items.some((i) => i.type === 'rug'));
});

test('naeem: re-planned frames spread out with breathing room', () => {
  const room = naeemBedroom();
  const d = generateDesigns(room, { roomType: 'bedroom', style: 'scandinavian', keep: true, rethinkGallery: true, iterations: 10 })[0];
  const frames = d.wallItems.filter((w) => w.type === 'frame');
  const walls = new Set(frames.map((f) => f.wall));
  console.log('rethink', frames.map((f) => `${f.wall}:${f.name}`).join(' | '));
  console.log(d.notes.filter((n) => /wall:|Not hung/.test(n)).join('\n'));
  assert.ok(walls.size >= 2, 'frames on at least two walls');
  assert.ok(frames.length < 10, 'not every frame hung');
  assert.ok(d.wallItems.some((w) => (w.type === 'shelf' || w.type === 'mirror') && w.group === 'Your frames'), 'non-frame element mixed in');
  console.log('feng shui', d.fengShui.score, d.fengShui.checks.map((c) => `${c.status}:${c.title}`).join(' | '));
});

test('feng shui mode avoids coffin position for a fresh bedroom', () => {
  for (const r of Object.values(rooms)) {
    const d = generateDesigns(r, { roomType: 'bedroom', style: 'japandi', fengShui: true, iterations: 30 })[0];
    const bad = d.fengShui.checks.filter((c) => c.status === 'bad').map((c) => c.title);
    console.log('fs', d.fengShui.score, bad);
    assert.ok(!bad.includes('Feet point at the door ("coffin position")'));
  }
});

test('include picker: closet means no wardrobe; bedroom gets dresser + desk with laptop', () => {
  const room = { ...rooms.rect, openings: [...rooms.rect.openings, { type: 'door', swing: 'none', label: 'Closet', wall: 1, t: 0.6, width: 0.8 }] };
  const d = generateDesigns(room, { roomType: 'bedroom', style: 'scandinavian', iterations: 20 })[0];
  const types = d.items.map((i) => i.type);
  assert.ok(!types.includes('wardrobe'), 'no wardrobe with a closet');
  assert.ok(types.includes('dresser') && types.includes('desk'), 'dresser and desk');
  assert.ok(d.topItems.some((t) => t.type === 'laptop'), 'laptop on desk');
  const none = generateDesigns(room, { roomType: 'bedroom', style: 'scandinavian', iterations: 10, include: ['nightstands'] })[0];
  assert.ok(!none.items.some((i) => ['desk', 'dresser', 'rug'].includes(i.type) || i.type.startsWith('plant')), 'only chosen items');
  assert.ok(!none.wallItems.some((w) => w.type === 'frame' || w.type === 'shelf'), 'no frames/shelves when unchecked');
  const noCloset = generateDesigns(rooms.rect, { roomType: 'bedroom', style: 'scandinavian', iterations: 20 })[0];
  console.log('no closet:', noCloset.items.map((i) => i.type).join(','));
});
