// Feng shui checks and the bagua map.
//
// This follows the common Western ("BTB") approach: the bagua grid is laid over
// the room aligned with the wall that holds the main door. These are traditional
// guidelines, not science — the app shows them as suggestions.

import { v, add, sub, mul, dot, dist, norm, walls as wallsOf, interiorAngle, pointInPolygon, boxCorners } from './geometry.js';

export const BAGUA = [
  // row 0 = far from the door, row 2 = door wall. col 0 = left as you walk in.
  [
    { key: 'wealth', name: 'Wealth', element: 'Wood', colors: ['#5b2c83', '#3f7a4a'], tip: 'A healthy plant or something purple/green; keep it tidy.' },
    { key: 'fame', name: 'Fame', element: 'Fire', colors: ['#c0392b'], tip: 'Good light, a candle or warm lamp, art with red or triangles.' },
    { key: 'love', name: 'Love', element: 'Earth', colors: ['#e8a0a8'], tip: 'Pairs (two lamps, two frames), soft textures, pinks.' },
  ],
  [
    { key: 'family', name: 'Family', element: 'Wood', colors: ['#3f7a4a'], tip: 'Plants and family/friends photos; wood finishes.' },
    { key: 'health', name: 'Health (centre)', element: 'Earth', colors: ['#d8b25a'], tip: 'Keep open and uncluttered; earthy yellows, a round rug.' },
    { key: 'creativity', name: 'Creativity', element: 'Metal', colors: ['#e9e7e3'], tip: 'White or metal accents, your own art or projects.' },
  ],
  [
    { key: 'knowledge', name: 'Knowledge', element: 'Earth', colors: ['#2f5d8c'], tip: 'Books, a reading lamp, deep blues.' },
    { key: 'career', name: 'Career', element: 'Water', colors: ['#1f2b33'], tip: 'Keep the entry clear; black or wavy shapes, a mirror by the door (not facing the bed).' },
    { key: 'helpful', name: 'Helpful people & travel', element: 'Metal', colors: ['#9aa0a6'], tip: 'Travel photos or maps, grey/metal frames.' },
  ],
];

export function mainDoor(room) {
  const ds = (room.openings || []).filter((o) => o.type === 'door');
  return ds.find((d) => (!d.kind || d.kind === 'entry') && d.swing !== 'none' && d.swing !== 'slide') || ds.find((d) => d.swing !== 'none') || ds[0] || null;
}

/** Bagua frame: origin at door wall, u = left→right as you enter, w = into the room. */
export function baguaFrame(room) {
  const ws = wallsOf(room.points);
  const door = mainDoor(room);
  const wall = door ? ws[door.wall] : ws.slice().sort((a, b) => b.length - a.length)[0];
  if (!wall) return null;
  const n = wall.n; // into the room
  const right = v(-n.y, n.x); // your right hand when facing n (y-down coords)
  let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity;
  for (const p of room.points) {
    const r = sub(p, wall.a);
    const u = dot(r, right), w = dot(r, n);
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); w0 = Math.min(w0, w); w1 = Math.max(w1, w);
  }
  return { origin: wall.a, right, n, u0, u1, w0, w1, door, wall };
}

export function baguaZone(frame, p) {
  const r = sub(p, frame.origin);
  const u = (dot(r, frame.right) - frame.u0) / (frame.u1 - frame.u0);
  const w = (dot(r, frame.n) - frame.w0) / (frame.w1 - frame.w0);
  const col = Math.max(0, Math.min(2, Math.floor(u * 3)));
  const row = 2 - Math.max(0, Math.min(2, Math.floor(w * 3)));
  return BAGUA[row][col];
}

/** Corner polygons of the 9 cells in plan coordinates. */
export function baguaCells(frame) {
  const cells = [];
  const P = (u, w) => add(add(frame.origin, mul(frame.right, u)), mul(frame.n, w));
  const du = (frame.u1 - frame.u0) / 3, dw = (frame.w1 - frame.w0) / 3;
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const u = frame.u0 + col * du;
    const w = frame.w0 + (2 - row) * dw;
    cells.push({ zone: BAGUA[row][col], poly: [P(u, w), P(u + du, w), P(u + du, w + dw), P(u, w + dw)], center: P(u + du / 2, w + dw / 2) });
  }
  return cells;
}

const front = (b) => v(-Math.sin(b.theta), Math.cos(b.theta));
const rightOf = (b) => v(Math.cos(b.theta), Math.sin(b.theta));
const C = (b) => v(b.x, b.y);

function doorPos(room, door) {
  const w = wallsOf(room.points)[door.wall];
  return add(w.a, mul(w.dir, door.t));
}

/** Does a ray from p along dir hit box b within maxD? */
function rayHitsBox(p, dir, b, maxD = 8) {
  const corners = boxCorners(b);
  for (let s = 0; s <= maxD; s += 0.05) {
    const q = add(p, mul(dir, s));
    if (pointInPolygon(q, corners)) return true;
  }
  return false;
}

/** Would a mirror at t on wall reflect box b (within a ±20° cone)? */
export function mirrorSees(w, t, b) {
  const p = add(add(w.a, mul(w.dir, t)), mul(w.n, 0.05));
  for (const ang of [-0.35, -0.17, 0, 0.17, 0.35]) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const dir = v(w.n.x * c - w.n.y * s, w.n.x * s + w.n.y * c);
    if (rayHitsBox(p, dir, b)) return true;
  }
  return false;
}

/**
 * Feng shui report for a design.
 * @returns {{score:number, checks:{status:'good'|'warn'|'bad', title:string, detail:string, fix?:string}[], zones:any[]}}
 */
export function fengShuiReport(room, design) {
  const checks = [];
  const add_ = (status, title, detail, fix) => checks.push({ status, title, detail, fix });
  const ws = wallsOf(room.points);
  const door = mainDoor(room);
  const dpos = door ? doorPos(room, door) : null;
  const items = design?.items || [];
  const wallItems = design?.wallItems || [];
  const bed = items.find((i) => i.type === 'bed' || i.type === 'singleBed');
  const desk = items.find((i) => i.type === 'desk');

  if (bed && dpos) {
    const toDoor = norm(sub(dpos, C(bed)));
    const facing = dot(front(bed), toDoor);
    const doorWallN = ws[door.wall].n;
    // lateral offset between the bed's centre line and the door
    const lateral = dot(sub(dpos, C(bed)), rightOf(bed));
    const overlap = Math.max(0, Math.min(bed.w / 2, lateral + door.width / 2) - Math.max(-bed.w / 2, lateral - door.width / 2));
    const fix = 'If the bed can\'t move: put a bench, chest or solid footboard at the foot of the bed to block the line to the door.';
    if (facing > 0.1 && overlap <= 0.02) add_('good', 'Bed in the command position', 'From bed you can see the door on a diagonal, without lying in line with it.');
    else if (facing > 0.1 && overlap < door.width * 0.6) add_('warn', 'Bed partly in line with the door', `You can see the door from bed, but about ${Math.round(overlap / 0.0254)}" of the doorway lines up with the foot of the bed.`, fix);
    else if (facing > 0.1) add_('bad', 'Feet point at the door ("coffin position")', 'The foot of the bed lines up with the doorway — the placement feng shui most wants to avoid.', fix);
    else add_('warn', 'Door is behind or beside you in bed', 'You can\'t see the door from bed, which feng shui links to restless sleep.', 'Hang a mirror that lets you see the door from bed — but not one that reflects the bed itself.');
    void doorWallN;
    // bathroom door
    const bath = (room.openings || []).find((o) => o.type === 'door' && o.kind === 'bathroom');
    if (bath) {
      const bp = doorPos(room, bath);
      const sees = dot(front(bed), norm(sub(bp, C(bed)))) > 0.6;
      const back = add(C(bed), mul(front(bed), -bed.d / 2 - 0.05));
      const sameWall = Math.abs(dot(sub(back, ws[bath.wall].a), ws[bath.wall].n)) < 0.2;
      if (sees || sameWall) add_('warn', sees ? 'Bed faces the bathroom door' : 'Headboard shares the bathroom wall', 'Feng shui keeps the bed away from the bathroom\'s draining energy (and it\'s noisier in practice).', 'Keep the bathroom door closed at night; a plant or a curtain near the bathroom door helps.');
      else add_('good', 'Bed is clear of the bathroom', 'The bed doesn\'t face or share a wall with the bathroom door.');
    }
    // headboard wall
    const back = add(C(bed), mul(front(bed), -bed.d / 2 - 0.05));
    const underWindow = (room.openings || []).some((o) => {
      if (o.type !== 'window') return false;
      const w = ws[o.wall];
      const r = sub(back, w.a);
      const t = dot(r, w.dir), off = Math.abs(dot(r, w.n));
      return off < 0.2 && t > o.t - o.width / 2 - bed.w / 2 && t < o.t + o.width / 2 + bed.w / 2;
    });
    if (underWindow) add_('bad', 'Headboard under a window', 'No solid wall behind your head — feng shui calls this unsupported, and it\'s draughty and bright in practice.', 'Add a solid, upholstered or wood headboard and close heavy curtains or blackout blinds at night.');
    else add_('good', 'Solid wall behind the headboard', 'The headboard has a solid wall for "support".');
    // balance
    const stands = items.filter((i) => i.type === 'nightstand' && dist(C(i), C(bed)) < bed.w / 2 + 0.8);
    if (stands.length >= 2) add_('good', 'Balanced on both sides', 'Nightstands on both sides of the bed.');
    else add_('warn', 'Bed sides aren\'t balanced', stands.length ? 'Only one side has a nightstand.' : 'No nightstands beside the bed.', 'Feng shui favours pairs around the bed: two small shelves, two clip-on lamps or two sconces work in tight rooms.');
    // mirror reflecting the bed
    const mirrors = wallItems.filter((w) => w.type === 'mirror' || w.type === 'floorMirror');
    const reflecting = mirrors.filter((m) => ws[m.wall] && mirrorSees(ws[m.wall], m.t, bed));
    if (reflecting.length) add_('bad', 'A mirror faces the bed', `${reflecting[0].name} reflects the bed.`, 'Move it to a wall that doesn\'t see the bed, or the inside of a closet/wardrobe door.');
    else if (mirrors.length) add_('good', 'Mirrors don\'t face the bed', 'No mirror reflects you while you sleep.');
    // sharp corners (poison arrows): reflex corners of the room near the bed
    const arrows = [];
    room.points.forEach((p, i) => {
      if (interiorAngle(room.points, i) > Math.PI * 1.05) {
        const corners = boxCorners(bed);
        const d = Math.min(...corners.map((c) => dist(c, p)), dist(C(bed), p) - Math.max(bed.w, bed.d) / 2);
        if (d < 0.6) arrows.push(p);
      }
    });
    if (arrows.length) add_('warn', 'A sharp wall corner points at the bed', 'A protruding corner (like a closet bump) right beside the bed is a "poison arrow" in feng shui.', 'Soften it: a trailing plant on a shelf, a fabric panel, or rounded corner guards.');
    // heavy things overhead / beside
    const heavy = wallItems.filter((w) => (w.type === 'shelf' || w.type === 'bike' || (w.type === 'frame' && w.width * w.height > 0.4)) && ws[w.wall]);
    const overBed = heavy.filter((h) => {
      const w = ws[h.wall];
      const p = add(add(w.a, mul(w.dir, h.t)), mul(w.n, 0.3));
      const corners = boxCorners({ ...bed, w: bed.w + 0.6, d: bed.d + 0.2 });
      return pointInPolygon(p, corners) && h.z > 0.9;
    });
    if (overBed.length) add_('warn', 'Something heavy hangs near the bed', `${overBed.map((h) => h.name).join(', ')} hangs over or right next to where you sleep.`, 'Keep anything above or beside the bed light; anchor heavy pieces into studs.');
    // electronics
    const tech = items.filter((i) => i.type === 'desk' || i.type === 'mediaUnit').length + wallItems.filter((w) => w.type === 'tv' || w.type === 'projection' || w.type === 'screen').length + (design?.topItems || []).filter((t) => t.type === 'pcTower' || t.type === 'monitor' || t.type === 'projector').length;
    if (tech) add_('warn', 'Work and screens share the bedroom', 'Desk, screens or a projector bring "active" energy into a room meant for rest.', 'Drape a throw over the monitor at night, power down at the wall, and keep the desk cleared before bed.');
    add_('tip', 'Under the bed', 'Feng shui wants the space under the bed clear so energy can circulate.', 'If you store things there, keep it to soft items like bedding, in closed bins.');
  }

  if (desk && dpos) {
    const user = add(C(desk), mul(front(desk), desk.d / 2 + 0.3));
    const toDoor = norm(sub(dpos, user));
    const facingDir = mul(front(desk), -1); // you face the desk/wall
    const see = dot(facingDir, toDoor);
    if (see > 0.3) add_('good', 'Desk in the command position', 'You can see the door while you work.');
    else if (see > -0.4) add_('warn', 'Door is off to the side at the desk', 'You can see the door with a turn of the head.', 'A small mirror or reflective object on the desk that shows the doorway helps.');
    else add_('bad', 'Back to the door at the desk', 'You sit with your back to the door.', 'Put a mirror on the desk or wall that lets you see the door behind you, or turn the desk if you can.');
  }

  const m = design?.metrics;
  if (m) {
    if (m.flow >= 95 && m.doorsOk) add_('good', 'Chi flows from the door', 'There\'s a clear walking path from the door to every part of the room.');
    else add_('warn', 'Some areas are hard to reach', 'Clutter or tight gaps block the flow from the door.', 'Clear a 60 cm path from the door and keep the entry free.');
    if (m.light >= 80) add_('good', 'Light is balanced', 'Daylight and lamps reach most of the room.');
    else add_('warn', 'Dark corners', 'Parts of the room stay dim.', 'Add a lamp to the darkest corner — feng shui treats dark, stagnant corners as stuck energy.');
  }
  const plants = items.filter((i) => i.type.startsWith('plant')).length + (design?.topItems || []).filter((t) => t.type.startsWith('plant')).length;
  if (plants) add_('good', 'Living plants', `${plants} plant${plants > 1 ? 's' : ''} bring in the wood element.`);
  else add_('warn', 'No plants', 'Feng shui uses healthy plants for growth and fresh energy.', 'Add one easy plant (pothos, snake plant) near the window.');

  // Bagua zones
  const frame = baguaFrame(room);
  const zones = [];
  if (frame) {
    const byKey = new Map();
    const tag = (p, label) => { const z = baguaZone(frame, p); if (!byKey.has(z.key)) byKey.set(z.key, []); byKey.get(z.key).push(label); };
    for (const it of items) if (!it.flat) tag(C(it), it.name);
    for (const t of design?.topItems || []) tag(v(t.x, t.y), t.name);
    for (const row of BAGUA) for (const z of row) zones.push({ ...z, contains: byKey.get(z.key) || [] });
  }

  const pts = { good: 1, warn: 0.5, bad: 0 };
  const scored = checks.filter((c) => c.status !== 'tip');
  const score = scored.length ? Math.round((scored.reduce((s, c) => s + pts[c.status], 0) / scored.length) * 100) : 0;
  return { score, checks, zones };
}
