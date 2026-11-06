// Auto-design engine.
//
// The engine runs a room-type template many times with a seeded random
// generator. Each step proposes candidate placements (mostly "back against a
// wall"), filters invalid ones (outside the room, colliding, blocking a door
// swing or another item's clearance zone) and scores the rest with interior
// design rules (TV viewing distance, bed "command position", desk lighting,
// plants near windows, lamps in dark corners...). Finished layouts are then
// checked for circulation with a flood fill from the doors, so every piece of
// furniture you need to reach is actually reachable. The best layouts win.

import {
  v, add, sub, mul, dot, dist, norm, len, clamp, walls as wallsOf, centroid, area,
  boxCorners, boxesOverlap, boxInsidePolygon, pointInPolygon, raycastWalls,
  freeIntervals, interiorAngle, polygonBounds, rng as makeRng, distToBoundary,
} from './geometry.js';
import { ITEMS, STYLES, INCLUDE_OPTIONS, defaultInclude } from './catalog.js';
import { composeGallery, planInventory, FINISHES, sizeLabel } from './gallery.js';
import { fengShuiReport, baguaFrame, baguaZone, mirrorSees } from './fengshui.js';

const DOOR_HEIGHT = 2.1;
const PERSON_R = 0.28; // half the width of a comfortable walkway (~56 cm)

export function openingZ(o) {
  if (o.type === 'door') return [0, DOOR_HEIGHT];
  const sill = o.sill ?? 0.9;
  return [sill, sill + (o.height ?? 1.2)];
}

export function wallBox(wall, t, w, d, gap = 0.02) {
  const p = add(add(wall.a, mul(wall.dir, t)), mul(wall.n, gap + d / 2));
  return { x: p.x, y: p.y, w, d, theta: Math.atan2(wall.dir.y, wall.dir.x) };
}

const frontOf = (b) => v(-Math.sin(b.theta), Math.cos(b.theta));
const rightOf = (b) => v(Math.cos(b.theta), Math.sin(b.theta));
const centerOf = (b) => v(b.x, b.y);

function distPointBox(p, b) {
  const ux = rightOf(b), uy = frontOf(b);
  const r = sub(p, centerOf(b));
  const dx = Math.max(Math.abs(dot(r, ux)) - b.w / 2, 0);
  const dy = Math.max(Math.abs(dot(r, uy)) - b.d / 2, 0);
  return Math.hypot(dx, dy);
}

function clearBoxFor(b, depth) {
  if (!depth) return null;
  const f = frontOf(b);
  const c = add(centerOf(b), mul(f, b.d / 2 + depth / 2));
  return { x: c.x, y: c.y, w: b.w, d: depth, theta: b.theta };
}

// ---------------------------------------------------------------------------

class Layout {
  constructor(room, opts, r) {
    this.room = room;
    this.poly = room.points;
    this.walls = wallsOf(this.poly);
    this.opts = opts;
    this.style = STYLES[opts.style] || STYLES.scandinavian;
    this.r = r;
    this.items = [];
    this.wallItems = [];
    this.topItems = [];
    this.notes = [];
    this.score = 0;
    this.nextId = 1;
    this.area = area(this.poly);
    this.center = centroid(this.poly);

    this.openings = (room.openings || [])
      .filter((o) => this.walls[o.wall])
      .map((o) => {
        const w = this.walls[o.wall];
        const t = clamp(o.t, o.width / 2, w.length - o.width / 2);
        return { ...o, t, wallObj: w, pos: add(w.a, mul(w.dir, t)), z: openingZ(o) };
      });
    this.doors = this.openings.filter((o) => o.type === 'door');
    this.windows = this.openings.filter((o) => o.type === 'window');

    // The room's entry door(s): not bathroom, wardrobe or open closet doorways.
    const isEntry = (d) => (!d.kind || d.kind === 'entry') && d.swing !== 'none' && d.swing !== 'slide';
    this.entryDoors = this.doors.filter(isEntry);
    if (!this.entryDoors.length) this.entryDoors = this.doors.slice(0, 1);
    this.bathDoors = this.doors.filter((d) => d.kind === 'bathroom');

    // Door swing / entry zones: nothing may stand here. Sliding wardrobe doors just need access space.
    this.keepOut = this.doors.map((o) => {
      const w = o.wallObj;
      const depth = o.swing === 'slide' ? 0.65 : Math.max(o.width, 0.8) + 0.1;
      return wallBox(w, o.t, o.width + 0.15, depth, 0);
    });
  }

  rand() { return this.r(); }

  note(text) { this.notes.push(text); }

  // ---- placement ---------------------------------------------------------

  canPlace(box, { ignore = [], clear = 0, flat = false } = {}) {
    if (!boxInsidePolygon(box, this.poly)) return false;
    if (flat) return true;
    for (const k of this.keepOut) if (boxesOverlap(box, k)) return false;
    const cb = clearBoxFor(box, clear);
    if (cb && !boxInsidePolygon(cb, this.poly, 0.03)) return false;
    for (const it of this.items) {
      if (it.flat || ignore.includes(it.id) || ignore.includes(it.parent)) continue;
      if (boxesOverlap(box, it, 0)) return false;
      if (it.clearBox && !ignore.includes(it.id) && boxesOverlap(box, it.clearBox)) return false;
      if (cb && boxesOverlap(cb, it)) return false;
    }
    return true;
  }

  add(type, box, extra = {}) {
    const spec = ITEMS[type];
    const item = {
      id: this.nextId++, type, name: spec.name,
      x: box.x, y: box.y, w: box.w, d: box.d, theta: box.theta,
      h: extra.h ?? spec.h ?? 0.5,
      flat: !!spec.flat, tall: !!spec.tall,
      ...extra,
    };
    const clear = extra.clear ?? spec.clear ?? 0;
    item.clearBox = clearBoxFor(item, clear);
    this.items.push(item);
    return item;
  }

  blockedOnWall(wall, flags = {}) {
    const blocked = [];
    for (const o of this.openings) {
      if (o.wall !== wall.i) continue;
      if (o.type === 'door') blocked.push([o.t - o.width / 2 - 0.1, o.t + o.width / 2 + 0.1]);
      else if (flags.avoidWindows) blocked.push([o.t - o.width / 2 - 0.05, o.t + o.width / 2 + 0.05]);
    }
    return blocked;
  }

  /** Candidate boxes with their back against a wall. */
  wallCandidates(w, d, { gap = 0.02, step = 0.1, avoidWindows = false, clear = 0, ignore = [] } = {}) {
    const out = [];
    for (const wall of this.walls) {
      if (wall.length < w) continue;
      const free = freeIntervals(wall.length, this.blockedOnWall(wall, { avoidWindows }));
      for (const [s, e] of free) {
        if (e - s < w) continue;
        const ts = new Set();
        for (let t = s + w / 2; t <= e - w / 2 + 1e-6; t += step) ts.add(+t.toFixed(3));
        ts.add(+(s + w / 2).toFixed(3));
        ts.add(+(e - w / 2).toFixed(3));
        ts.add(+((s + e) / 2).toFixed(3));
        for (const t of ts) {
          const box = wallBox(wall, t, w, d, gap);
          if (this.canPlace(box, { clear, ignore })) out.push({ box, wall, t, interval: [s, e] });
        }
      }
    }
    return out;
  }

  /** Score candidates, then pick one with a bias toward the best. */
  choose(cands, scoreFn) {
    if (!cands.length) return null;
    const scored = cands.map((c) => ({ c, s: scoreFn(c) })).filter((x) => Number.isFinite(x.s));
    if (!scored.length) return null;
    scored.sort((a, b) => b.s - a.s);
    const pool = Math.min(scored.length, 5);
    const idx = Math.floor(Math.pow(this.rand(), 3) * pool);
    const pick = scored[idx];
    this.score += pick.s;
    return pick.c;
  }

  windowsOnWall(wall, t0, t1) {
    return this.windows.filter((o) => o.wall === wall.i && o.t + o.width / 2 > t0 && o.t - o.width / 2 < t1);
  }

  nearestWindowDist(p) {
    let best = Infinity;
    for (const o of this.windows) best = Math.min(best, dist(p, o.pos));
    return best;
  }

  /** Rough brightness at p from windows and placed lamps. */
  brightness(p, extraLights = []) {
    let s = 0;
    for (const o of this.windows) {
      const dd = dist(p, add(o.pos, mul(o.wallObj.n, 0.3)));
      s += (o.width * 1.2) / (1 + dd * dd);
    }
    const lamps = this.items.filter((i) => ITEMS[i.type].light).map(centerOf)
      .concat(this.topItems.filter((i) => ITEMS[i.type].light).map((i) => v(i.x, i.y)))
      .concat(extraLights);
    for (const l of lamps) {
      const dd = dist(p, l);
      s += 0.8 / (1 + dd * dd);
    }
    return s;
  }

  doorDistance(p) {
    let best = Infinity;
    for (const o of this.doors) best = Math.min(best, dist(p, o.pos));
    return best;
  }

  // ---- wall decor ----------------------------------------------------------

  wallFree(wall, z0, z1, ignoreItem) {
    const blocked = [];
    for (const o of this.openings) {
      if (o.wall !== wall.i) continue;
      if (o.z[1] > z0 && o.z[0] < z1) blocked.push([o.t - o.width / 2 - 0.08, o.t + o.width / 2 + 0.08]);
    }
    // An open door leaf lies against the wall next to its hinge: keep that stretch clear.
    if (z0 < DOOR_HEIGHT) {
      for (const dr of this.doors) {
        if (dr.swing === 'none' || dr.swing === 'slide') continue;
        const dw = dr.wallObj;
        const hinge = add(dw.a, mul(dw.dir, dr.hinge === 'right' ? dr.t + dr.width / 2 : dr.t - dr.width / 2));
        let s0 = null;
        for (let t = 0; t <= wall.length + 1e-6; t += 0.05) {
          const q = add(add(wall.a, mul(wall.dir, t)), mul(wall.n, 0.12));
          const hit = dist(q, hinge) < dr.width + 0.12 && dot(sub(q, hinge), dw.n) > -0.01;
          if (hit && s0 === null) s0 = t;
          if (!hit && s0 !== null) { blocked.push([s0 - 0.05, t]); s0 = null; }
        }
        if (s0 !== null) blocked.push([s0 - 0.05, wall.length]);
      }
    }
    for (const it of this.items) {
      if (it === ignoreItem || it.flat) continue;
      if (it.h <= z0) continue;
      // furniture standing against this wall
      const back = add(centerOf(it), mul(frontOf(it), -it.d / 2));
      const proj = dot(sub(back, wall.a), wall.dir);
      const off = dot(sub(back, wall.a), wall.n);
      if (off < -0.05 || off > 0.25 || proj < -1 || proj > wall.length + 1) {
        // also catch items standing sideways against the wall
        const corners = boxCorners(it);
        const near = corners.filter((c) => {
          const o2 = dot(sub(c, wall.a), wall.n);
          return o2 > -0.05 && o2 < 0.2;
        });
        if (near.length >= 2) {
          const ps = near.map((c) => dot(sub(c, wall.a), wall.dir));
          blocked.push([Math.min(...ps) - 0.05, Math.max(...ps) + 0.05]);
        }
        continue;
      }
      const hw = Math.abs(dot(rightOf(it), wall.dir)) * it.w / 2 + Math.abs(dot(frontOf(it), wall.dir)) * it.d / 2;
      blocked.push([proj - hw - 0.05, proj + hw + 0.05]);
    }
    for (const wi of this.wallItems) {
      if (wi.wall !== wall.i) continue;
      if (wi.z + wi.height > z0 && wi.z < z1) blocked.push([wi.t - wi.width / 2 - 0.1, wi.t + wi.width / 2 + 0.1]);
    }
    return freeIntervals(wall.length, blocked);
  }

  fitsOnWall(wall, t, width, z0, z1, ignoreItem) {
    return this.wallFree(wall, z0, z1, ignoreItem).some(([s, e]) => s <= t - width / 2 && e >= t + width / 2);
  }

  addWall(type, wall, t, width, height, z, extra = {}) {
    if ((type === 'mirror' || type === 'floorMirror') && !extra.group && !this.want('mirrors')) return null;
    if (type === 'sconce' && !this.want('lighting')) return null;
    const it = { id: this.nextId++, type, name: extra.name || ITEMS[type]?.name || type, wall: wall.i, t, width, height, z, depth: extra.depth ?? 0.03, ...extra };
    this.wallItems.push(it);
    return it;
  }

  addTop(type, parent, offset = v(0, 0), extra = {}) {
    if (!extra.fixed) {
      if (type.startsWith('plant') && !this.want('plants')) return null;
      if ((type === 'tableLamp' || type === 'deskLamp') && !this.want('lighting')) return null;
      if (type === 'laptop' && !this.want('laptop')) return null;
    }
    const ux = rightOf(parent), uy = frontOf(parent);
    const p = add(centerOf(parent), add(mul(ux, offset.x), mul(uy, offset.y)));
    const it = { id: this.nextId++, type, name: ITEMS[type].name, x: p.x, y: p.y, z: parent.h, parent: parent.id, theta: parent.theta, ...extra };
    this.topItems.push(it);
    return it;
  }

  pickArt(n) {
    const pal = this.style.art;
    const start = Math.floor(this.rand() * pal.length);
    return Array.from({ length: n }, (_, i) => pal[(start + i * 2) % pal.length]);
  }

  /** Did the user choose to include this kind of thing? Keys not offered for this room are always on. */
  want(key) {
    const roomKey = this.opts.keep && this.room.fixed ? 'keep' : this.opts.roomType;
    const opt = INCLUDE_OPTIONS.find((o) => o.key === key);
    if (!opt || !opt.rooms.includes(roomKey)) return true;
    return (this.opts.include || defaultInclude(roomKey)).includes(key);
  }

  hasCloset() {
    return this.room.hasCloset || this.doors.some((d) => d.kind === 'wardrobe' || (d.swing === 'none' && /closet|wardrobe/i.test(d.label || '')));
  }

  wallLabel(wall) {
    return this.room.wallNames?.[wall.i] || `${(wall.length / 0.0254 / 12).toFixed(1)}' wall`;
  }

  /** Feng shui fix: a bench at the foot of the bed blocks a straight line to the door. */
  footBench(bed) {
    const f = frontOf(bed);
    const w = Math.min(1.2, bed.w - 0.1);
    const c = add(centerOf(bed), mul(f, bed.d / 2 + 0.05 + 0.2));
    const box = { x: c.x, y: c.y, w, d: 0.4, theta: bed.theta };
    if (!this.canPlace(box, { ignore: [bed.id] })) return null;
    const b = this.add('bench', box, { h: 0.45 });
    this.note(`${Math.round(w / 0.0254)}" bench at the foot of the bed — the classic feng shui fix that blocks the straight line from the bed to the door, and a spot to sit and put shoes on.`);
    return b;
  }

  zoneAt(p) {
    if (this._bagua === undefined) this._bagua = baguaFrame(this.room);
    return this._bagua ? baguaZone(this._bagua, p) : null;
  }

  /**
   * Hang a composed gallery centred at t on wall. `under` = width of the furniture
   * below (the group is kept to ~60–75% of it). Bottom at z, or centred ~58" up when
   * opts.center is set.
   */
  gallery(wall, t, under, z, ignoreItem, label = 'Gallery wall', opts = {}) {
    if (!this.want('frames')) return false;
    const free = this.wallFree(wall, (opts.center ? 1.0 : z) - 0.03, (opts.center ? 1.0 : z) + 0.9, ignoreItem).find(([s0, e0]) => s0 <= t && e0 >= t);
    if (!free) return false;
    const span = Math.min(free[1] - t, t - free[0]) * 2 - 0.1;
    const ceiling = (this.room.height || 2.5) - 0.15;
    let prefer = opts.prefer;
    if (!prefer && this.opts.fengShui) {
      const zone = this.zoneAt(add(add(wall.a, mul(wall.dir, t)), mul(wall.n, 0.3)));
      if (zone?.key === 'love') prefer = 'pair';
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const maxW = Math.min(under * 0.75, span) * (1 - attempt * 0.15);
      const g = composeGallery({ maxW, maxH: Math.min(1.0, ceiling - (opts.center ? 1.0 : z)), roomType: this.opts.roomType, style: this.opts.style, r: this.r, art: this.style.art, prefer: attempt === 0 ? prefer : undefined });
      if (!g) return false;
      const zz = opts.center ? clamp(1.47 - g.H / 2, 0.9, ceiling - g.H) : z;
      if (zz + g.H > ceiling) continue;
      if (!this.fitsOnWall(wall, t, g.W, zz - 0.03, zz + g.H + 0.03, ignoreItem)) continue;
      this.placeGroup(wall, t, zz, g, label);
      const n = g.elements.filter((e) => e.type === 'frame').length;
      const fin = [...new Set(g.elements.filter((e) => e.finish).map((e) => FINISHES[e.finish].name))];
      const pct = Math.round((g.W / under) * 100);
      this.note(`${label}: ${g.label} — ${n} frame${n === 1 ? '' : 's'}${g.elements.some((e) => e.type !== 'frame' && e.type !== 'plantSmall') ? ' plus a non-frame piece' : ''}, ${Math.round(g.W / 0.0254)}" wide (${opts.center ? 'centred at eye level' : `about ${pct}% of the furniture below`}), ${fin.join(' + ')} finish${fin.length > 1 ? 'es' : ''}, 2–3" gaps.`);
      this.score += 3 + Math.min(n, 4) * 0.3;
      return true;
    }
    return false;
  }

  placeGroup(wall, t, z, g, label) {
    for (const e of g.elements) {
      const tt = t + e.dx, zz = z + e.dz;
      if (e.type === 'frame') {
        const fin = FINISHES[e.finish] || FINISHES.black;
        this.addWall('frame', wall, tt, e.w, e.h, zz, {
          art: e.art, artSeed: e.artSeed, artKind: e.artKind, finish: fin.color, finishName: fin.name, mat: e.mat, lean: e.lean,
          group: label, owned: e.owned, name: `${e.owned ? 'Your ' : ''}${sizeLabel(e.w, e.h)} frame${e.owned ? '' : ` (${fin.name})`}`,
        });
      } else if (e.type === 'mirror') {
        this.addWall('mirror', wall, tt, e.w, e.h, zz, { round: e.round, group: label, name: `${Math.round(e.w / 0.0254)}" round mirror` });
      } else if (e.type === 'shelf') {
        this.addWall('shelf', wall, tt, e.w, 0.04, zz, { depth: e.depth, ledge: e.ledge, decor: Math.floor(this.rand() * 1e6), group: label, name: e.ledge ? `${Math.round(e.w / 0.0254)}" picture ledge` : `${Math.round(e.w / 0.0254)}" floating shelf` });
      } else if (e.type === 'plantSmall') {
        const p = add(add(wall.a, mul(wall.dir, tt)), mul(wall.n, 0.05));
        this.topItems.push({ id: this.nextId++, type: 'plantSmall', name: ITEMS.plantSmall.name, x: p.x, y: p.y, z: zz + 0.04, theta: Math.atan2(wall.dir.y, wall.dir.x) });
      }
    }
  }

  /** Re-plan an inventory of the user's own frames across all free walls. */
  galleryFromInventory(inventory) {
    const ceiling = (this.room.height || 2.5) - 0.12;
    const zones = [];
    for (const wall of this.walls) {
      for (const [s0, e0] of this.wallFree(wall, 1.2, ceiling)) {
        if (e0 - s0 >= 0.4) zones.push({ wall, t0: s0, t1: e0, z0: 1.25, z1: ceiling });
      }
    }
    const plan = planInventory(zones, inventory, { r: this.r, art: this.style.art, style: this.opts.style });
    for (const g of plan.groups) {
      const zz = clamp(1.5 - g.H / 2, g.zone.z0, g.zone.z1 - g.H);
      const t = (g.zone.t0 + g.zone.t1) / 2;
      this.placeGroup(g.zone.wall, t, zz, { elements: g.elements }, 'Your frames');
      const frames = g.elements.filter((e) => e.type === 'frame');
      const extra = g.elements.find((e) => e.type !== 'frame');
      const pct = Math.round(g.coverage * 100);
      this.note(`${this.wallLabel(g.zone.wall)[0].toUpperCase() + this.wallLabel(g.zone.wall).slice(1)}: ${frames.map((f) => sizeLabel(f.w, f.h)).join(' + ')}${extra ? ` + ${extra.label}` : ''} — ${Math.round(g.W / 0.0254)}" wide, ${pct > 40 ? 'fills that short stretch on its own, so leave the rest of the wall bare' : `about ${pct}% of the wall's art zone, leaving breathing room around it`}.`);
    }
    if (plan.leftovers.length) this.note(`Not hung: ${plan.leftovers.map((l) => `${l.count} × ${l.label}`).join(', ')}. Rotate them in by season or swap the anchor — fewer pieces on the wall reads cozier than every frame at once.`);
    this.score += plan.groups.length * 2;
    return plan;
  }

  /** Two staggered floating shelves (or one) on a free stretch of wall. */
  shelves(wall, t, z, count = 2, width = 0.8) {
    const placed = [];
    if (!this.want('shelves')) return placed;
    for (let k = 0; k < count; k++) {
      const tz = z + k * 0.38;
      const tt = t + (count > 1 ? (k === 0 ? -0.18 : 0.18) : 0);
      if (!this.fitsOnWall(wall, tt, width, tz - 0.05, tz + 0.3)) continue;
      placed.push(this.addWall('shelf', wall, tt, width, 0.04, tz, { depth: 0.22, decor: Math.floor(this.rand() * 1e6) }));
    }
    return placed;
  }

  findShelfSpot(minWidth = 1.0, z0 = 1.15, z1 = 1.9, preferWalls = null) {
    const cands = [];
    for (const wall of this.walls) {
      for (const [s, e] of this.wallFree(wall, z0, z1)) {
        if (e - s < minWidth) continue;
        const t = (s + e) / 2;
        // never above a walkway / door swing zone (head height!)
        const under = wallBox(wall, t, Math.min(e - s, 1.0), 0.35, 0);
        if (this.keepOut.some((k) => boxesOverlap(under, k))) continue;
        let sc = Math.min(e - s, 2.5);
        if (preferWalls && preferWalls.includes(wall.i)) sc += 3;
        // Don't hang shelves right next to a door swing: people brush past.
        for (const dr of this.doors) if (dist(add(wall.a, mul(wall.dir, t)), dr.pos) < 1.0) sc -= 3;
        cands.push({ wall, t, sc, width: e - s });
      }
    }
    cands.sort((a, b) => b.sc - a.sc);
    return cands[0] || null;
  }

  // ---- generic decor --------------------------------------------------------

  cornerSpots(size) {
    const spots = [];
    const n = this.poly.length;
    for (let i = 0; i < n; i++) {
      const ang = interiorAngle(this.poly, i);
      if (ang > Math.PI * 0.95) continue; // only convex corners
      const p = this.poly[i];
      const wIn = this.walls[i], wOut = this.walls[(i - 1 + n) % n];
      const bis = norm(add(wIn.n, wOut.n));
      const off = (size / 2 + 0.04) / Math.sin(ang / 2);
      const c = add(p, mul(bis, off));
      spots.push({ p: c, theta: Math.atan2(wIn.dir.y, wIn.dir.x), corner: i });
    }
    return spots;
  }

  placePlants(count) {
    if (!this.want('plants')) return 0;
    // Floor plants: one large statement plant plus at most one medium; small ones live on surfaces.
    count = Math.min(count, 2 - this.items.filter((i) => i.type === 'plantLarge' || i.type === 'plantMedium').length);
    let placed = 0;
    const types = ['plantLarge', 'plantMedium'];
    for (let k = 0; k < count; k++) {
      // One large floor plant is plenty; the rest are medium.
      const hasLarge = this.items.some((i) => i.type === 'plantLarge');
      const order = hasLarge ? ['plantMedium'] : [k === 0 || this.rand() < 0.5 ? types[0] : types[1], ...types];
      const ok = [...new Set(order)].some((type) => this.placePlant(type));
      if (!ok) break;
      placed++;
    }
    return placed;
  }

  /** True if a floor item of height h standing at box b would cover a projection/TV on the wall. */
  blocksScreen(b, h) {
    for (const wi of this.wallItems) {
      if (wi.type !== 'projection' && wi.type !== 'tv') continue;
      const w = this.walls[wi.wall];
      const r = sub(centerOf(b), w.a);
      const t = dot(r, w.dir), off = dot(r, w.n);
      if (off < 1.2 && Math.abs(t - wi.t) < wi.width / 2 + b.w / 2 && h > wi.z - 0.2) return true;
    }
    return false;
  }

  placePlant(type) {
    {
      const s = ITEMS[type];
      const cands = [];
      for (const wc of this.wallCandidates(s.w, s.d, { gap: 0.04, step: 0.25 })) cands.push({ box: wc.box, where: 'along the wall' });
      for (const sp of this.cornerSpots(s.w)) cands.push({ box: { x: sp.p.x, y: sp.p.y, w: s.w, d: s.d, theta: sp.theta }, where: 'in the corner' });
      // beside furniture along walls
      for (const it of this.items) {
        if (it.flat || it.parent || ['coffeeTable', 'rug', 'chair', 'deskChair', 'bench', 'armchair'].includes(it.type)) continue;
        for (const side of [-1, 1]) {
          const c = add(centerOf(it), add(mul(rightOf(it), side * (it.w / 2 + s.w / 2 + 0.08)), mul(frontOf(it), -it.d / 2 + s.d / 2 + 0.02)));
          cands.push({ box: { x: c.x, y: c.y, w: s.w, d: s.d, theta: it.theta }, where: `next to the ${it.name.toLowerCase()}` });
        }
      }
      // beside windows
      for (const o of this.windows) {
        for (const side of [-1, 1]) {
          const t = o.t + side * (o.width / 2 + s.w / 2 + 0.05);
          if (t < s.w / 2 || t > o.wallObj.length - s.w / 2) continue;
          cands.push({ box: wallBox(o.wallObj, t, s.w, s.d, 0.04), where: 'beside the window' });
        }
      }
      const valid = cands.filter((c) => this.canPlace(c.box) && !this.blocksScreen(c.box, s.h));
      const pick = this.choose(valid, (c) => {
        const p = centerOf(c.box);
        let sc = 4;
        if (c.where === 'along the wall') sc -= 2;
        if (this.opts.fengShui) {
          const z = this.zoneAt(p);
          if (z && (z.key === 'wealth' || z.key === 'family')) sc += 4;
          if (z && z.key === 'health') sc -= 6; // keep the centre open
        }
        // plants belong against walls/corners, not out in the open floor
        if (distToBoundary(p, this.poly) > 0.6) sc -= 8;
        const wd = this.nearestWindowDist(p);
        if (Number.isFinite(wd)) sc += 6 / (1 + wd); // plants want light
        sc -= 3 / (0.3 + this.doorDistance(p));
        // spread plants out
        for (const it of this.items) if (it.type.startsWith('plant')) sc -= 4 / (0.2 + dist(p, centerOf(it)));
        if (c.where === 'in the corner') sc += 1.5;
        return sc;
      });
      if (!pick) return false;
      this.add(type, pick.box, { variant: Math.floor(this.rand() * 3) });
      const wd = this.nearestWindowDist(centerOf(pick.box));
      this.note(`${ITEMS[type].name} ${pick.where}${Number.isFinite(wd) && wd < 2 ? ' — close to the window for light' : ''}.`);
      return true;
    }
  }

  placeFloorLamp(nearItem, label) {
    if (!this.want('lighting')) return null;
    const type = (this.opts.style === 'boho' || this.opts.style === 'midcentury') && this.rand() < 0.6 ? 'arcLamp' : 'floorLamp';
    const s = ITEMS[type];
    const cands = [];
    if (nearItem) {
      for (const side of [-1, 1]) {
        for (const back of [0.1, 0.25]) {
          const c = add(centerOf(nearItem), add(mul(rightOf(nearItem), side * (nearItem.w / 2 + s.w / 2 + 0.05)), mul(frontOf(nearItem), -nearItem.d / 2 + s.d / 2 + back - 0.08)));
          cands.push({ box: { x: c.x, y: c.y, w: s.w, d: s.d, theta: nearItem.theta } });
        }
      }
    }
    for (const sp of this.cornerSpots(s.w)) cands.push({ box: { x: sp.p.x, y: sp.p.y, w: s.w, d: s.d, theta: sp.theta } });
    const valid = cands.filter((c) => this.canPlace(c.box));
    const pick = this.choose(valid, (c) => {
      const p = centerOf(c.box);
      let sc = 6 - this.brightness(p) * 3; // darkest spot wins
      if (nearItem) sc -= dist(p, centerOf(nearItem)) * 1.2;
      sc -= 2 / (0.3 + this.doorDistance(p));
      return sc;
    });
    if (!pick) return null;
    const lamp = this.add(type, pick.box);
    this.note(`${s.name} ${label || 'in the darkest corner'} — layered light away from the windows.`);
    return lamp;
  }

  placeRug(cx, cy, w, d, theta, label) {
    if (!this.want('rug')) return null;
    const floor = this.room.floor?.type;
    if (floor === 'carpet') {
      // Layering on carpet: a smaller low-pile flat-weave rug lies flat and doesn't bunch up.
      w = Math.min(w, 2.0); d = Math.min(d, 1.5);
      label = `${label} (low-pile flat-weave so it lies flat on the carpet — add a rug-to-carpet gripper)`;
    }
    if (floor === 'tile' || floor === 'concrete') label += ', warming up the hard floor';
    // Shrink the rug until it fits, keeping ~25 cm of floor visible to walls.
    for (let k = 0; k < 8; k++) {
      const box = { x: cx, y: cy, w: w - k * 0.2, d: d - k * 0.15, theta };
      if (box.w < 1 || box.d < 0.8) break;
      const inset = { ...box, w: box.w + 0.4, d: box.d + 0.4 };
      if (boxInsidePolygon(inset, this.poly)) {
        const rug = this.add('rug', box, { pattern: Math.floor(this.rand() * 3) });
        this.note(`${box.w.toFixed(1)} × ${box.d.toFixed(1)} m rug ${label}.`);
        this.score += 2;
        return rug;
      }
    }
    return null;
  }

  pendant(p, label) {
    if (!this.want('lighting')) return;
    this.topItems.push({ id: this.nextId++, type: 'pendant', name: 'Pendant light', x: p.x, y: p.y, z: (this.room.height || 2.5) - 0.6, ceiling: true });
    this.note(`Pendant light ${label}.`);
  }

  /** Hanging plant near a window: layering greenery at ceiling height. */
  hangingPlant() {
    if (!this.want('plants')) return;
    const w = this.windows.slice().sort((a, b) => b.width - a.width)[0];
    if (!w) return;
    const t = w.t + (w.width / 2 - 0.25) * (this.rand() < 0.5 ? -1 : 1);
    const p = add(add(w.wallObj.a, mul(w.wallObj.dir, t)), mul(w.wallObj.n, 0.35));
    if (this.items.some((it) => (it.type === 'bed' || it.type === 'singleBed') && distPointBox(p, it) < 0.3)) return;
    this.topItems.push({ id: this.nextId++, type: 'plantHanging', name: 'Hanging plant', x: p.x, y: p.y, z: (this.room.height || 2.5) - 0.9, ceiling: true });
    this.note('Hanging plant in front of the window — greenery at a third height level.');
  }

  // ---- final evaluation ----------------------------------------------------

  evaluate() {
    const b = polygonBounds(this.poly);
    const cs = 0.1;
    const nx = Math.ceil(b.w / cs) + 1, ny = Math.ceil(b.h / cs) + 1;
    const walk = new Uint8Array(nx * ny);
    const obstacles = this.items.filter((i) => !i.flat);
    let walkable = 0, inside = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const p = v(b.minX + i * cs, b.minY + j * cs);
        if (!pointInPolygon(p, this.poly)) continue;
        inside++;
        if (distToBoundary(p, this.poly) < PERSON_R) continue;
        let ok = true;
        for (const o of obstacles) if (distPointBox(p, o) < PERSON_R) { ok = false; break; }
        if (ok) { walk[j * nx + i] = 1; walkable++; }
      }
    }
    const cellOf = (p) => [Math.round((p.x - b.minX) / cs), Math.round((p.y - b.minY) / cs)];
    const nearestWalk = (p, radius = 0.35) => {
      const [ci, cj] = cellOf(p);
      const r = Math.ceil(radius / cs);
      let best = -1, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= nx || j >= ny || !walk[j * nx + i]) continue;
        const dd = di * di + dj * dj;
        if (dd < bd) { bd = dd; best = j * nx + i; }
      }
      return best;
    };
    const seen = new Uint8Array(nx * ny);
    const queue = [];
    const starts = this.doors.length ? this.doors.map((o) => add(o.pos, mul(o.wallObj.n, 0.45))) : [this.center];
    for (const s of starts) {
      const c = nearestWalk(s, 0.6);
      if (c >= 0 && !seen[c]) { seen[c] = 1; queue.push(c); }
    }
    let reach = 0;
    while (queue.length) {
      const c = queue.pop();
      reach++;
      const i = c % nx, j = (c / nx) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const k = jj * nx + ii;
        if (walk[k] && !seen[k]) { seen[k] = 1; queue.push(k); }
      }
    }
    // Access points that must be reachable
    let blocked = 0;
    const blockedNames = [];
    for (const it of this.items) {
      const pts = accessPoints(it);
      if (!pts.length) continue;
      const ok = pts.some((p) => { const c = nearestWalk(p, 0.3); return c >= 0 && seen[c]; });
      if (!ok) { blocked++; blockedNames.push(it.name); }
    }
    for (const o of this.windows) {
      // windows should be reachable to open them (soft)
      const c = nearestWalk(add(o.pos, mul(o.wallObj.n, 0.5)), 0.4);
      if (!(c >= 0 && seen[c])) this.score -= 2;
    }
    const doorsOk = starts.every((s) => { const c = nearestWalk(s, 0.6); return c >= 0; });
    const openFloor = walkable / Math.max(1, inside);
    const flow = reach / Math.max(1, walkable);
    this.score -= blocked * 25;
    if (!doorsOk) this.score -= 40;
    this.score += flow * 10 + clamp(openFloor, 0, 0.7) * 10;
    // Light coverage: how many spots end up dim
    let dim = 0, samples = 0;
    for (let j = 2; j < ny; j += 5) for (let i = 2; i < nx; i += 5) {
      const p = v(b.minX + i * cs, b.minY + j * cs);
      if (!pointInPolygon(p, this.poly)) continue;
      samples++;
      if (this.brightness(p) < 0.35) dim++;
    }
    const lightCover = 1 - dim / Math.max(1, samples);
    this.score += lightCover * 8;
    this.metrics = {
      openFloor: Math.round(openFloor * 100),
      flow: Math.round(flow * 100),
      light: Math.round(lightCover * 100),
      blocked: blockedNames,
      doorsOk,
    };
  }

  toDesign() {
    return {
      items: this.items,
      wallItems: this.wallItems,
      topItems: this.topItems,
      notes: this.notes,
      score: this.score,
      metrics: this.metrics,
      style: this.opts.style,
      roomType: this.opts.roomType,
    };
  }
}

function accessPoints(it) {
  const c = centerOf(it), f = frontOf(it), r = rightOf(it);
  const front = (k = 0.35) => add(c, mul(f, it.d / 2 + k));
  switch (it.type) {
    case 'sofa': case 'loveseat': case 'armchair': case 'dresser': case 'wardrobe':
    case 'bookshelf': case 'sideboard': return [front()];
    case 'bed': return [add(c, mul(r, it.w / 2 + 0.35)), add(c, mul(r, -it.w / 2 - 0.35))];
    case 'singleBed': return [add(c, mul(r, it.w / 2 + 0.35)), add(c, mul(r, -it.w / 2 - 0.35)), front()];
    case 'deskChair': return [add(c, mul(f, 0.45)), add(c, mul(r, 0.5)), add(c, mul(r, -0.5))];
    default: return [];
  }
}

// ---------------------------------------------------------------------------
// Room templates

function frontDistance(L, box) {
  const f = frontOf(box);
  const start = add(centerOf(box), mul(f, box.d / 2));
  const hit = raycastWalls(start, f, L.walls);
  return hit ? hit.distance : 0;
}

function sideNeighbour(L, anchor, type, side, opts = {}) {
  const s = ITEMS[type];
  const w = opts.w ?? s.w, d = opts.d ?? s.d;
  const gap = opts.gap ?? 0.05;
  const c = add(centerOf(anchor), add(mul(rightOf(anchor), side * (anchor.w / 2 + w / 2 + gap)), mul(frontOf(anchor), -anchor.d / 2 + d / 2)));
  return { x: c.x, y: c.y, w, d, theta: anchor.theta };
}

function livingRoom(L) {
  const maxWall = Math.max(...L.walls.map((w) => w.length));
  const sofaType = maxWall >= 2.6 && L.area > 10 ? 'sofa' : 'loveseat';
  const ss = ITEMS[sofaType];
  const sofaC = L.choose(L.wallCandidates(ss.w, ss.d, { clear: 0.35 }), (c) => {
    const D = frontDistance(L, c.box);
    if (D < 1.5) return -Infinity;
    let sc = 12 - Math.abs(D - 2.8) * 3;
    sc += Math.min(c.wall.length, 5) * 0.8;
    sc -= Math.abs(c.t - (c.interval[0] + c.interval[1]) / 2) * 1.2;
    sc -= L.windowsOnWall(c.wall, c.t - ss.w / 2, c.t + ss.w / 2).length * 2.5;
    sc -= 2.5 / (0.3 + L.doorDistance(centerOf(c.box)));
    return sc;
  });
  if (!sofaC) { L.note('Could not fit a sofa — try a larger outline.'); L.score -= 50; return; }
  const sofa = L.add(sofaType, sofaC.box, { clear: 0.35 });
  const D = frontDistance(L, sofa);
  L.note(`${ss.name} against the ${sofaC.wall.length.toFixed(1)} m wall, ${D.toFixed(1)} m from the opposite wall for comfortable viewing.`);

  // Media console + TV on the wall the sofa faces.
  const f = frontOf(sofa);
  const hit = raycastWalls(add(centerOf(sofa), mul(f, sofa.d / 2)), f, L.walls);
  let media = null;
  if (hit && L.want('tv')) {
    const ms = ITEMS.mediaUnit;
    const w = Math.min(ms.w, hit.wall.length - 0.2);
    const cands = L.wallCandidates(w, ms.d, { clear: 0 }).filter((c) => c.wall.i === hit.wall.i && Math.abs(c.t - hit.t) < 0.9);
    const mc = L.choose(cands, (c) => {
      let sc = 8 - Math.abs(c.t - hit.t) * 6;
      if (L.windowsOnWall(c.wall, c.t - 0.7, c.t + 0.7).length) sc -= 6; // glare
      return sc;
    });
    if (mc) {
      media = L.add('mediaUnit', mc.box, { w });
      const tvz = 0.9;
      if (L.fitsOnWall(mc.wall, mc.t, ITEMS.tv.w, tvz, tvz + ITEMS.tv.h, media)) {
        L.addWall('tv', mc.wall, mc.t, ITEMS.tv.w, ITEMS.tv.h, tvz, { depth: 0.06 });
        L.note('TV wall-mounted over a low media console, directly across from the sofa.');
      } else {
        L.note('Media console across from the sofa (window behind it, so no TV mounted).');
      }
      if (L.rand() < 0.8) L.addTop('plantSmall', media, v(media.w / 2 - 0.2, 0));
    }
  }

  // Coffee table + rug
  const cs = ITEMS.coffeeTable;
  const ctw = Math.min(cs.w, sofa.w * 0.6);
  const ctc = add(centerOf(sofa), mul(f, sofa.d / 2 + 0.42 + cs.d / 2));
  const ctBox = { x: ctc.x, y: ctc.y, w: ctw, d: cs.d, theta: sofa.theta };
  let coffee = null;
  if (L.canPlace(ctBox, { ignore: [sofa.id] })) {
    coffee = L.add('coffeeTable', ctBox, { w: ctw, round: L.opts.style === 'boho' || L.opts.style === 'japandi' ? L.rand() < 0.6 : false });
    L.note('Coffee table 42 cm in front of the sofa — within reach, with room for legs.');
  }
  const rugW = sofa.w + 0.4;
  const rugD = Math.min(2.4, Math.max(1.4, D - 0.6));
  const rc = add(centerOf(sofa), mul(f, sofa.d / 2 - 0.25 + rugD / 2));
  L.placeRug(rc.x, rc.y, rugW, rugD, sofa.theta, 'anchors the seating, front legs of the sofa on it');

  // Side table on one end, lamp on the other end
  const sides = L.rand() < 0.5 ? [1, -1] : [-1, 1];
  let sideTable = null, sideUsed = 0;
  for (const side of sides) {
    const b = sideNeighbour(L, sofa, 'sideTable', side);
    if (L.canPlace(b)) { sideTable = L.add('sideTable', b); sideUsed = side; break; }
  }
  if (sideTable) {
    const lamp = L.addTop('tableLamp', sideTable);
    L.note(`Side table${lamp ? ' with a table lamp' : ''} at the end of the sofa.`);
  }
  const lampSideBox = sideNeighbour(L, sofa, 'floorLamp', -sideUsed || 1);
  if (L.want('lighting') && L.canPlace(lampSideBox)) {
    L.add(L.opts.style === 'boho' || L.opts.style === 'midcentury' ? 'arcLamp' : 'floorLamp', lampSideBox);
    L.note('Floor lamp at the other end of the sofa for reading light.');
  }

  // Armchair angled toward the coffee table
  if (coffee && L.area > 11 && L.want('readingChair')) {
    const as = ITEMS.armchair;
    const cands = [];
    for (const side of [-1, 1]) {
      const p = add(centerOf(coffee), mul(rightOf(coffee), side * (coffee.w / 2 + 0.35 + as.d / 2)));
      // face the coffee table
      const theta = Math.atan2(rightOf(coffee).y, rightOf(coffee).x) + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      cands.push({ box: { x: p.x, y: p.y, w: as.w, d: as.d, theta: theta + Math.PI } });
    }
    const valid = cands.filter((c) => L.canPlace(c.box, { clear: 0.2 }));
    const pick = L.choose(valid, (c) => 5 - 2 / (0.3 + L.doorDistance(centerOf(c.box))));
    if (pick) {
      const chair = L.add('armchair', pick.box);
      // normalise so front faces the coffee table
      const toTable = norm(sub(centerOf(coffee), centerOf(chair)));
      if (dot(frontOf(chair), toTable) < 0) chair.theta += Math.PI;
      chair.clearBox = null;
      L.note('Accent armchair beside the coffee table to make a conversation area.');
    }
  }

  // Bookshelf on a wall other than the TV wall
  const bs = ITEMS.bookshelf;
  const bc = L.choose(L.wallCandidates(bs.w, bs.d, { avoidWindows: true, clear: 0.5 }), (c) => {
    let sc = 3;
    if (hit && c.wall.i === hit.wall.i) sc -= 2;
    if (c.wall.i === sofaC.wall.i) sc -= 3;
    sc -= 1.5 / (0.3 + L.doorDistance(centerOf(c.box)));
    return sc;
  });
  if (bc && L.area > 9 && L.want('bookshelf')) {
    L.add('bookshelf', bc.box, { clear: 0.5, books: Math.floor(L.rand() * 1e6) });
    L.note('Tall bookshelf on a solid wall, away from the windows.');
  }

  // Wall decor
  L.gallery(sofaC.wall, sofaC.t, sofa.w, sofa.h + 0.23, sofa, 'Above the sofa');
  const shelfSpot = L.findShelfSpot(1.0, 1.15, 1.95, hit ? [hit.wall.i] : null);
  if (shelfSpot) {
    const sh = L.shelves(shelfSpot.wall, shelfSpot.t, 1.25, shelfSpot.width > 1.4 ? 2 : 1, Math.min(0.9, shelfSpot.width - 0.3));
    if (sh.length) L.note(`${sh.length === 2 ? 'Two staggered floating shelves' : 'A floating shelf'} with books, a trailing plant and a candle on a free stretch of wall.`);
  }

  L.pendant(coffee ? centerOf(coffee) : L.center, 'centred over the seating area');
  L.placePlants(Math.round(clamp(L.area / 7, 1, 4) * L.style.plants));
  if (L.style.plants >= 1 && L.rand() < 0.7) L.hangingPlant();
  if (L.area > 16) L.placeFloorLamp(null);
}

function bedroom(L) {
  const minSide = Math.min(polygonBounds(L.poly).w, polygonBounds(L.poly).h);
  const bedType = minSide >= 2.7 && L.area >= 8.5 ? 'bed' : 'singleBed';
  // Full-size (54") in compact rooms, queen-ish (63") otherwise.
  const bs = bedType === 'bed' && minSide < 3.2 ? { ...ITEMS.bed, name: 'Full bed', w: 1.37, d: 1.95 } : bedType === 'bed' ? { ...ITEMS.bed, name: 'Queen bed' } : ITEMS[bedType];
  // Candidates for the chosen size, plus a full-size fallback when a queen won't leave room for two cabinets.
  const sizes = [bs];
  if (bedType === 'bed' && bs.w > 1.4) sizes.push({ ...ITEMS.bed, name: 'Full bed', w: 1.37, d: 1.95, smaller: true });
  const bedCands = sizes.flatMap((sz) => L.wallCandidates(sz.w, sz.d, { clear: 0.7 }).map((c) => ({ ...c, size: sz })));
  const bedC = L.choose(bedCands, (c) => {
    let sc = c.size.smaller ? 7 : 10;
    const p = centerOf(c.box);
    // side clearance (double bed needs both sides)
    const sideOk = [-1, 1].map((s) => L.canPlace(sideNeighbour(L, c.box, 'nightstand', s, { w: 0.35, d: 0.4, gap: 0.04 })));
    if (bedType === 'bed' && !sideOk.some(Boolean)) return -Infinity;
    // bedside cabinets on both sides when the user wants them
    sc += sideOk.filter(Boolean).length * (L.want('nightstands') ? 9 : 3);
    sc -= L.windowsOnWall(c.wall, c.t - c.size.w / 2, c.t + c.size.w / 2).length * 5; // no headboard under windows
    // command position: door visible but not straight in line with the bed
    for (const bd of L.bathDoors) {
      // don't sleep facing the bathroom door or with it in your headboard wall
      if (dot(frontOf(c.box), norm(sub(bd.pos, p))) > 0.6) sc -= L.opts.fengShui ? 6 : 2;
      if (bd.wall === c.wall.i) sc -= L.opts.fengShui ? 4 : 1.5;
    }
    for (const dr of L.entryDoors) {
      const toDoor = norm(sub(dr.pos, p));
      const facing = dot(frontOf(c.box), toDoor);
      const fs = L.opts.fengShui ? 2.5 : 1;
      if (facing > 0.1 && facing < 0.92) sc += 4 * fs;
      else if (facing >= 0.92) sc += L.opts.fengShui ? -10 : 1; // directly in line ("coffin position")
      else sc -= 3 * fs; // door behind/next to the headboard
      if (dr.wall === c.wall.i) sc -= 2;
    }
    if (L.opts.fengShui) sc -= L.windowsOnWall(c.wall, c.t - c.size.w / 2, c.t + c.size.w / 2).length * 6;
    sc -= Math.abs(c.t - (c.interval[0] + c.interval[1]) / 2) * 1.5;
    return sc;
  });
  if (!bedC) { L.note('Could not fit a bed with walk-around space.'); L.score -= 50; return; }
  const bed = L.add(bedType, bedC.box, { clear: 0.6, name: bedC.size.name });
  L.note(`${bedC.size.name} with the headboard on a solid wall, where you can see the door from bed.`);

  if (L.want('nightstands')) {
    let stands = 0;
    const useSconces = ['modern', 'neodeco', 'japandi'].includes(L.opts.style) ? L.rand() < 0.7 : L.rand() < 0.25;
    let lamps = 0;
    let plantDone = false;
    for (const side of [-1, 1]) {
      let b = null;
      for (const w of [0.48, 0.4, 0.35]) {
        const cand = sideNeighbour(L, bed, 'nightstand', side, { gap: 0.04, w, d: 0.4 });
        if (L.canPlace(cand)) { b = cand; break; }
      }
      if (!b) continue;
      const ns = L.add('nightstand', b);
      // The bed is on the -side of this cabinet (in the cabinet's own x axis).
      // Lamp sits toward the bed, the small plant toward the outside, so they never overlap.
      let hasLamp = false;
      if (useSconces) { if (L.addWall('sconce', bedC.wall, bedC.t + side * (bed.w / 2 + 0.04 + ns.w / 2), 0.16, 0.24, 1.15, { depth: 0.15 })) { lamps++; } }
      else if (L.addTop('tableLamp', ns, v(-side * 0.06, -0.02))) { lamps++; hasLamp = true; }
      // keep part of the tops clear: one small plant, on one cabinet only
      if (!plantDone && (!hasLamp || ns.w >= 0.44)) {
        if (L.addTop('plantSmall', ns, v(hasLamp ? side * (ns.w / 2 - 0.08) : 0, 0.05))) plantDone = true;
      }
      stands++;
    }
    L.score += stands === 2 ? 24 : stands * 4; // a cabinet on both sides is what people expect
    if (stands) L.note(`${stands === 2 ? 'Matching bedside cabinets' : 'A bedside cabinet'}${lamps ? ` with ${useSconces ? 'wall sconces above, leaving the top clear' : stands === 2 ? 'bedside lamps on both sides' : 'a bedside lamp'}` : ''}.`);
  }

  if (L.want('bench')) L.footBench(bed);
  const f = frontOf(bed);
  const rugW = bed.w + 1.1, rugD = Math.min(2.0, bed.d * 0.75);
  const rc = add(centerOf(bed), mul(f, bed.d / 2 - rugD / 2 + 0.55));
  L.placeRug(rc.x, rc.y, rugW, rugD, bed.theta, 'under the lower two-thirds of the bed, so your feet land on something soft');

  // Wardrobe only when there's no closet (a closet already does that job).
  const closet = L.hasCloset();
  if (L.want('wardrobe') && closet) L.note('No wardrobe: you already have a closet, so that wall space goes to a dresser and a desk instead.');
  if (L.want('wardrobe') && !closet && L.area > 9) {
    const ws = ITEMS.wardrobe;
    const wc = L.choose(L.wallCandidates(ws.w, ws.d, { avoidWindows: true, clear: 0.8 }), (c) => {
      let sc = 4 - L.doorDistance(centerOf(c.box)) * 0.5;
      if (c.wall.i === bedC.wall.i) sc -= 1;
      return sc;
    });
    if (wc) {
      L.add('wardrobe', wc.box, { clear: 0.8 });
      L.note('Wardrobe on a windowless wall near the door, with 80 cm in front to open it.');
    }
  }

  // Desk: on a wall facing into the room with daylight from the side.
  if (L.want('desk')) placeDesk(L, { avoidWall: bedC.wall.i, laptop: true, label: 'Desk' });

  // Dresser: by the door/closet, where the wardrobe would go — you dress where your clothes are.
  let dresser = null;
  if (L.want('dresser')) {
    const ds = ITEMS.dresser;
    const closetDoor = L.doors.find((d) => d.swing === 'none' || d.kind === 'wardrobe');
    let dcands = [];
    for (const [w, clr] of [[ds.w, 0.7], [1.0, 0.65], [0.8, 0.6]]) { dcands = L.wallCandidates(w, ds.d, { clear: clr }); if (dcands.length) break; }
    const dc = L.choose(dcands, (c) => {
      const p = centerOf(c.box);
      let sc = 5 - L.doorDistance(p) * 0.4;
      if (closetDoor) sc += 3 / (0.5 + dist(p, closetDoor.pos));
      if (c.wall.i === bedC.wall.i) sc -= 1.5;
      sc -= L.windowsOnWall(c.wall, c.t - ds.w / 2, c.t + ds.w / 2).length * 1.5;
      return sc;
    });
    if (dc) {
      dresser = L.add('dresser', dc.box, { clear: 0.6 });
      L.addTop('plantSmall', dresser, v(dresser.w / 2 - 0.18, 0));
      const mirrorSeesBed = dot(frontOf(dresser), norm(sub(centerOf(bed), centerOf(dresser)))) > 0.5;
      let hung = null;
      if (!(L.opts.fengShui && mirrorSeesBed) && L.fitsOnWall(dc.wall, dc.t, 0.7, dresser.h + 0.2, dresser.h + 1.1, dresser)) {
        hung = L.addWall('mirror', dc.wall, dc.t, 0.7, 0.9, dresser.h + 0.2, { round: L.rand() < 0.5 });
      }
      if (hung) L.note('Dresser near the door with a mirror above it — a natural getting-ready spot.');
      else {
        L.note('Dresser near the door, where you get ready.');
        L.gallery(dc.wall, dc.t, dresser.w, dresser.h + 0.23, dresser, 'Above the dresser');
      }
    }
  }



  // Reading corner
  if (L.area > 13 && L.want('readingChair')) {
    const as = ITEMS.armchair;
    const cands = L.cornerSpots(as.w + 0.1).map((sp) => {
      // angle the chair 45° into the room
      const a = L.walls[sp.corner], b = L.walls[(sp.corner - 1 + L.poly.length) % L.poly.length];
      const bis = norm(add(a.n, b.n));
      const theta = Math.atan2(bis.y, bis.x) - Math.PI / 2;
      const p = add(L.poly[sp.corner], mul(bis, 0.75));
      return { box: { x: p.x, y: p.y, w: as.w, d: as.d, theta } };
    }).filter((c) => L.canPlace(c.box, { clear: 0.3 }));
    const pick = L.choose(cands, (c) => 3 + 4 / (1 + L.nearestWindowDist(centerOf(c.box))) - 2 / (0.3 + L.doorDistance(centerOf(c.box))));
    if (pick) {
      const chair = L.add('armchair', pick.box, { clear: 0.3 });
      L.note('Reading chair angled into a corner, close to the window light.');
      L.placeFloorLamp(chair, 'beside the reading chair');
    }
  }
  if (L.want('bookshelf')) {
    const bs2 = ITEMS.bookshelf;
    const bc = L.choose(L.wallCandidates(bs2.w, bs2.d, { avoidWindows: true, clear: 0.5 }), (c) => 3 - 1.5 / (0.3 + L.doorDistance(centerOf(c.box))) - (c.wall.i === bedC.wall.i ? 2 : 0));
    if (bc) { L.add('bookshelf', bc.box, { clear: 0.5, books: Math.floor(L.rand() * 1e6) }); L.note('Bookshelf on a solid wall.'); }
  }

  L.gallery(bedC.wall, bedC.t, bed.w, 1.08 + 0.23, bed, 'Above the headboard');
  const spot = L.want('shelves') ? L.findShelfSpot(1.0, 1.2, 1.9) : null;
  if (spot && L.rand() < 0.75) {
    const sh = L.shelves(spot.wall, spot.t, 1.3, 1, Math.min(0.8, spot.width - 0.3));
    if (sh.length) L.note('Floating shelf for books and a trailing plant.');
  }
  L.pendant(L.center, 'in the centre of the ceiling');
  L.placePlants(Math.round(clamp(L.area / 8, 1, 3) * L.style.plants));
  if (L.style.plants >= 1.2 && L.rand() < 0.6) L.hangingPlant();
}

/** A desk against a wall: daylight from the side, door not behind you. */
function placeDesk(L, { avoidWall = -1, laptop = false, label = 'Desk' } = {}) {
  const ds = ITEMS.desk;
  let dw = 1.2, dd = 0.6, cands = [];
  for (const [w, d, clr] of [[1.2, 0.6, 0.9], [1.0, 0.55, 0.8], [0.9, 0.5, 0.75], [0.8, 0.45, 0.7]]) {
    cands = L.wallCandidates(w, d, { clear: clr });
    if (cands.length) { dw = w; dd = d; break; }
  }
  const c = L.choose(cands, (cand) => {
    const p = centerOf(cand.box);
    let sc = 6;
    for (const o of L.windows) {
      if (o.wall === cand.wall.i && Math.abs(o.t - cand.t) < 0.8) sc += 2;
      else sc += 3 / (1 + dist(p, o.pos));
    }
    for (const dr of L.entryDoors) {
      const behind = dot(frontOf(cand.box), norm(sub(dr.pos, p)));
      if (behind > 0.8) sc -= L.opts.fengShui ? 10 : 4;
      else if (behind > 0.3) sc -= L.opts.fengShui ? 4 : 1.5;
    }
    if (cand.wall.i === avoidWall) sc -= 3;
    return sc;
  });
  if (!c) return null;
  const desk = L.add('desk', c.box, { w: dw, d: dd, clear: 0, monitor: !laptop, name: dw < 1.1 ? 'Compact desk' : 'Desk' });
  void ds;
  const cp = add(centerOf(desk), mul(frontOf(desk), desk.d / 2 + 0.15));
  const chairBox = { x: cp.x, y: cp.y, w: 0.6, d: 0.6, theta: desk.theta + Math.PI };
  if (L.canPlace(chairBox, { ignore: [desk.id] })) L.add('deskChair', chairBox, { parent: desk.id });
  const lap = laptop ? L.addTop('laptop', desk, v(0, -0.02)) : null;
  if (!lap) desk.monitor = true;
  L.addTop('deskLamp', desk, v(-desk.w / 2 + 0.12, -desk.d / 2 + 0.12));
  if (desk.w >= 1.0) L.addTop('plantSmall', desk, v(desk.w / 2 - 0.1, -desk.d / 2 + 0.1));
  L.note(`${label} ${L.windows.some((o) => dist(o.pos, centerOf(desk)) < 2.5) ? 'near the window for daylight' : 'on a quiet wall'}${lap ? ', set up with a laptop' : ''}.`);
  return desk;
}

function office(L) {
  const ds = ITEMS.desk;
  const dw = Math.min(ds.w, Math.max(...L.walls.map((w) => w.length)) - 0.3);
  const deskC = L.choose(L.wallCandidates(dw, ds.d, { clear: 0.9 }), (c) => {
    let sc = 8;
    const p = centerOf(c.box);
    // natural light from the side is ideal; window in front is good for views
    let best = 0;
    for (const o of L.windows) {
      const dd = dist(p, o.pos);
      if (o.wall === c.wall.i && Math.abs(o.t - c.t) < 0.8) best = Math.max(best, 3); // facing window
      else best = Math.max(best, 5 / (1 + dd)); // side light
    }
    sc += best;
    // don't sit with your back to the door
    for (const dr of L.entryDoors) {
      const toDoor = norm(sub(dr.pos, p));
      const behind = dot(frontOf(c.box), toDoor); // chair faces -front
      if (behind > 0.8) sc -= L.opts.fengShui ? 10 : 4;
      else if (behind > 0.3) sc -= L.opts.fengShui ? 4 : 1.5;
      else sc += 1;
    }
    return sc;
  });
  if (!deskC) { L.note('Could not fit a desk.'); L.score -= 50; return; }
  const desk = L.add('desk', deskC.box, { w: dw, clear: 0 });
  const cp = add(centerOf(desk), mul(frontOf(desk), desk.d / 2 + 0.15));
  const chairBox = { x: cp.x, y: cp.y, w: 0.6, d: 0.6, theta: desk.theta + Math.PI };
  if (L.canPlace(chairBox, { ignore: [desk.id] })) L.add('deskChair', chairBox, { parent: desk.id });
  // Rug under the desk and chair (big enough that the chair stays on it when pushed back).
  const rugC = add(centerOf(desk), mul(frontOf(desk), 0.45));
  L.placeRug(rugC.x, rugC.y, desk.w + 0.8, 1.8, desk.theta, 'under the desk and chair, so the chair rolls back without leaving it');
  L.addTop('laptop', desk, v(desk.w / 2 - 0.35, 0.02));
  L.addTop('deskLamp', desk, v(-desk.w / 2 + 0.2, -0.1));
  L.addTop('plantSmall', desk, v(desk.w / 2 - 0.15, -0.15));
  const hasSideLight = L.windows.some((o) => dist(o.pos, centerOf(desk)) < 2.5);
  L.note(`Desk ${hasSideLight ? 'near the window for daylight on the work surface' : 'on a quiet wall'}, positioned so the door isn't directly behind you.`);

  // Bookshelves
  const bs = ITEMS.bookshelf;
  let shelves = 0;
  for (let k = 0; k < (L.want('bookshelf') ? 2 : 0); k++) {
    const bc = L.choose(L.wallCandidates(bs.w, bs.d, { avoidWindows: true, clear: 0.5 }), (c) => {
      let sc = 3;
      for (const it of L.items) if (it.type === 'bookshelf') sc += 4 / (0.3 + dist(centerOf(it), centerOf(c.box))) > 3 ? 4 : 0;
      sc -= 1.5 / (0.3 + L.doorDistance(centerOf(c.box)));
      return sc;
    });
    if (!bc) break;
    L.add('bookshelf', bc.box, { clear: 0.5, books: Math.floor(L.rand() * 1e6) });
    shelves++;
  }
  if (shelves) L.note(`${shelves === 2 ? 'Two bookshelves' : 'A bookshelf'} on solid wall for storage.`);

  // Reading chair
  if (L.area > 10 && L.want('readingChair')) {
    const as = ITEMS.armchair;
    const ac = L.choose(L.wallCandidates(as.w, as.d, { clear: 0.3 }), (c) => 2 + 3 / (1 + L.nearestWindowDist(centerOf(c.box))) - dist(centerOf(c.box), centerOf(desk)) * 0.1);
    if (ac) {
      const chair = L.add('armchair', ac.box, { clear: 0.3 });
      L.note('Lounge chair for reading breaks.');
      const st = sideNeighbour(L, chair, 'sideTable', 1);
      if (L.canPlace(st)) L.add('sideTable', st);
      else L.placeFloorLamp(chair, 'next to the lounge chair');
    }
  }

  // Wall decor above the desk
  const sh = L.shelves(deskC.wall, deskC.t, 1.25, 2, Math.min(0.8, dw * 0.6));
  if (sh.length) L.note('Floating shelves above the desk keep essentials within reach.');
  else L.gallery(deskC.wall, deskC.t, dw, 1.25, desk, 'Above the desk');
  const other = L.walls.filter((w) => w.i !== deskC.wall.i).sort((a, b) => b.length - a.length);
  for (const w of other) {
    const free = L.wallFree(w, 1.0, 1.9).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
    if (free && free[1] - free[0] > 1.2 && L.gallery(w, (free[0] + free[1]) / 2, free[1] - free[0] - 0.4, 1.0, null, 'Feature wall', { center: true })) break;
  }
  L.pendant(centerOf(desk), 'over the work area');
  L.placePlants(Math.round(clamp(L.area / 7, 1, 3) * L.style.plants));
}

function dining(L) {
  const bnd = polygonBounds(L.poly);
  // Longest wall direction gives table orientation.
  const longest = L.walls.slice().sort((a, b) => b.length - a.length)[0];
  const theta = Math.atan2(longest.dir.y, longest.dir.x);
  const minSide = Math.min(bnd.w, bnd.h);
  const round = minSide < 3.2 && Math.abs(bnd.w - bnd.h) < 0.8;
  const tableType = round ? 'roundTable' : 'diningTable';
  const ts = ITEMS[tableType];
  let table = null;
  const sizes = round ? [[1.1, 1.1], [0.9, 0.9], [0.8, 0.8]] : [[2.0, 0.95], [1.8, 0.9], [1.6, 0.9], [1.4, 0.85], [1.2, 0.8]];
  const centres = [L.center];
  for (let k = 0; k < 12; k++) centres.push(add(L.center, v((L.rand() - 0.5) * 1.2, (L.rand() - 0.5) * 1.2)));
  outer: for (const pad of [1.6, 1.3, 1.1]) for (const [w, d] of sizes) {
    for (const c of centres) {
      const box = { x: c.x, y: c.y, w, d, theta };
      const zone = { ...box, w: w + pad, d: d + pad }; // chairs + pull-out space
      if (L.canPlace(box) && boxInsidePolygon(zone, L.poly, 0) && !L.keepOut.some((k) => boxesOverlap(zone, k))) {
        table = L.add(tableType, box, { round });
        L.score += w * 3 - dist(c, L.center) * 2 - (pad < 1.6 ? 4 : 0);
        break outer;
      }
    }
  }
  if (!table) { L.note('Not enough space for a dining table with chairs around it.'); L.score -= 50; return; }
  const seats = [];
  const cs = ITEMS.chair;
  if (round) {
    for (let k = 0; k < 4; k++) {
      const a = theta + k * Math.PI / 2;
      const dir = v(Math.cos(a), Math.sin(a));
      const p = add(centerOf(table), mul(dir, table.w / 2 + 0.1));
      seats.push({ x: p.x, y: p.y, w: cs.w, d: cs.d, theta: Math.atan2(dir.y, dir.x) + Math.PI / 2 });
    }
  } else {
    const perSide = table.w >= 1.8 ? 3 : 2;
    for (const side of [-1, 1]) {
      for (let k = 0; k < perSide; k++) {
        const along = (k - (perSide - 1) / 2) * (table.w / perSide);
        const p = add(centerOf(table), add(mul(rightOf(table), along), mul(frontOf(table), side * (table.d / 2 + 0.1))));
        seats.push({ x: p.x, y: p.y, w: cs.w, d: cs.d, theta: side > 0 ? table.theta : table.theta + Math.PI });
      }
    }
    if (table.w >= 1.6) {
      for (const side of [-1, 1]) {
        const p = add(centerOf(table), mul(rightOf(table), side * (table.w / 2 + 0.1)));
        seats.push({ x: p.x, y: p.y, w: cs.w, d: cs.d, theta: table.theta + (side > 0 ? -Math.PI / 2 : Math.PI / 2) });
      }
    }
  }
  // chairs face the table: their "front" points away from table centre, so flip
  let n = 0;
  for (const b of seats) {
    const toT = norm(sub(centerOf(table), centerOf(b)));
    if (dot(frontOf(b), toT) > 0) b.theta += Math.PI;
    if (L.canPlace(b, { ignore: [table.id] })) { L.add('chair', b, { parent: table.id }); n++; }
  }
  L.note(`${round ? 'Round' : `${table.w.toFixed(1)} m`} dining table centred with ${n} chairs and ~80 cm behind each chair to pull out.`);
  L.placeRug(table.x, table.y, table.w + 1.3, table.d + 1.3, table.theta, 'under the table, big enough that chairs stay on it when pulled out');
  L.pendant(centerOf(table), 'hung ~75 cm above the table');

  const sb = ITEMS.sideboard;
  const sc = L.choose(L.wallCandidates(sb.w, sb.d, { clear: 0.6 }), (c) => 4 + Math.min(c.wall.length, 5) * 0.5 - L.windowsOnWall(c.wall, c.t - 0.8, c.t + 0.8).length * 2);
  if (sc) {
    const side = L.add('sideboard', sc.box, { clear: 0.6 });
    L.addTop('tableLamp', side, v(-side.w / 2 + 0.25, 0));
    L.addTop('plantSmall', side, v(side.w / 2 - 0.25, 0));
    L.note('Sideboard for serving and storage, styled with a lamp and a plant.');
    if (!L.gallery(sc.wall, sc.t, side.w, side.h + 0.23, side, 'Above the sideboard')) {
      if (L.fitsOnWall(sc.wall, sc.t, 0.9, side.h + 0.25, side.h + 1.05, side)) L.addWall('mirror', sc.wall, sc.t, 0.9, 0.7, side.h + 0.25, { round: false });
    }
  }
  const spot = L.findShelfSpot(1.0, 1.2, 1.9);
  if (spot) {
    const sh = L.shelves(spot.wall, spot.t, 1.3, 2, Math.min(0.9, spot.width - 0.3));
    if (sh.length) L.note('Floating shelves to display ceramics and cookbooks.');
  }
  L.placePlants(Math.round(clamp(L.area / 8, 1, 3) * L.style.plants));
  if (L.area > 14) L.placeFloorLamp(null);
}

/** Keep the user's own furniture where it is and decorate around it. */
function keepFurniture(L) {
  const room = L.room;
  const placed = [];
  for (const f of room.fixed || []) {
    const spec = ITEMS[f.type] || {};
    const clear = f.type === 'dresser' ? 0.5 : f.type === 'bed' ? 0 : 0;
    placed.push(L.add(f.type, f, { name: f.name || spec.name, h: f.h, fixed: true, clear }));
  }
  const desk = placed.find((i) => i.type === 'desk');
  if (desk && L.addTop('laptop', desk, v(desk.w / 2 - 0.3, 0.05))) L.note('Laptop on the desk next to the monitor.');
  if (desk) {
    const cp = add(centerOf(desk), mul(frontOf(desk), desk.d / 2 + 0.15));
    L.add('deskChair', { x: cp.x, y: cp.y, w: 0.6, d: 0.6, theta: desk.theta + Math.PI }, { parent: desk.id, fixed: true });
  }
  for (const t of room.fixedTop || []) {
    if (t.ceiling) { L.topItems.push({ id: L.nextId++, name: ITEMS[t.type].name, ...t, z: (room.height || 2.5) - 0.25, fixed: true }); continue; }
    const parent = placed[t.parentIndex];
    if (parent) L.addTop(t.type, parent, v(t.offset?.x || 0, t.offset?.y || 0), { fixed: true });
  }
  const rethink = L.opts.rethinkGallery && room.frameInventory;
  for (const w of room.fixedWall || []) {
    if (rethink && w.type === 'frame') continue;
    const it = { id: L.nextId++, name: w.name || ITEMS[w.type]?.name || w.type, depth: 0.03, ...w };
    L.wallItems.push(it);
    // The floor under a wall-hung bike is a walkway: keep it clear.
    if (w.type === 'bike' && L.walls[w.wall]) L.keepOut.push(wallBox(L.walls[w.wall], w.t, w.width, Math.max(0.45, w.depth + 0.1), 0));
  }
  L.note(rethink ? 'Your furniture, bike and projection stay put; your frames are re-planned below for a cozier mix.' : 'Your furniture, gallery, bike and projection stay exactly where you planned them. Everything below is a suggestion to add.');

  const bed = placed.find((i) => i.type === 'bed' || i.type === 'singleBed');
  if (bed) {
    // Keep both long sides of the bed clear for getting in and out (and for any walkway beside it).
    for (const side of [-1, 1]) {
      const len = bed.d - 0.6;
      const c = add(add(centerOf(bed), mul(rightOf(bed), side * (bed.w / 2 + 0.28))), mul(frontOf(bed), 0.3));
      L.keepOut.push({ x: c.x, y: c.y, w: 0.56, d: len, theta: bed.theta });
    }
    const f = frontOf(bed);
    const rugD = Math.min(1.8, bed.d * 0.7);
    const rc = add(centerOf(bed), mul(f, bed.d / 2 - rugD / 2 + 0.5));
    L.placeRug(rc.x, rc.y, bed.w + 0.9, rugD, bed.theta, 'under the foot of the bed, sticking out toward the open floor');
    if (L.want('bench')) L.footBench(bed);
  }

  if (rethink && L.want('frames')) L.galleryFromInventory(room.frameInventory);

  // Full-length mirror: a free stretch of wall at floor level, ideally near the closet/dresser.
  const mirrorCands = [];
  for (const wall of L.want('mirrors') ? L.walls : []) {
    for (const [s, e] of L.wallFree(wall, 0.02, 1.7)) {
      for (const mw of [0.5, 0.36]) {
        if (e - s < mw) continue;
        for (const t of [s + mw / 2, (s + e) / 2, e - mw / 2]) {
          const b = wallBox(wall, t, mw, 0.05, 0);
          if (!L.canPlace(b)) continue;
          if (L.opts.fengShui && bed) {
            if (mirrorSees(wall, t, bed)) continue; // would reflect the bed
          }
          mirrorCands.push({ wall, t, b, mw });
        }
      }
    }
  }
  const closet = L.doors.find((d) => d.swing === 'none' || d.kind === 'wardrobe');
  const mpick = L.choose(mirrorCands, (c) => {
    const p = centerOf(c.b);
    let sc = 3 + c.mw * 4;
    if (closet) sc += 4 / (0.5 + dist(p, closet.pos));
    for (const it of L.items) if (it.type === 'dresser') sc += 2 / (0.5 + dist(p, centerOf(it)));
    for (const o of L.windows) if (o.wall === c.wall.i) sc -= 1; // glare
    return sc;
  });
  if (mpick) {
    const tall = mpick.mw < 0.45 ? 1.22 : 1.5;
    L.addWall('floorMirror', mpick.wall, mpick.t, mpick.mw, tall, 0.05, { depth: 0.05, name: `Full-length mirror ${Math.round(mpick.mw / 0.0254)}×${Math.round(tall / 0.0254)}"` });
    const nearCloset = closet && dist(centerOf(mpick.b), closet.pos) < 1.2;
    L.note(`${Math.round(mpick.mw / 0.0254)}" × ${Math.round(tall / 0.0254)}" full-length mirror wall-mounted on the ${L.wallLabel(mpick.wall)}${nearCloset ? ', right next to the closet for getting dressed' : ''} — mounted flat so it doesn't eat floor space.`);
  } else if (L.want('mirrors') && L.entryDoors.some((d) => d.swing !== 'none')) {
    L.note('No free wall at floor level for a full-length mirror — an over-the-door mirror on the room door is the space-free option.');
  }

  const galleryHasShelf = L.wallItems.some((w) => w.group === 'Your frames' && w.type === 'shelf');
  const spot = galleryHasShelf ? null : L.findShelfSpot(0.8, 1.2, 1.9);
  if (spot) {
    const sh = L.shelves(spot.wall, spot.t, 1.35, spot.width > 1.3 ? 2 : 1, Math.min(0.75, spot.width - 0.25));
    if (sh.length) L.note(`${sh.length === 2 ? 'Two staggered floating shelves' : 'A floating shelf'} with a trailing plant on the free stretch of the ${L.wallLabel(spot.wall)}.`);
  }
  L.placePlants(Math.max(1, Math.round(clamp(L.area / 7, 1, 3) * L.style.plants)));
  if (L.windows.length) L.hangingPlant();
  for (const tip of room.tips || []) L.note(tip);
}

const TEMPLATES = { living: livingRoom, bedroom, office, dining, keep: keepFurniture };

function signature(d) {
  if (d.items.some((i) => i.fixed)) {
    const r = (x) => Math.round(x * 2);
    return d.items.filter((i) => !i.fixed).map((i) => `${i.type}:${r(i.x)},${r(i.y)}`).sort().join('|') + '#' +
      d.wallItems.filter((w) => !w.fixed).map((w) => `${w.type}:${w.wall}:${r(w.t)}`).sort().join('|');
  }
  return d.items.filter((i) => !i.parent && ['sofa', 'loveseat', 'bed', 'singleBed', 'desk', 'diningTable', 'roundTable', 'mediaUnit', 'wardrobe', 'bookshelf', 'dresser', 'sideboard'].includes(i.type))
    .map((i) => `${i.type}:${i.x.toFixed(0)},${i.y.toFixed(0)},${(((i.theta % 6.283) + 6.283) % 6.283).toFixed(1)}`)
    .join('|');
}

/**
 * Generate designs for a room.
 * @param {{points:{x:number,y:number}[], openings:any[], height?:number}} room
 * @param {{roomType:string, style:string, seed?:number, iterations?:number}} opts
 * @returns {object[]} designs sorted best-first (distinct layouts)
 */
export function generateDesigns(room, opts) {
  const template = opts.keep && room.fixed ? keepFurniture : TEMPLATES[opts.roomType] || livingRoom;
  const iterations = opts.iterations ?? 60;
  const seed = opts.seed ?? 1;
  const all = [];
  for (let k = 0; k < iterations; k++) {
    const L = new Layout(room, opts, makeRng(seed * 1000003 + k * 7919 + 13));
    template(L);
    L.evaluate();
    const d = L.toDesign();
    d.fengShui = fengShuiReport(room, d);
    if (opts.fengShui) d.score += d.fengShui.score * 0.4;
    all.push(d);
  }
  all.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const out = [];
  for (const d of all) {
    const s = signature(d);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(d);
    if (out.length >= 4) break;
  }
  // Normalise a 0–100 rating for display.
  for (const d of out) {
    const m = d.metrics;
    d.rating = Math.round(clamp(0.45 * m.flow + 0.25 * Math.min(100, m.openFloor * 1.6) + 0.3 * m.light - m.blocked.length * 15 - (m.doorsOk ? 0 : 30), 0, 100));
  }
  return out;
}

export { accessPoints, frontOf, rightOf };
