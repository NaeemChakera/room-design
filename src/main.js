import {
  v, add, sub, mul, dot, dist, norm, walls as wallsOf, orientInward, closestPointOnSegment,
  area, selfIntersects, boxCorners, pointInPolygon, clamp,
} from './geometry.js';
import { STYLES, ROOM_TYPES, ITEMS, INSPIRATION, FLOORS, surfaces } from './catalog.js';
import { generateDesigns } from './designer.js';
import { drawDesign, drawWalls, drawDimensions, drawFloor, makeView } from './render2d.js';
import { PRESETS, rectRoom } from './presets.js';
import { shoppingList, totals, STORES, LOCAL_LINKS, FLEA_TIPS } from './shopping.js';
import { baguaFrame, baguaCells } from './fengshui.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const IN = 0.0254;
const STORE_KEY = 'roomcraft.v1';

// ---------------------------------------------------------------------------
// Units

function fmtLen(m, units = state.units) {
  if (units === 'metric') return `${m.toFixed(2)} m`;
  let inches = Math.round(m / IN);
  const ft = Math.floor(inches / 12);
  inches -= ft * 12;
  return ft ? `${ft}' ${inches}"` : `${inches}"`;
}

/** Parse "12'", "13' 6\"", "13'6", "162in", "4.2", "4.2 m", "420cm". Returns meters or NaN. */
export function parseLen(str, units = state.units) {
  const s = String(str).trim().toLowerCase().replace(/[’′]/g, "'").replace(/[”″]/g, '"');
  if (!s) return NaN;
  let m;
  if ((m = s.match(/^(-?\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in)?)?$/))) return (parseFloat(m[1]) * 12 + (m[2] ? parseFloat(m[2]) : 0)) * IN;
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*ft\s*(?:(\d+(?:\.\d+)?)\s*(?:in|")?)?$/))) return (parseFloat(m[1]) * 12 + (m[2] ? parseFloat(m[2]) : 0)) * IN;
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)$/))) return parseFloat(m[1]) * IN;
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*cm$/))) return parseFloat(m[1]) / 100;
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*mm$/))) return parseFloat(m[1]) / 1000;
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*m$/))) return parseFloat(m[1]);
  if ((m = s.match(/^(\d+(?:\.\d+)?)$/))) return units === 'metric' ? parseFloat(m[1]) : parseFloat(m[1]) * 12 * IN;
  return NaN;
}

// ---------------------------------------------------------------------------
// State

const state = {
  step: 1,
  units: 'imperial',
  room: { points: [], openings: [], height: 2.44 },
  closed: false,
  draft: [], // points while drawing
  cursor: null,
  selWall: null,
  selOpening: null,
  tool: null,
  roomType: 'bedroom',
  style: 'scandinavian',
  keep: true,
  fengShui: false,
  rethink: false,
  showBagua: true,
  have: [],
  buyFilter: 'all',
  designs: [],
  designIdx: 0,
  seed: 1,
  photo: null, // {src, mpp, opacity}
  view: null,
  view3d: false,
};

function save() {
  try {
    const { room, closed, roomType, style, units, keep, step, fengShui, rethink, showBagua, have } = state;
    localStorage.setItem(STORE_KEY, JSON.stringify({ room, closed, roomType, style, units, keep, fengShui, rethink, showBagua, have, step: Math.min(step, 2), photo: state.photo && state.photo.src.length < 3e6 ? state.photo : null }));
  } catch { /* storage unavailable */ }
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    Object.assign(state, s);
    if (s.photo) loadPhoto(s.photo.src, s.photo);
    return true;
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Canvas & view

const canvas = $('#plan');
const ctx = canvas.getContext('2d');
let dpr = window.devicePixelRatio || 1;
let photoImg = null;

function resizeCanvas() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  if (!state.view) fitView();
  render();
}
new ResizeObserver(resizeCanvas).observe(canvas);

function currentPoly() { return state.closed ? state.room.points : state.draft; }

function fitView() {
  const pts = currentPoly().slice();
  if (photoImg && state.photo) {
    pts.push(v(0, 0), v(photoImg.width * state.photo.mpp, photoImg.height * state.photo.mpp));
  }
  if (!pts.length) {
    state.view = { scale: Math.min(canvas.clientWidth, canvas.clientHeight) / 7, ox: canvas.clientWidth / 2 - 2 * 60, oy: canvas.clientHeight / 2 - 2 * 60 };
    state.view.ox = canvas.clientWidth / 2 - 2.5 * state.view.scale;
    state.view.oy = canvas.clientHeight / 2 - 2.5 * state.view.scale;
    return;
  }
  state.view = makeView(canvas, pts, 60);
}

const toWorld = (sx, sy) => v((sx - state.view.ox) / state.view.scale, (sy - state.view.oy) / state.view.scale);
const toScreen = (p) => v(p.x * state.view.scale + state.view.ox, p.y * state.view.scale + state.view.oy);

function applyWorld() {
  ctx.setTransform(dpr * state.view.scale, 0, 0, dpr * state.view.scale, dpr * state.view.ox, dpr * state.view.oy);
}

function drawGrid() {
  const { scale, ox, oy } = state.view;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const step = state.units === 'metric' ? 0.5 : 12 * IN;
  const major = state.units === 'metric' ? 1 : 12 * IN * 5;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(document.documentElement);
  const dark = css.getPropertyValue('color-scheme').trim() === 'dark';
  for (const [s, color] of [[step, dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'], [major, dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.09)']]) {
    if (s * scale < 8) continue;
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath();
    const x0 = Math.floor(-ox / scale / s) * s, y0 = Math.floor(-oy / scale / s) * s;
    for (let x = x0; x * scale + ox < W; x += s) { const sx = Math.round(x * scale + ox) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, H); }
    for (let y = y0; y * scale + oy < H; y += s) { const sy = Math.round(y * scale + oy) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(W, sy); }
    ctx.stroke();
  }
}

function label(text, p, opts = {}) {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = toScreen(p);
  ctx.font = '600 12px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = opts.bg || 'rgba(35,33,30,0.85)';
  ctx.beginPath(); ctx.roundRect(s.x - w / 2, s.y - 22 - 10, w, 20, 10); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, s.x, s.y - 22);
  ctx.restore();
}

function render() {
  if (!state.view) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  applyWorld();
  if (photoImg && state.photo && state.step === 1) {
    ctx.globalAlpha = state.photo.opacity ?? 0.5;
    ctx.drawImage(photoImg, 0, 0, photoImg.width * state.photo.mpp, photoImg.height * state.photo.mpp);
    ctx.globalAlpha = 1;
  }
  const S = STYLES[state.style] || STYLES.scandinavian;
  const room = state.room;
  const design = state.step === 3 ? state.designs[state.designIdx] : null;
  const neutral = state.room.floor && state.room.floor.type !== 'style' ? surfaces(S, state.room) : { ...S, floor: '#ece7df', floorLine: '#e2dcd2', floorType: 'wood' };

  if (!state.closed) {
    const pts = state.draft;
    if (pts.length) {
      ctx.strokeStyle = '#2d2a26'; ctx.lineWidth = 0.1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (state.cursor) ctx.lineTo(state.cursor.x, state.cursor.y);
      ctx.stroke();
      for (const [i, p] of pts.entries()) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 7 / state.view.scale * (i === 0 && pts.length > 2 ? 1.6 : 1), 0, 7);
        ctx.fillStyle = i === 0 ? '#2d6cdf' : '#fff'; ctx.fill(); ctx.lineWidth = 2 / state.view.scale; ctx.strokeStyle = '#2d6cdf'; ctx.stroke();
      }
      if (state.cursor) {
        const last = pts[pts.length - 1];
        const mid = mul(add(last, state.cursor), 0.5);
        label(fmtLen(dist(last, state.cursor)), mid);
      }
      if (pts.length > 1) drawDimensions(ctx, pts, { ...state.view, dpr }, { closed: false, fmt: fmtLen });
    }
    if (state.cursor) {
      ctx.beginPath(); ctx.arc(state.cursor.x, state.cursor.y, 5 / state.view.scale, 0, 7);
      ctx.fillStyle = '#2d6cdf'; ctx.fill();
    }
    return;
  }

  if (design) {
    drawDesign(ctx, room, design, { hoverId: hover?.id });
    if (state.fengShui && state.showBagua) drawBagua(room);
  } else {
    drawFloor(ctx, room.points, neutral);
    if (room.fixed && state.step >= 1) {
      // show the user's own furniture as outlines while editing
      ctx.save();
      for (const f of room.fixed) {
        const c = boxCorners(f);
        ctx.beginPath(); c.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
        ctx.fillStyle = 'rgba(120,110,95,0.18)'; ctx.fill();
        ctx.setLineDash([0.05, 0.04]); ctx.lineWidth = 0.015; ctx.strokeStyle = '#7a7060'; ctx.stroke();
      }
      ctx.restore();
    }
    drawWalls(ctx, room.points, room.openings, { selected: state.selOpening, openingBg: getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim() || '#fff' });
  }
  if (state.step !== 3 || !state.view3d) {
    drawDimensions(ctx, room.points, { ...state.view, dpr }, { highlight: state.selWall, fmt: fmtLen });
    applyWorld();
  }
  if (state.step === 1) {
    const ws = wallsOf(room.points);
    for (const w of ws) {
      const m = add(w.a, mul(w.dir, w.length / 2));
      ctx.beginPath(); ctx.arc(m.x, m.y, 5 / state.view.scale, 0, 7);
      ctx.fillStyle = state.selWall === w.i ? '#2d6cdf' : 'rgba(45,108,223,0.35)'; ctx.fill();
    }
    for (const p of room.points) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 7 / state.view.scale, 0, 7);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.5 / state.view.scale; ctx.strokeStyle = '#2d6cdf'; ctx.stroke();
    }
  }
  if (state.step === 2 && state.tool && state.cursorWall) {
    const { wall, t } = state.cursorWall;
    const w = state.tool === 'window' ? 0.9 : 0.8;
    const a = add(wall.a, mul(wall.dir, t - w / 2)), b = add(wall.a, mul(wall.dir, t + w / 2));
    ctx.strokeStyle = '#2d6cdf'; ctx.lineWidth = 0.14; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.globalAlpha = 1;
  }
}

function drawBagua(room) {
  const frame = baguaFrame(room);
  if (!frame) return;
  ctx.save();
  ctx.beginPath();
  room.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.clip();
  for (const c of baguaCells(frame)) {
    ctx.beginPath();
    c.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.globalAlpha = 0.16; ctx.fillStyle = c.zone.colors[0]; ctx.fill();
    ctx.globalAlpha = 0.6; ctx.setLineDash([0.06, 0.05]); ctx.lineWidth = 0.012; ctx.strokeStyle = '#5b5750'; ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  ctx.restore();
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const c of baguaCells(frame)) {
    if (!pointInPolygon(c.center, room.points)) continue;
    const s = toScreen(c.center);
    const t = c.zone.name.replace(' (centre)', '');
    const w = ctx.measureText(t).width + 10;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.roundRect(s.x - w / 2, s.y - 9, w, 18, 9); ctx.fill();
    ctx.fillStyle = '#3a3631'; ctx.fillText(t, s.x, s.y + 0.5);
  }
  ctx.restore();
  applyWorld();
}

// ---------------------------------------------------------------------------
// Photo underlay

function loadPhoto(src, opts = {}) {
  const img = new Image();
  img.onload = () => {
    photoImg = img;
    state.photo = { src, mpp: opts.mpp ?? 6 / Math.max(img.width, img.height), opacity: opts.opacity ?? 0.5 };
    $('#photoControls').hidden = false;
    $('#photoOpacity').value = state.photo.opacity;
    if (!state.closed && !state.draft.length) fitView();
    render();
  };
  img.src = src;
}

// ---------------------------------------------------------------------------
// Interaction

const pointers = new Map();
let drag = null;
let hover = null;
let lastTap = 0;

function snapUnit() { return state.units === 'metric' ? 0.05 : IN; }
function snapPoint(p, prev, first) {
  const g = snapUnit();
  let q = v(Math.round(p.x / g) * g, Math.round(p.y / g) * g);
  if (prev) {
    const d = sub(p, prev);
    const ang = Math.abs(Math.atan2(d.y, d.x));
    const tol = 0.14;
    if (ang < tol || Math.abs(ang - Math.PI) < tol) q = v(prev.x + Math.round(d.x / g) * g, prev.y);
    else if (Math.abs(ang - Math.PI / 2) < tol) q = v(prev.x, prev.y + Math.round(d.y / g) * g);
  }
  // also align with the first point to make closing square
  if (first && state.draft.length >= 2) {
    if (Math.abs(q.x - first.x) < 12 / state.view.scale) q.x = first.x;
    if (Math.abs(q.y - first.y) < 12 / state.view.scale) q.y = first.y;
  }
  return q;
}

function eventPos(e) {
  const r = canvas.getBoundingClientRect();
  return v(e.clientX - r.left, e.clientY - r.top);
}

function nearestWall(p, maxPx = 18) {
  const ws = wallsOf(state.room.points);
  let best = null;
  for (const w of ws) {
    const { point, t } = closestPointOnSegment(p, w.a, w.b);
    const d = dist(point, p) * state.view.scale;
    if (d < maxPx && (!best || d < best.d)) best = { wall: w, t: t * w.length, d };
  }
  return best;
}

function hitVertex(p) {
  const pts = state.room.points;
  for (let i = 0; i < pts.length; i++) if (dist(pts[i], p) * state.view.scale < 12) return i;
  return -1;
}
function hitWallHandle(p) {
  const ws = wallsOf(state.room.points);
  for (const w of ws) if (dist(add(w.a, mul(w.dir, w.length / 2)), p) * state.view.scale < 10) return w.i;
  return -1;
}
function hitOpening(p) {
  const ws = wallsOf(state.room.points);
  for (const o of state.room.openings) {
    const w = ws[o.wall];
    if (!w) continue;
    const { point, t } = closestPointOnSegment(p, w.a, w.b);
    if (dist(point, p) * state.view.scale < 16 && Math.abs(t * w.length - o.t) < o.width / 2 + 0.05) return o;
  }
  return null;
}

function closeShape() {
  if (state.draft.length < 3) return;
  state.room = { ...state.room, points: orientInward(state.draft), openings: [] };
  delete state.room.fixed; delete state.room.fixedWall; delete state.room.fixedTop; delete state.room.tips; delete state.room.measuredNote;
  state.draft = [];
  state.closed = true;
  state.cursor = null;
  state.designs = [];
  updateUI();
  render();
  save();
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, eventPos(e));
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    drag = { type: 'pinch', d0: dist(a, b), scale0: state.view.scale, mid: mul(add(a, b), 0.5), view0: { ...state.view } };
    return;
  }
  const sp = eventPos(e);
  const p = toWorld(sp.x, sp.y);
  const now = performance.now();
  const dbl = now - lastTap < 300;
  lastTap = now;

  if (state.step === 1 && !state.closed) {
    drag = { type: 'maybeDraw', start: sp };
    return;
  }
  if (state.step === 1 && state.closed) {
    const vi = hitVertex(p);
    if (vi >= 0) { drag = { type: 'vertex', i: vi }; return; }
    const wi = hitWallHandle(p);
    if (wi >= 0) { state.selWall = wi; drag = { type: 'wall', i: wi, start: p, orig: state.room.points.map((q) => ({ ...q })) }; updateUI(); render(); return; }
    const nw = nearestWall(p);
    if (nw) {
      if (dbl) { splitWall(nw.wall.i, nw.t); return; }
      state.selWall = nw.wall.i; updateUI(); render();
      return;
    }
  }
  if (state.step === 2) {
    const o = hitOpening(p);
    if (o && !state.tool) { state.selOpening = o.id; drag = { type: 'opening', o }; renderOpenings(); render(); return; }
    if (state.tool) {
      const nw = nearestWall(p, 30);
      if (nw) { addOpening(state.tool, nw.wall, nw.t); return; }
    }
  }
  drag = { type: 'pan', start: sp, view0: { ...state.view } };
});

canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, eventPos(e));
  const sp = eventPos(e);
  const p = toWorld(sp.x, sp.y);
  if (drag?.type === 'pinch' && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const k = dist(a, b) / drag.d0;
    zoomAt(drag.mid, drag.scale0 * k / state.view.scale);
    return;
  }
  if (state.step === 1 && !state.closed) {
    if (drag?.type === 'maybeDraw' && dist(sp, drag.start) > 8) drag = { type: 'pan', start: drag.start, view0: { ...state.view } };
    if (drag?.type === 'pan') { panTo(sp); return; }
    const last = state.draft[state.draft.length - 1];
    state.cursor = snapPoint(p, last, state.draft[0]);
    if (state.draft.length > 2 && dist(toScreen(state.draft[0]), sp) < 14) state.cursor = { ...state.draft[0] };
    render();
    return;
  }
  if (!drag) {
    if (state.step === 2) {
      state.cursorWall = state.tool ? nearestWall(p, 30) : null;
      canvas.style.cursor = state.tool ? 'copy' : hitOpening(p) ? 'grab' : 'default';
      render();
    } else if (state.step === 1) {
      canvas.style.cursor = hitVertex(p) >= 0 || hitWallHandle(p) >= 0 ? 'move' : 'default';
    } else if (state.step === 3) {
      updateHover(p, sp);
    }
    return;
  }
  if (drag.type === 'pan') { panTo(sp); return; }
  if (drag.type === 'vertex') {
    const g = snapUnit();
    const pts = state.room.points;
    const n = pts.length;
    let q = v(Math.round(p.x / g) * g, Math.round(p.y / g) * g);
    // snap to orthogonal with neighbours
    for (const nb of [pts[(drag.i + n - 1) % n], pts[(drag.i + 1) % n]]) {
      if (Math.abs(q.x - nb.x) * state.view.scale < 10) q.x = nb.x;
      if (Math.abs(q.y - nb.y) * state.view.scale < 10) q.y = nb.y;
    }
    pts[drag.i] = q;
    geometryChanged();
    return;
  }
  if (drag.type === 'wall') {
    const w = wallsOf(drag.orig)[drag.i];
    const g = snapUnit();
    const off = Math.round(dot(sub(p, drag.start), w.n) / g) * g;
    const pts = drag.orig.map((q) => ({ ...q }));
    const n = pts.length;
    pts[drag.i] = add(pts[drag.i], mul(w.n, off));
    pts[(drag.i + 1) % n] = add(pts[(drag.i + 1) % n], mul(w.n, off));
    state.room.points = pts;
    geometryChanged();
    return;
  }
  if (drag.type === 'opening') {
    const w = wallsOf(state.room.points)[drag.o.wall];
    const { t } = closestPointOnSegment(p, w.a, w.b);
    const g = snapUnit();
    drag.o.t = clamp(Math.round((t * w.length) / g) * g, drag.o.width / 2, w.length - drag.o.width / 2);
    renderOpenings(true);
    render();
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (drag?.type === 'maybeDraw') {
    const sp = eventPos(e);
    const p = toWorld(sp.x, sp.y);
    const last = state.draft[state.draft.length - 1];
    if (state.draft.length > 2 && dist(toScreen(state.draft[0]), sp) < 14) { closeShape(); drag = null; return; }
    const q = snapPoint(p, last, state.draft[0]);
    if (!last || dist(q, last) > 0.05) state.draft.push(q);
    updateHint();
    render();
  }
  if (drag && ['vertex', 'wall', 'opening'].includes(drag.type)) { state.designs = []; save(); updateUI(); }
  if (pointers.size === 0) drag = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { state.cursor = state.closed ? null : state.cursor; $('#tooltip').hidden = true; });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(eventPos(e), Math.exp(-e.deltaY * 0.0015));
}, { passive: false });

function zoomAt(sp, k) {
  const before = toWorld(sp.x, sp.y);
  state.view.scale = clamp(state.view.scale * k, 8, 800);
  state.view.ox = sp.x - before.x * state.view.scale;
  state.view.oy = sp.y - before.y * state.view.scale;
  render();
}
function panTo(sp) {
  state.view.ox = drag.view0.ox + (sp.x - drag.start.x);
  state.view.oy = drag.view0.oy + (sp.y - drag.start.y);
  render();
}

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if (state.step === 1 && !state.closed) {
    if (e.key === 'Enter') closeShape();
    if (e.key === 'Backspace' || (e.key === 'z' && (e.metaKey || e.ctrlKey))) { state.draft.pop(); render(); updateHint(); }
    if (e.key === 'Escape') { state.draft = []; render(); updateHint(); }
  }
  if (state.step === 2 && (e.key === 'Delete' || e.key === 'Backspace') && state.selOpening) removeOpening(state.selOpening);
  if (state.step === 2 && e.key === 'Escape') setTool(null);
});

function updateHover(p, sp) {
  const d = state.designs[state.designIdx];
  if (!d || state.view3d) return;
  let found = null;
  const ws = wallsOf(state.room.points);
  for (const wi of d.wallItems) {
    const w = ws[wi.wall];
    const c = add(add(w.a, mul(w.dir, wi.t)), mul(w.n, 0.06));
    const box = { x: c.x, y: c.y, w: wi.width, d: 0.2, theta: Math.atan2(w.dir.y, w.dir.x) };
    if (pointInPolygon(p, boxCorners(box))) { found = { ...wi, label: `${wi.name} · ${fmtLen(wi.width)} wide · ${fmtLen(wi.z)} off the floor` }; break; }
  }
  if (!found) for (const t of d.topItems) if (dist(p, v(t.x, t.y)) < 0.14) { found = { ...t, label: t.name }; break; }
  if (!found) {
    for (const it of d.items.slice().reverse()) {
      if (pointInPolygon(p, boxCorners(it))) { found = { ...it, label: `${it.name} · ${fmtLen(it.w)} × ${fmtLen(it.d)}` }; break; }
    }
  }
  const tip = $('#tooltip');
  if (found) {
    tip.hidden = false;
    tip.textContent = found.label + (found.fixed ? ' (yours)' : '');
    tip.style.left = `${Math.min(sp.x + 14, canvas.clientWidth - tip.offsetWidth - 8)}px`;
    tip.style.top = `${sp.y + 14}px`;
  } else tip.hidden = true;
  if ((hover?.id) !== (found?.id)) { hover = found; render(); }
}

// ---------------------------------------------------------------------------
// Geometry editing

function geometryChanged() {
  const ws = wallsOf(state.room.points);
  for (const o of state.room.openings) {
    const w = ws[o.wall];
    if (w) o.t = clamp(o.t, o.width / 2, Math.max(o.width / 2, w.length - o.width / 2));
  }
  render();
  renderWalls(true);
}

function splitWall(i, t) {
  const pts = state.room.points;
  const w = wallsOf(pts)[i];
  const g = snapUnit();
  const tt = Math.round(t / g) * g;
  if (tt < 0.1 || tt > w.length - 0.1) return;
  pts.splice(i + 1, 0, add(w.a, mul(w.dir, tt)));
  for (const o of state.room.openings) {
    if (o.wall > i) o.wall++;
    else if (o.wall === i && o.t > tt) { o.wall = i + 1; o.t -= tt; }
  }
  remapFixedWall(i, tt);
  state.selWall = i;
  geometryChanged();
  updateUI();
  save();
}

function remapFixedWall(i, tt) {
  for (const wi of state.room.fixedWall || []) {
    if (wi.wall > i) wi.wall++;
    else if (wi.wall === i && wi.t > tt) { wi.wall = i + 1; wi.t -= tt; }
  }
}

/** Change wall i length by moving its end vertex (and everything after it until the closing wall). */
function setWallLength(i, L) {
  const pts = state.room.points;
  const n = pts.length;
  const w = wallsOf(pts)[i];
  const delta = L - w.length;
  if (!Number.isFinite(L) || L < 0.2) return;
  const shift = mul(w.dir, delta);
  // move vertices i+1 .. n-1 (wall n-1 closes back to vertex 0 and absorbs the change)
  const last = i === n - 1 ? null : n - 1;
  if (last === null) {
    // closing wall: move vertex 0 backwards instead
    pts[0] = add(pts[0], shift);
  } else {
    for (let k = i + 1; k <= last; k++) {
      // only move vertices that lie "after" the wall along its direction to keep orthogonal shapes intact
      if (dot(sub(pts[k], w.a), w.dir) >= w.length - 1e-6) pts[k] = add(pts[k], shift);
    }
  }
  geometryChanged();
  updateUI();
  save();
}

function scaleRoom(k) {
  state.room.points = state.room.points.map((p) => mul(p, k));
  for (const o of state.room.openings) { o.t *= k; o.width *= k; }
  for (const f of state.room.fixed || []) { f.x *= k; f.y *= k; f.w *= k; f.d *= k; }
  for (const f of state.room.fixedWall || []) { f.t *= k; f.width *= k; }
  for (const f of state.room.fixedTop || []) if (f.ceiling) { f.x *= k; f.y *= k; }
  if (state.photo) state.photo.mpp *= k;
  state.designs = [];
  fitView();
  geometryChanged();
  updateUI();
  save();
}

let openingSeq = 1;
function addOpening(kind, wall, t) {
  const width = kind === 'window' ? Math.min(1.2, wall.length - 0.2) : Math.min(0.82, wall.length - 0.1);
  const o = {
    id: `o${Date.now().toString(36)}${openingSeq++}`,
    type: kind === 'window' ? 'window' : 'door',
    wall: wall.i, width,
    t: clamp(t, width / 2, wall.length - width / 2),
    hinge: 'left',
  };
  if (kind === 'opening') o.swing = 'none';
  if (o.type === 'window') { o.sill = 0.9; o.height = 1.2; }
  state.room.openings.push(o);
  state.selOpening = o.id;
  setTool(null);
  state.designs = [];
  renderOpenings();
  render();
  save();
}

function removeOpening(id) {
  state.room.openings = state.room.openings.filter((o) => o.id !== id);
  state.selOpening = null;
  state.designs = [];
  renderOpenings(); render(); save();
}

function setTool(t) {
  state.tool = t;
  $$('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  updateHint();
  render();
}

// ---------------------------------------------------------------------------
// Panels

function updateHint() {
  const h = $('#hint');
  if (state.step === 1 && !state.closed) {
    h.textContent = state.draft.length === 0 ? 'Tap the first corner of your room.'
      : state.draft.length < 3 ? 'Tap the next corner. Lines snap to right angles. Backspace undoes.'
        : 'Keep tapping corners — tap the blue first corner (or press Enter) to close the room.';
  } else if (state.step === 1) {
    h.textContent = 'Drag corners or the dots on walls. Double-tap a wall to add a corner. Type exact wall lengths in the panel.';
  } else if (state.step === 2) {
    h.textContent = state.tool ? `Tap a wall to place the ${state.tool === 'opening' ? 'doorway' : state.tool}.` : 'Choose Door, Doorway or Window, then tap a wall. Drag to slide.';
  } else {
    h.textContent = state.designs.length ? '' : 'Choose a room type and style, then press “Design my room”.';
  }
}

function renderWalls(valuesOnly = false) {
  const card = $('#wallCard');
  card.hidden = !state.closed;
  if (!state.closed) return;
  const ws = wallsOf(state.room.points);
  const list = $('#wallList');
  if (!valuesOnly || list.children.length !== ws.length) {
    list.innerHTML = '';
    for (const w of ws) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="n">${w.i + 1}</span><input type="text" aria-label="Wall ${w.i + 1} length" /><span class="grow"></span><button class="btn ghost small" data-scale title="Use this wall to scale the whole plan">Set scale</button>`;
      const inp = li.querySelector('input');
      inp.addEventListener('focus', () => { state.selWall = w.i; renderWalls(true); render(); });
      inp.addEventListener('change', () => setWallLength(w.i, parseLen(inp.value)));
      li.querySelector('[data-scale]').addEventListener('click', () => {
        const real = parseLen(prompt(`Real length of wall ${w.i + 1}? (e.g. 12' 6" or 3.8 m)`, fmtLen(wallsOf(state.room.points)[w.i].length)) || '');
        if (Number.isFinite(real) && real > 0) scaleRoom(real / wallsOf(state.room.points)[w.i].length);
      });
      list.appendChild(li);
    }
  }
  ws.forEach((w, k) => {
    const li = list.children[k];
    li.classList.toggle('sel', state.selWall === w.i);
    const inp = li.querySelector('input');
    if (document.activeElement !== inp) inp.value = fmtLen(w.length);
    const ops = state.room.openings.filter((o) => o.wall === w.i);
    li.querySelector('.grow').textContent = ops.map((o) => (o.type === 'window' ? 'window' : o.swing === 'none' ? 'doorway' : 'door')).join(', ');
  });
  $('#areaInfo').textContent = `Floor area ${state.units === 'metric' ? `${area(state.room.points).toFixed(1)} m²` : `${(area(state.room.points) / 0.092903).toFixed(0)} sq ft`}`;
  $('#shapeWarn').hidden = !selfIntersects(state.room.points);
  if (document.activeElement !== $('#ceiling')) $('#ceiling').value = fmtLen(state.room.height || 2.44);
}

function renderOpenings(valuesOnly = false) {
  const list = $('#openingList');
  const ws = wallsOf(state.room.points);
  if (valuesOnly) {
    for (const li of list.children) {
      const o = state.room.openings.find((x) => x.id === li.dataset.id);
      if (!o) continue;
      const inp = li.querySelector('[data-f="t"]');
      if (inp && document.activeElement !== inp) inp.value = fmtLen(o.t - o.width / 2);
    }
    return;
  }
  list.innerHTML = '';
  if (!state.room.openings.length) {
    list.innerHTML = '<li class="muted small">No doors or windows yet. Most rooms have at least one door — the designer keeps its swing clear.</li>';
  }
  for (const o of state.room.openings) {
    const li = document.createElement('li');
    li.dataset.id = o.id;
    li.classList.toggle('sel', state.selOpening === o.id);
    const kind = o.type === 'window' ? 'Window' : o.swing === 'none' ? 'Doorway' : 'Door';
    li.innerHTML = `<span class="title">${kind} · wall ${o.wall + 1}</span>
      <button class="btn ghost small" data-act="del" title="Delete">✕</button>
      <label>Width <input data-f="width" type="text" value="${fmtLen(o.width)}" /></label>
      <label>From corner <input data-f="t" type="text" value="${fmtLen(o.t - o.width / 2)}" /></label>
      ${o.type === 'window' ? `<label>Sill <input data-f="sill" type="text" value="${fmtLen(o.sill ?? 0.9)}" /></label><label>Height <input data-f="height" type="text" value="${fmtLen(o.height ?? 1.2)}" /></label>` : ''}
      ${o.type === 'door' && o.swing !== 'none' ? '<button class="btn ghost small" data-act="flip">⇄ Flip hinge</button>' : ''}`;
    li.addEventListener('click', (e) => {
      if (e.target.matches('input')) return;
      state.selOpening = o.id;
      list.querySelectorAll('li').forEach((x) => x.classList.toggle('sel', x === li));
      render();
    });
    li.querySelector('[data-act="del"]').addEventListener('click', () => removeOpening(o.id));
    li.querySelector('[data-act="flip"]')?.addEventListener('click', () => { o.hinge = o.hinge === 'right' ? 'left' : 'right'; render(); save(); });
    li.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', () => {
      const val = parseLen(inp.value);
      if (!Number.isFinite(val)) return;
      const w = ws[o.wall];
      if (inp.dataset.f === 'width') { o.width = clamp(val, 0.3, w.length); o.t = clamp(o.t, o.width / 2, w.length - o.width / 2); }
      if (inp.dataset.f === 't') o.t = clamp(val + o.width / 2, o.width / 2, w.length - o.width / 2);
      if (inp.dataset.f === 'sill') o.sill = val;
      if (inp.dataset.f === 'height') o.height = val;
      state.designs = [];
      renderOpenings(); render(); save();
    }));
    list.appendChild(li);
  }
}

function renderSurfaces() {
  const fl = state.room.floor || { type: 'style' };
  const box = $('#floorTypes');
  box.innerHTML = '';
  for (const [k, f] of Object.entries(FLOORS)) {
    const b = document.createElement('button');
    b.textContent = f.name;
    b.classList.toggle('active', fl.type === k);
    b.addEventListener('click', () => {
      state.room.floor = k === 'style' ? { type: 'style' } : { type: k, color: FLOORS[k].color };
      surfacesChanged();
    });
    box.appendChild(b);
  }
  $('#floorColorWrap').hidden = fl.type === 'style';
  if (fl.type !== 'style') $('#floorColor').value = fl.color || FLOORS[fl.type].color;
  const S = STYLES[state.style] || STYLES.scandinavian;
  $('#wallColor').value = state.room.wallColor || S.wall;
  $('#wallStyle').checked = !state.room.wallColor;
}

let surfaceTimer = null;
function surfacesChanged(rerun = true) {
  renderSurfaces();
  save();
  render();
  clearTimeout(surfaceTimer);
  // Rugs depend on the floor, so re-run the designer; colour-only tweaks just repaint.
  surfaceTimer = setTimeout(() => { if (rerun && state.designs.length) runDesign(false); else { renderResults(); update3D(); } }, 150);
}

function renderDesignControls() {
  renderSurfaces();
  const rt = $('#roomTypes');
  rt.innerHTML = '';
  for (const [k, r] of Object.entries(ROOM_TYPES)) {
    const b = document.createElement('button');
    b.textContent = r.name;
    b.classList.toggle('active', state.roomType === k);
    b.addEventListener('click', () => { state.roomType = k; renderDesignControls(); save(); });
    rt.appendChild(b);
  }
  $('#keepWrap').hidden = !state.room.fixed;
  $('#keepToggle').checked = state.keep;
  $('#rethinkWrap').hidden = !(state.room.frameInventory && state.keep);
  $('#rethinkToggle').checked = state.rethink;
  $('#fsToggle').checked = state.fengShui;
  const st = $('#styles');
  st.innerHTML = '';
  for (const [k, s] of Object.entries(STYLES)) {
    const b = document.createElement('button');
    b.innerHTML = `<div class="swatch">${[s.wall, s.floor, s.fabric, s.wood, s.accent, s.art[0]].map((c) => `<i style="background:${c}"></i>`).join('')}</div>${s.name}`;
    b.classList.toggle('active', state.style === k);
    b.addEventListener('click', () => {
      state.style = k;
      renderDesignControls();
      renderSurfaces();
      save();
      if (state.designs.length) runDesign(false);
    });
    st.appendChild(b);
  }
  $('#inspo').innerHTML = INSPIRATION.map((t) => `<li>${t}</li>`).join('');
}

function runDesign(newSeed = true) {
  if (newSeed && state.designs.length) state.seed++;
  const keep = state.keep && !!state.room.fixed;
  const btn = $('#generate');
  btn.disabled = true; btn.textContent = 'Designing…';
  setTimeout(() => {
    state.designs = generateDesigns(state.room, { roomType: state.roomType, style: state.style, seed: state.seed, iterations: 70, keep, fengShui: state.fengShui, rethinkGallery: keep && state.rethink });
    state.designIdx = 0;
    btn.disabled = false; btn.textContent = '🔄 Try more layouts';
    renderResults();
    render();
    update3D();
    updateHint();
  }, 20);
}

function renderResults() {
  const d = state.designs[state.designIdx];
  $('#results').hidden = !d;
  if (!d) return;
  const alts = $('#alts');
  alts.innerHTML = '';
  state.designs.forEach((ds, i) => {
    const b = document.createElement('button');
    b.classList.toggle('active', i === state.designIdx);
    const c = document.createElement('canvas');
    b.appendChild(c);
    b.append(`${ds.rating}/100`);
    b.addEventListener('click', () => { state.designIdx = i; renderResults(); render(); update3D(); });
    alts.appendChild(b);
    requestAnimationFrame(() => {
      const r = window.devicePixelRatio || 1;
      c.width = c.clientWidth * r; c.height = c.clientHeight * r;
      const vw = makeView(c, state.room.points, 6);
      const g = c.getContext('2d');
      g.setTransform(r * vw.scale, 0, 0, r * vw.scale, r * vw.ox, r * vw.oy);
      drawDesign(g, state.room, ds);
    });
  });
  const m = d.metrics;
  $('#metrics').innerHTML = [
    [`${d.rating}`, 'Design score'],
    [`${m.flow}%`, 'Floor reachable from door'],
    [`${m.light}%`, 'Room well lit'],
  ].map(([b, s]) => `<div class="metric"><b>${b}</b><span>${s}</span></div>`).join('');
  $('#notes').innerHTML = d.notes.map((n) => `<li>${n}</li>`).join('') + (m.blocked.length ? `<li class="warn">Hard to reach: ${m.blocked.join(', ')}</li>` : '');
  const rows = new Map();
  const addRow = (name, dims, fixed) => {
    const key = name + dims + fixed;
    const r = rows.get(key) || { name, dims, n: 0, fixed };
    r.n++; rows.set(key, r);
  };
  for (const it of d.items) addRow(it.name, it.flat ? `${fmtLen(it.w)} × ${fmtLen(it.d)}` : `${fmtLen(it.w)} × ${fmtLen(it.d)}${it.h ? ` × ${fmtLen(it.h)}h` : ''}`, !!it.fixed);
  for (const wi of d.wallItems) addRow(wi.name, `${fmtLen(wi.width)} × ${fmtLen(wi.height)} @ ${fmtLen(wi.z)}`, !!wi.fixed);
  for (const t of d.topItems) addRow(t.name, '', !!t.fixed);
  const sorted = [...rows.values()].sort((a, b) => a.fixed - b.fixed);
  $('#shop').innerHTML = sorted.map((r) => `<tr class="${r.fixed ? 'fixed' : ''}"><td>${r.n > 1 ? `${r.n} × ` : ''}${r.name}</td><td>${r.dims}</td></tr>`).join('');
  renderFengShui(d);
  renderBuyList(d);
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderFengShui(d) {
  $('#fsPanel').hidden = !state.fengShui;
  if (!state.fengShui || !d.fengShui) return;
  const fs = d.fengShui;
  $('#fsScore').textContent = `${fs.score}/100`;
  const icon = { good: '✓', warn: '!', bad: '✕', tip: 'i' };
  const order = { bad: 0, warn: 1, tip: 2, good: 3 };
  $('#fsChecks').innerHTML = fs.checks.slice().sort((a, b) => order[a.status] - order[b.status]).map((c) => `<li class="${c.status}"><b>${icon[c.status]} ${esc(c.title)}</b>${esc(c.detail)}${c.fix ? `<div class="fix"><b style="display:inline">Fix:</b> ${esc(c.fix)}</div>` : ''}</li>`).join('');
  $('#fsZones').innerHTML = fs.zones.map((z) => `<div><b><i style="background:${z.colors[0]}"></i>${esc(z.name)}</b>${z.element} · ${esc(z.tip)}${z.contains.length ? `<br><span class="muted">Here now: ${esc([...new Set(z.contains)].slice(0, 3).join(', '))}</span>` : ''}</div>`).join('');
  $('#baguaToggle').checked = state.showBagua;
}

let buyRows = [];
function renderBuyList(d) {
  const styleName = (STYLES[state.style] || STYLES.scandinavian).name;
  buyRows = shoppingList(d, { styleName });
  const have = new Set(state.have);
  const list = $('#buyList');
  const show = buyRows.filter((r) => state.buyFilter === 'all' || (state.buyFilter === 'thrift' ? r.shop.verdict === 'thrift' : r.shop.verdict === 'new'));
  const verdictLabel = { thrift: 'Thrift it', new: 'Buy new', either: 'New or used' };
  list.innerHTML = show.length ? show.map((r) => {
    const stores = STORES.slice().sort((a, b) => (r.shop.verdict === 'thrift' ? (a.kind === 'new') - (b.kind === 'new') : (a.kind !== 'new') - (b.kind !== 'new')));
    return `<li class="${have.has(r.key) ? 'have' : ''}" data-key="${esc(r.key)}">
      <label class="top"><input type="checkbox" ${have.has(r.key) ? 'checked' : ''} aria-label="I already have this" />
        <span><span class="name">${r.qty > 1 ? `${r.qty} × ` : ''}${esc(r.name)}</span> <span class="size">${esc(r.size)}</span></span></label>
      <div class="price">New $${r.shop.new[0]}–${r.shop.new[1]} · Secondhand $${r.shop.used[0]}–${r.shop.used[1]} <span class="badge ${r.shop.verdict}">${verdictLabel[r.shop.verdict]}</span></div>
      <div class="tip">${esc(r.shop.tip)}</div>
      <div class="links">${stores.map((st) => `<a href="${st.url(r.query)}" target="_blank" rel="noopener" class="${st.kind !== 'new' ? 'used' : ''}">${st.name}</a>`).join('')}</div>
    </li>`;
  }).join('') : '<li class="muted small">Nothing in this filter.</li>';
  list.querySelectorAll('li[data-key] input').forEach((inp) => inp.addEventListener('change', (e) => {
    const key = e.target.closest('li').dataset.key;
    const s2 = new Set(state.have);
    if (e.target.checked) s2.add(key); else s2.delete(key);
    state.have = [...s2];
    save();
    renderBuyList(d);
  }));
  const t = totals(buyRows, have);
  $('#buyTotal').textContent = t.newHi ? `≈ $${t.mixLo}–${t.mixHi} thrifting · $${t.newLo}–${t.newHi} new` : 'all set';
  $$('#buyFilter button').forEach((b) => b.classList.toggle('active', b.dataset.f === state.buyFilter));
  $('#localLinks').innerHTML = LOCAL_LINKS.map((l) => `<a href="${l.url}" target="_blank" rel="noopener">📍 ${l.name}</a>`).join(' · ');
  $('#fleaTips').innerHTML = FLEA_TIPS.map((x) => `<li>${esc(x)}</li>`).join('');
}

function buyListText() {
  const have = new Set(state.have);
  const lines = buyRows.filter((r) => !have.has(r.key)).map((r) => `☐ ${r.qty > 1 ? `${r.qty} × ` : ''}${r.name} — ${r.size} — new $${r.shop.new[0]}–${r.shop.new[1]}, used $${r.shop.used[0]}–${r.shop.used[1]}${r.shop.verdict === 'thrift' ? ' (look secondhand first)' : r.shop.verdict === 'new' ? ' (buy new)' : ''}`);
  const t = totals(buyRows, have);
  return `Roomcraft shopping list\n\n${lines.join('\n')}\n\nBudget: about $${t.mixLo}–${t.mixHi} thrifting, $${t.newLo}–${t.newHi} all new.`;
}

let v3d = null;
async function update3D() {
  if (!state.view3d) return;
  const d = state.designs[state.designIdx];
  const box = $('#view3d');
  try {
    if (!v3d) {
      const probe = document.createElement('canvas');
      if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) {
        throw new Error('This browser has WebGL turned off or unavailable, so the 3D view can\'t run. Try another browser, or enable hardware acceleration in your browser settings.');
      }
      box.querySelector('.err3d')?.remove();
      const { View3D } = await import('./view3d.js');
      v3d = new View3D(box);
    }
    v3d.setScene(state.room, d);
  } catch (err) {
    console.error(err);
    v3d?.dispose?.();
    v3d = null;
    box.innerHTML = `<div class="err3d"><b>3D view couldn't load</b><p>${String(err?.message || err).replace(/</g, '&lt;')}</p><p class="small">The floor plan still works. Reload the page to try again.</p></div>`;
  }
}

function setView3D(on) {
  state.view3d = on;
  $$('#viewTabs button').forEach((b) => b.classList.toggle('active', (b.dataset.view === '3d') === on));
  $('#view3d').hidden = !on;
  canvas.style.visibility = on ? 'hidden' : 'visible';
  $('#tooltip').hidden = true;
  if (on) update3D();
  else render();
}

function goStep(n) {
  if (n > 1 && !state.closed) return;
  state.step = n;
  $$('.step-panel').forEach((p) => (p.hidden = +p.dataset.panel !== n));
  $$('#steps button').forEach((b) => {
    b.classList.toggle('active', +b.dataset.step === n);
    b.disabled = +b.dataset.step > 1 && !state.closed;
  });
  $('#viewTabs').hidden = n !== 3;
  if (n !== 3 && state.view3d) setView3D(false);
  if (n !== 2) setTool(null);
  if (n === 3) {
    renderDesignControls();
    if (!state.designs.length && state.room.fixed) state.roomType = 'bedroom';
    renderResults();
  }
  if (n === 2) renderOpenings();
  updateUI();
  updateHint();
  render();
  save();
}

function updateUI() {
  $('#toStep2').disabled = !state.closed;
  $$('#steps button').forEach((b) => { b.disabled = +b.dataset.step > 1 && !state.closed; });
  renderWalls();
  const note = $('#measureNote');
  note.hidden = !state.room.measuredNote;
  note.innerHTML = state.room.measuredNote ? `<b>About these measurements</b><p class="small muted">${state.room.measuredNote}</p>` : '';
}

function loadRoom(room, extra = {}) {
  state.room = room;
  state.closed = true;
  state.draft = [];
  state.designs = [];
  state.selWall = null;
  state.selOpening = null;
  Object.assign(state, extra);
  fitView();
  updateUI();
  render();
  save();
}

// ---------------------------------------------------------------------------
// Wire up

$$('#steps button').forEach((b) => b.addEventListener('click', () => goStep(+b.dataset.step)));
$('#toStep2').addEventListener('click', () => goStep(2));
$('#toStep3').addEventListener('click', () => goStep(3));
$('#backTo1').addEventListener('click', () => goStep(1));
$('#backTo2').addEventListener('click', () => goStep(2));
$$('.tool').forEach((b) => b.addEventListener('click', () => setTool(state.tool === b.dataset.tool ? null : b.dataset.tool)));
$('#generate').addEventListener('click', () => runDesign(true));
$('#floorColor').addEventListener('input', (e) => { if (state.room.floor) { state.room.floor.color = e.target.value; surfacesChanged(false); } });
$('#wallColor').addEventListener('input', (e) => { state.room.wallColor = e.target.value; surfacesChanged(false); });
$('#wallStyle').addEventListener('change', (e) => {
  if (e.target.checked) delete state.room.wallColor;
  else state.room.wallColor = $('#wallColor').value;
  surfacesChanged(false);
});
$('#keepToggle').addEventListener('change', (e) => { state.keep = e.target.checked; renderDesignControls(); save(); if (state.designs.length) runDesign(false); });
$('#rethinkToggle').addEventListener('change', (e) => { state.rethink = e.target.checked; save(); if (state.designs.length) runDesign(false); });
$('#fsToggle').addEventListener('change', (e) => { state.fengShui = e.target.checked; save(); if (state.designs.length) runDesign(false); });
$('#baguaToggle').addEventListener('change', (e) => { state.showBagua = e.target.checked; save(); render(); });
$$('#buyFilter button').forEach((b) => b.addEventListener('click', () => { state.buyFilter = b.dataset.f; renderBuyList(state.designs[state.designIdx]); }));
$('#copyList').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(buyListText()); $('#copyList').textContent = '✓ Copied'; } catch { prompt('Copy your list:', buyListText()); }
  setTimeout(() => { $('#copyList').textContent = '📋 Copy list'; }, 1500);
});
$('#printList').addEventListener('click', () => {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Shopping list</title><style>body{font:15px/1.5 system-ui,sans-serif;margin:32px;max-width:700px}li{margin:6px 0}</style><h1>Shopping list</h1><pre style="white-space:pre-wrap;font:inherit">${esc(buyListText())}</pre><h2>Flea market tips</h2><ul>${FLEA_TIPS.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`);
  w.document.close(); w.focus(); w.print();
});
$$('#viewTabs button').forEach((b) => b.addEventListener('click', () => setView3D(b.dataset.view === '3d')));
$('#zoomIn').addEventListener('click', () => zoomAt(v(canvas.clientWidth / 2, canvas.clientHeight / 2), 1.25));
$('#zoomOut').addEventListener('click', () => zoomAt(v(canvas.clientWidth / 2, canvas.clientHeight / 2), 0.8));
$('#zoomFit').addEventListener('click', () => { fitView(); render(); });
$('#units').addEventListener('change', (e) => {
  state.units = e.target.value;
  renderWalls(); renderOpenings(); if (state.designs.length) renderResults(); render(); save();
});
$('#ceiling').addEventListener('change', (e) => { const h = parseLen(e.target.value); if (h > 1.8 && h < 6) { state.room.height = h; save(); } renderWalls(); });

const presetSel = $('#presetSelect');
for (const [k, p] of Object.entries(PRESETS)) presetSel.add(new Option(p.label, k));
$('#loadPreset').addEventListener('click', () => {
  const p = PRESETS[presetSel.value];
  loadRoom(p.make(), { roomType: p.roomType || state.roomType, keep: !!p.keep });
});
$('#drawNew').addEventListener('click', () => {
  state.closed = false;
  state.draft = [];
  state.room = { points: [], openings: [], height: state.room.height || 2.44 };
  state.designs = [];
  fitView(); updateUI(); updateHint(); render(); save();
});
$('#makeRect').addEventListener('click', () => {
  const W = parseLen($('#rectW').value), L = parseLen($('#rectL').value);
  if (!(W > 0.5 && L > 0.5)) return alert('Enter both sides, e.g. 12\' and 13\' 6" or 3.6 and 4.1 m');
  const r = rectRoom(+W.toFixed(4), +L.toFixed(4));
  r.name = 'Rectangle';
  loadRoom(r);
});
$('#photoInput').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    loadPhoto(reader.result);
    if (state.closed && !confirm('Start a new outline over this photo?')) return;
    state.closed = false; state.draft = []; state.room = { points: [], openings: [], height: state.room.height || 2.44 };
    updateUI(); updateHint();
  };
  reader.readAsDataURL(f);
});
$('#photoOpacity').addEventListener('input', (e) => { if (state.photo) { state.photo.opacity = +e.target.value; render(); } });
$('#photoRemove').addEventListener('click', () => { photoImg = null; state.photo = null; $('#photoControls').hidden = true; $('#photoInput').value = ''; render(); save(); });

function download(name, href) {
  const a = document.createElement('a');
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}
$('#exportPng').addEventListener('click', () => {
  if (state.view3d && v3d) return download('room-design-3d.png', v3d.snapshot());
  download('room-design-plan.png', canvas.toDataURL('image/png'));
});
$('#exportJson').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app: 'roomcraft', version: 1, room: state.room, roomType: state.roomType, style: state.style, keep: state.keep }, null, 2)], { type: 'application/json' });
  download('room-project.json', URL.createObjectURL(blob));
});
$('#importJson').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    loadRoom(data.room, { roomType: data.roomType || 'bedroom', style: data.style || 'scandinavian', keep: data.keep ?? true });
    goStep(3);
  } catch { alert('That file is not a Roomcraft project.'); }
});

// ---------------------------------------------------------------------------
// Boot

if (!load()) {
  // First visit: open on the user's own room if a preset exists, otherwise blank.
  const p = PRESETS.naeem;
  state.room = p.make();
  state.closed = true;
  state.roomType = 'bedroom';
  state.keep = true;
}
$('#units').value = state.units;
presetSel.value = state.room.fixed ? 'naeem' : 'rect';
requestAnimationFrame(() => {
  resizeCanvas();
  fitView();
  goStep(state.step || 1);
});

// Expose for debugging / tests
window.roomcraft = { state, goStep, runDesign, setView3D, parseLen, fmtLen };
