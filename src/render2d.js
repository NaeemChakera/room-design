// Top-down rendering of the room and a design onto a 2D canvas.
import { STYLES } from './catalog.js';
import { walls as wallsOf, add, mul, rng } from './geometry.js';

const WALL_T = 0.12;

export function makeView(canvas, poly, pad = 40) {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!poly.length) return { scale: 60, ox: W / 2, oy: H / 2 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const scale = Math.min((W - 2 * pad) / Math.max(0.5, maxX - minX), (H - 2 * pad) / Math.max(0.5, maxY - minY));
  return { scale, ox: W / 2 - ((minX + maxX) / 2) * scale, oy: H / 2 - ((minY + maxY) / 2) * scale };
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function fillStroke(ctx, fill, stroke = 'rgba(0,0,0,0.35)', lw = 0.012) {
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke();
}

function drawPlant(ctx, r, S, seed = 1, potColor) {
  const rand = rng(seed * 97 + 3);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
  fillStroke(ctx, potColor || S.woodDark);
  const greens = ['#4f7a45', '#5f8f4e', '#3f6a3a', '#76a35d'];
  const leaves = 9;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + rand();
    const lr = r * (0.55 + rand() * 0.45);
    ctx.save(); ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(lr * 0.5, 0, lr * 0.55, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = greens[i % greens.length]; ctx.fill();
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2); ctx.fillStyle = '#3c5f33'; ctx.fill();
}

function drawLampGlow(ctx, r) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, 'rgba(255,214,120,0.45)');
  g.addColorStop(1, 'rgba(255,214,120,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
}

/** Draw an item in local coordinates: x along width, +y = front. */
export function drawItem(ctx, it, S) {
  const w = it.w, d = it.d, hw = w / 2, hd = d / 2;
  switch (it.type) {
    case 'rug': {
      roundRect(ctx, -hw, -hd, w, d, 0.04);
      ctx.fillStyle = S.rug; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = S.rugPattern; ctx.lineWidth = 0.03;
      if (it.pattern === 0 || S.stripes) {
        for (let x = -hw; x < hw; x += 0.18) { ctx.beginPath(); ctx.moveTo(x, -hd); ctx.lineTo(x, hd); ctx.stroke(); }
      } else if (it.pattern === 1) {
        for (let k = -6; k < 12; k++) { ctx.beginPath(); ctx.moveTo(-hw + k * 0.25, -hd); ctx.lineTo(-hw + k * 0.25 + d * 0.6, hd); ctx.stroke(); }
      } else {
        roundRect(ctx, -hw + 0.12, -hd + 0.12, w - 0.24, d - 0.24, 0.05); ctx.stroke();
        roundRect(ctx, -hw + 0.24, -hd + 0.24, w - 0.48, d - 0.48, 0.05); ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'sofa': case 'loveseat': {
      roundRect(ctx, -hw, -hd, w, d, 0.08); fillStroke(ctx, S.fabric);
      roundRect(ctx, -hw, -hd, w, 0.2, 0.06); fillStroke(ctx, shade(S.fabric, -0.12));
      roundRect(ctx, -hw, -hd, 0.18, d, 0.06); fillStroke(ctx, shade(S.fabric, -0.08));
      roundRect(ctx, hw - 0.18, -hd, 0.18, d, 0.06); fillStroke(ctx, shade(S.fabric, -0.08));
      const n = it.type === 'sofa' ? 3 : 2;
      const cw = (w - 0.36) / n;
      for (let i = 0; i < n; i++) { roundRect(ctx, -hw + 0.18 + i * cw + 0.01, -hd + 0.2, cw - 0.02, d - 0.24, 0.05); fillStroke(ctx, shade(S.fabric, 0.06)); }
      // throw pillows
      ctx.fillStyle = S.accent; roundRect(ctx, -hw + 0.22, -hd + 0.2, 0.32, 0.12, 0.04); ctx.fill();
      ctx.fillStyle = S.fabric2; roundRect(ctx, hw - 0.54, -hd + 0.2, 0.32, 0.12, 0.04); ctx.fill();
      break;
    }
    case 'armchair': {
      roundRect(ctx, -hw, -hd, w, d, 0.12); fillStroke(ctx, S.fabric2);
      roundRect(ctx, -hw + 0.13, -hd + 0.18, w - 0.26, d - 0.24, 0.08); fillStroke(ctx, shade(S.fabric2, 0.15));
      break;
    }
    case 'pcTable': case 'lampTable': {
      roundRect(ctx, -hw, -hd, w, d, 0.02); fillStroke(ctx, S.woodDark);
      ctx.strokeStyle = shade(S.woodDark, 0.25); ctx.lineWidth = 0.01; ctx.strokeRect(-hw + 0.04, -hd + 0.04, w - 0.08, d - 0.08);
      break;
    }
    case 'coffeeTable': case 'sideTable': case 'nightstand': {
      if (it.round || it.type === 'sideTable') { ctx.beginPath(); ctx.ellipse(0, 0, hw, hd, 0, 0, Math.PI * 2); }
      else roundRect(ctx, -hw, -hd, w, d, 0.04);
      fillStroke(ctx, it.type === 'coffeeTable' ? S.wood : S.woodDark);
      if (it.type === 'coffeeTable') {
        ctx.fillStyle = shade(S.accent, 0.2); ctx.beginPath(); ctx.arc(w * 0.18, 0, 0.07, 0, 7); ctx.fill();
        ctx.fillStyle = shade(S.fabric2, -0.1); ctx.fillRect(-w * 0.32, -0.08, 0.22, 0.16);
      }
      break;
    }
    case 'mediaUnit': case 'dresser': case 'sideboard': {
      roundRect(ctx, -hw, -hd, w, d, 0.02); fillStroke(ctx, S.wood);
      ctx.strokeStyle = shade(S.wood, -0.25); ctx.lineWidth = 0.01;
      const n = Math.max(2, Math.round(w / 0.45));
      for (let i = 1; i < n; i++) { ctx.beginPath(); ctx.moveTo(-hw + (w / n) * i, -hd + 0.03); ctx.lineTo(-hw + (w / n) * i, hd - 0.03); ctx.stroke(); }
      break;
    }
    case 'bookshelf': {
      roundRect(ctx, -hw, -hd, w, d, 0.01); fillStroke(ctx, S.woodDark);
      const rand = rng(it.books || 5);
      let x = -hw + 0.04;
      const cols = S.art.concat([S.fabric2, S.accent]);
      while (x < hw - 0.06) {
        const bw = 0.03 + rand() * 0.04;
        ctx.fillStyle = cols[Math.floor(rand() * cols.length)];
        ctx.fillRect(x, -hd + 0.04, bw, d - 0.09 - rand() * 0.08);
        x += bw + 0.005;
      }
      break;
    }
    case 'bed': case 'singleBed': {
      roundRect(ctx, -hw, -hd, w, d, 0.05); fillStroke(ctx, S.woodDark);
      roundRect(ctx, -hw + 0.04, -hd + 0.1, w - 0.08, d - 0.14, 0.05); fillStroke(ctx, S.bedding);
      const pillows = it.type === 'bed' ? 2 : 1;
      const pw = (w - 0.2) / pillows;
      for (let i = 0; i < pillows; i++) { roundRect(ctx, -hw + 0.1 + i * pw + 0.02, -hd + 0.15, pw - 0.04, 0.32, 0.06); fillStroke(ctx, '#ffffff'); }
      // duvet + throw
      roundRect(ctx, -hw + 0.04, -hd + 0.6, w - 0.08, d - 0.66, 0.05); fillStroke(ctx, shade(S.fabric, 0.1));
      ctx.fillStyle = S.accent; ctx.fillRect(-hw + 0.04, hd - 0.55, w - 0.08, 0.3);
      break;
    }
    case 'wardrobe': {
      roundRect(ctx, -hw, -hd, w, d, 0.01); fillStroke(ctx, S.wood);
      ctx.strokeStyle = shade(S.wood, -0.3); ctx.lineWidth = 0.012;
      ctx.beginPath(); ctx.moveTo(0, -hd); ctx.lineTo(0, hd); ctx.stroke();
      ctx.setLineDash([0.04, 0.03]); ctx.beginPath(); ctx.arc(-hw, hd, w / 2, 0, Math.PI / 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(hw, hd, w / 2, Math.PI / 2, Math.PI); ctx.stroke(); ctx.setLineDash([]);
      break;
    }
    case 'desk': {
      roundRect(ctx, -hw, -hd, w, d, 0.02); fillStroke(ctx, S.wood);
      ctx.fillStyle = '#2c2f33'; roundRect(ctx, -0.28, -hd + 0.05, 0.56, 0.05, 0.01); ctx.fill(); // monitor
      ctx.fillStyle = '#d9d9d9'; roundRect(ctx, -0.2, 0.02, 0.4, 0.13, 0.01); ctx.fill(); // keyboard
      break;
    }
    case 'deskChair': {
      ctx.beginPath(); ctx.arc(0, 0, 0.27, 0, Math.PI * 2); fillStroke(ctx, S.metal);
      roundRect(ctx, -0.22, -0.3, 0.44, 0.12, 0.05); fillStroke(ctx, shade(S.metal, 0.25));
      break;
    }
    case 'diningTable': case 'roundTable': {
      if (it.round) { ctx.beginPath(); ctx.arc(0, 0, hw, 0, Math.PI * 2); }
      else roundRect(ctx, -hw, -hd, w, d, 0.04);
      fillStroke(ctx, S.wood);
      ctx.fillStyle = shade(S.accent, 0.1); ctx.beginPath(); ctx.arc(0, 0, 0.09, 0, 7); ctx.fill();
      break;
    }
    case 'chair': {
      roundRect(ctx, -hw, -hd, w, d, 0.06); fillStroke(ctx, S.woodDark);
      roundRect(ctx, -hw + 0.05, -hd + 0.08, w - 0.1, d - 0.12, 0.05); fillStroke(ctx, S.fabric);
      break;
    }
    case 'floorLamp': case 'arcLamp': {
      drawLampGlow(ctx, 0.9);
      ctx.beginPath(); ctx.arc(0, 0, hw * 0.75, 0, Math.PI * 2); fillStroke(ctx, '#fff3d6', S.metal, 0.02);
      ctx.beginPath(); ctx.arc(0, 0, 0.05, 0, Math.PI * 2); ctx.fillStyle = S.metal; ctx.fill();
      break;
    }
    case 'plantLarge': case 'plantMedium': drawPlant(ctx, hw, S, it.id + (it.variant || 0)); break;
    default:
      roundRect(ctx, -hw, -hd, w, d, 0.03); fillStroke(ctx, '#ccc');
  }
}

function drawTopItem(ctx, it, S) {
  ctx.save();
  ctx.translate(it.x, it.y);
  ctx.rotate(it.theta || 0);
  switch (it.type) {
    case 'tableLamp':
      drawLampGlow(ctx, 0.7);
      ctx.beginPath(); ctx.arc(0, 0, 0.13, 0, 7); fillStroke(ctx, '#fff3d6', S.metal, 0.015);
      break;
    case 'deskLamp':
      drawLampGlow(ctx, 0.5);
      ctx.beginPath(); ctx.arc(0, 0, 0.07, 0, 7); fillStroke(ctx, S.metal);
      break;
    case 'plantSmall': drawPlant(ctx, 0.11, S, it.id, S.accent); break;
    case 'pcTower':
      ctx.fillStyle = '#1d1f22'; roundRect(ctx, -0.11, -0.22, 0.22, 0.44, 0.02); ctx.fill();
      ctx.fillStyle = '#e8a23a'; ctx.beginPath(); ctx.arc(0, 0.12, 0.05, 0, 7); ctx.fill();
      break;
    case 'monitor':
      ctx.fillStyle = '#1d1f22'; roundRect(ctx, -0.42, -0.06, 0.84, 0.07, 0.02); ctx.fill();
      ctx.fillStyle = '#d9d9d9'; roundRect(ctx, -0.22, 0.12, 0.44, 0.14, 0.01); ctx.fill();
      break;
    case 'projector':
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.strokeStyle = '#555'; ctx.lineWidth = 0.012;
      roundRect(ctx, -0.12, -0.08, 0.24, 0.16, 0.03); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -0.1, 0.04, 0, 7); ctx.stroke();
      break;
    case 'pendant':
      drawLampGlow(ctx, 1.2);
      ctx.beginPath(); ctx.arc(0, 0, 0.18, 0, 7);
      ctx.setLineDash([0.04, 0.03]); ctx.lineWidth = 0.015; ctx.strokeStyle = S.metal; ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(0, 0, 0.03, 0, 7); ctx.fillStyle = S.metal; ctx.fill();
      break;
    case 'plantHanging':
      ctx.globalAlpha = 0.8; drawPlant(ctx, 0.22, S, it.id, S.rug); ctx.globalAlpha = 1;
      ctx.setLineDash([0.03, 0.03]); ctx.lineWidth = 0.01; ctx.strokeStyle = '#555';
      ctx.beginPath(); ctx.arc(0, 0, 0.26, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      break;
  }
  ctx.restore();
}

function drawWallItem(ctx, wi, wall, S) {
  const depth = Math.max(0.05, wi.depth || 0.03);
  const p = add(add(wall.a, mul(wall.dir, wi.t)), mul(wall.n, WALL_T / 2 * 0 + depth / 2 + 0.005));
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.atan2(wall.dir.y, wall.dir.x));
  const hw = wi.width / 2;
  switch (wi.type) {
    case 'frame':
      ctx.fillStyle = S.frame; ctx.fillRect(-hw, -depth / 2, wi.width, depth);
      ctx.fillStyle = wi.art; ctx.fillRect(-hw + 0.02, -depth / 2 + 0.012, wi.width - 0.04, depth - 0.024);
      break;
    case 'shelf': {
      ctx.fillStyle = S.wood; ctx.fillRect(-hw, -wi.depth / 2, wi.width, wi.depth);
      ctx.strokeStyle = shade(S.wood, -0.3); ctx.lineWidth = 0.008; ctx.strokeRect(-hw, -wi.depth / 2, wi.width, wi.depth);
      const rand = rng(wi.decor || 3);
      for (let x = -hw + 0.06; x < hw - 0.06; x += 0.04 + rand() * 0.03) {
        if (rand() < 0.35) continue;
        ctx.fillStyle = S.art[Math.floor(rand() * S.art.length)];
        ctx.fillRect(x, -wi.depth / 2 + 0.03, 0.025, wi.depth - 0.06);
      }
      ctx.save(); ctx.translate(hw - 0.12, 0); drawPlant(ctx, 0.08, S, wi.decor || 2, S.accent); ctx.restore();
      break;
    }
    case 'mirror':
      ctx.fillStyle = '#cfe3ea'; ctx.strokeStyle = S.metal; ctx.lineWidth = 0.015;
      ctx.fillRect(-hw, -depth / 2, wi.width, depth); ctx.strokeRect(-hw, -depth / 2, wi.width, depth);
      break;
    case 'tv':
      ctx.fillStyle = '#1b1d20'; ctx.fillRect(-hw, -depth / 2, wi.width, depth);
      break;
    case 'bike': {
      const dd = wi.depth || 0.36;
      ctx.fillStyle = 'rgba(70,110,150,0.18)'; ctx.fillRect(-hw, -dd / 2, wi.width, dd);
      ctx.strokeStyle = '#3c6e9a'; ctx.lineWidth = 0.03; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-hw + 0.05, 0); ctx.lineTo(hw - 0.05, 0); ctx.stroke();
      ctx.lineWidth = 0.05; ctx.strokeStyle = '#2b2b2b';
      for (const x of [-hw + 0.37, hw - 0.37]) { ctx.beginPath(); ctx.moveTo(x - 0.35, 0.02); ctx.lineTo(x + 0.35, 0.02); ctx.stroke(); }
      ctx.lineWidth = 0.02; ctx.strokeStyle = '#2b2b2b';
      ctx.beginPath(); ctx.moveTo(hw * 0.2, -dd / 2 + 0.02); ctx.lineTo(hw * 0.2, dd / 2 - 0.02); ctx.stroke(); // bars
      break;
    }
    case 'projection':
      ctx.fillStyle = 'rgba(80,90,200,0.25)'; ctx.fillRect(-hw, -0.03, wi.width, 0.06);
      ctx.save(); ctx.setLineDash([0.06, 0.04]); ctx.strokeStyle = 'rgba(80,90,200,0.55)'; ctx.lineWidth = 0.012;
      ctx.beginPath(); ctx.moveTo(-hw, 0); ctx.lineTo(-hw * 0.3, 1.6); ctx.moveTo(hw, 0); ctx.lineTo(hw * 0.3, 1.6); ctx.stroke(); ctx.restore();
      break;
    case 'floorMirror':
      ctx.fillStyle = '#cfe3ea'; ctx.strokeStyle = '#f3f3f3'; ctx.lineWidth = 0.02;
      ctx.fillRect(-hw, -0.04, wi.width, 0.08); ctx.strokeRect(-hw, -0.04, wi.width, 0.08);
      break;
    case 'sign':
      ctx.fillStyle = '#2f5d3a'; ctx.fillRect(-hw, -0.015, wi.width, 0.03);
      break;
    case 'sconce':
      drawLampGlow(ctx, 0.5);
      ctx.beginPath(); ctx.arc(0, 0, 0.07, 0, 7); fillStroke(ctx, '#fff3d6', S.metal, 0.015);
      break;
  }
  ctx.restore();
}

export function drawFloor(ctx, poly, S) {
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = S.floor; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = S.floorLine; ctx.lineWidth = 0.008;
  const b = poly.reduce((a, p) => ({ x0: Math.min(a.x0, p.x), y0: Math.min(a.y0, p.y), x1: Math.max(a.x1, p.x), y1: Math.max(a.y1, p.y) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  let row = 0;
  for (let y = b.y0; y < b.y1; y += 0.18, row++) {
    ctx.beginPath(); ctx.moveTo(b.x0, y); ctx.lineTo(b.x1, y); ctx.stroke();
    for (let x = b.x0 + (row % 3) * 0.4; x < b.x1; x += 1.2) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 0.18); ctx.stroke(); }
  }
  ctx.restore();
}

export function drawWalls(ctx, poly, openings, opts = {}) {
  if (poly.length < 2) return;
  const ws = wallsOf(poly);
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'square';
  ctx.strokeStyle = opts.wallColor || '#2d2a26';
  const closed = opts.closed !== false && poly.length >= 3;
  ctx.save();
  if (closed) {
    // Walls are drawn outside the traced outline so the outline is the inner wall face.
    ctx.beginPath();
    ctx.rect(-1e4, -1e4, 2e4, 2e4);
    poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.clip('evenodd');
  }
  ctx.lineWidth = closed ? WALL_T * 2 : WALL_T;
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (closed) ctx.closePath();
  ctx.stroke();
  ctx.restore();
  const out = closed ? -WALL_T / 2 : 0;
  for (const o of openings || []) {
    const w = ws[o.wall];
    if (!w) continue;
    const a = add(w.a, mul(w.dir, o.t - o.width / 2));
    const b = add(w.a, mul(w.dir, o.t + o.width / 2));
    const off = mul(w.n, out);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = opts.openingBg || '#fff'; ctx.lineWidth = WALL_T + 0.01;
    ctx.beginPath(); ctx.moveTo(a.x + off.x, a.y + off.y); ctx.lineTo(b.x + off.x, b.y + off.y); ctx.stroke();
    const selected = opts.selected === o.id;
    if (o.type === 'window') {
      ctx.strokeStyle = selected ? '#2d6cdf' : '#6aa7c8'; ctx.lineWidth = 0.025;
      for (const k of [-0.035, 0.035]) {
        const n = mul(w.n, k + out);
        ctx.beginPath(); ctx.moveTo(a.x + n.x, a.y + n.y); ctx.lineTo(b.x + n.x, b.y + n.y); ctx.stroke();
      }
    } else if (o.swing === 'none') {
      ctx.strokeStyle = selected ? '#2d6cdf' : '#5b544c'; ctx.lineWidth = 0.02;
      for (const q of [a, b]) {
        const e = add(q, mul(w.n, -WALL_T));
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(e.x, e.y); ctx.stroke();
      }
    } else {
      // door leaf + swing arc into the room
      const hingeLeft = o.hinge !== 'right';
      const hinge = hingeLeft ? a : b;
      const other = hingeLeft ? b : a;
      const leafEnd = add(hinge, mul(w.n, o.width));
      ctx.strokeStyle = selected ? '#2d6cdf' : '#5b544c'; ctx.lineWidth = 0.025;
      ctx.beginPath(); ctx.moveTo(hinge.x, hinge.y); ctx.lineTo(leafEnd.x, leafEnd.y); ctx.stroke();
      ctx.lineWidth = 0.01; ctx.setLineDash([0.05, 0.04]);
      const a0 = Math.atan2(other.y - hinge.y, other.x - hinge.x);
      const a1 = Math.atan2(w.n.y, w.n.x);
      let delta = a1 - a0;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      ctx.beginPath(); ctx.arc(hinge.x, hinge.y, o.width, a0, a0 + delta, delta < 0); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.lineCap = 'square';
  }
}

export function drawDimensions(ctx, poly, view, opts = {}) {
  const ws = wallsOf(poly);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(view.dpr || 1, view.dpr || 1);
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const w of ws) {
    if (opts.closed === false && w.i === ws.length - 1) continue;
    const mid = add(add(w.a, mul(w.dir, w.length / 2)), mul(w.n, -(WALL_T + 0.2 * 60 / view.scale)));
    const sx = mid.x * view.scale + view.ox, sy = mid.y * view.scale + view.oy;
    const label = opts.fmt ? opts.fmt(w.length) : `${w.length.toFixed(2)} m`;
    const tw = ctx.measureText(label).width + 10;
    ctx.fillStyle = opts.highlight === w.i ? '#2d6cdf' : 'rgba(255,255,255,0.92)';
    roundRect(ctx, sx - tw / 2, sy - 10, tw, 20, 10); ctx.fill();
    ctx.fillStyle = opts.highlight === w.i ? '#fff' : '#333';
    ctx.fillText(label, sx, sy + 0.5);
  }
  ctx.restore();
}

export function drawDesign(ctx, room, design, opts = {}) {
  const S = STYLES[design?.style] || STYLES.scandinavian;
  const poly = room.points;
  drawFloor(ctx, poly, S);
  if (design) {
    const ws = wallsOf(poly);
    const order = (it) => (it.flat ? 0 : it.type.includes('amp') ? 3 : it.type.startsWith('plant') ? 2 : 1);
    for (const it of design.items.slice().sort((a, b) => order(a) - order(b))) {
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.theta);
      if (opts.hoverId === it.id) { ctx.shadowColor = '#2d6cdf'; ctx.shadowBlur = 14; }
      drawItem(ctx, it, S);
      ctx.restore();
    }
    for (const t of design.topItems.filter((t) => !t.ceiling)) drawTopItem(ctx, t, S);
    drawWalls(ctx, poly, room.openings);
    for (const wi of design.wallItems) if (ws[wi.wall]) drawWallItem(ctx, wi, ws[wi.wall], S);
    for (const t of design.topItems.filter((t) => t.ceiling)) drawTopItem(ctx, t, S);
  } else {
    drawWalls(ctx, poly, room.openings);
  }
}
