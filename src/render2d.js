// Top-down rendering of the room and a design onto a 2D canvas.
import { STYLES, surfaces } from './catalog.js';
import { walls as wallsOf, add, mul, rng } from './geometry.js';
import { paintRug, rugKey } from './patterns.js';

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

function drawPlant(ctx, r, S, seed = 1, potColor, species = 'leafy') {
  const rand = rng(seed * 97 + 3);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
  fillStroke(ctx, potColor || S.woodDark);
  const greens = ['#4f7a45', '#5f8f4e', '#3f6a3a', '#76a35d'];
  const leaf = (a, len, wid, color) => {
    ctx.save(); ctx.rotate(a);
    ctx.beginPath(); ctx.ellipse(len * 0.5, 0, len * 0.55, wid, 0, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill(); ctx.restore();
  };
  if (species === 'snake') {
    for (let i = 0; i < 9; i++) leaf((i / 9) * Math.PI * 2 + rand(), r * (0.35 + rand() * 0.35), r * 0.09, i % 2 ? '#3f6a3a' : '#7a9a4a');
  } else if (species === 'palm') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rand() * 0.3;
      leaf(a, r * 1.05, r * 0.12, greens[i % 4]);
      for (let k = 0.25; k < 1; k += 0.18) {
        ctx.save(); ctx.rotate(a); ctx.translate(r * k, 0);
        ctx.strokeStyle = '#3c5f33'; ctx.lineWidth = r * 0.03;
        ctx.beginPath(); ctx.moveTo(0, -r * 0.14); ctx.lineTo(0, r * 0.14); ctx.stroke(); ctx.restore();
      }
    }
  } else if (species === 'olive') {
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r * 0.95;
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * d, Math.sin(a) * d, r * 0.09, r * 0.04, a, 0, Math.PI * 2);
      ctx.fillStyle = i % 3 ? '#8a9a78' : '#6f8160'; ctx.fill();
    }
  } else if (species === 'monstera' || species === 'fiddle') {
    const n = species === 'monstera' ? 6 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand();
      leaf(a, r * (0.75 + rand() * 0.25), r * (species === 'monstera' ? 0.34 : 0.26), greens[i % 4]);
      if (species === 'monstera') {
        ctx.save(); ctx.rotate(a); ctx.strokeStyle = S.floor || '#ddd'; ctx.lineWidth = r * 0.04;
        for (const k of [0.35, 0.55, 0.75]) { ctx.beginPath(); ctx.moveTo(r * k, -r * 0.28); ctx.lineTo(r * k, -r * 0.12); ctx.stroke(); }
        ctx.restore();
      }
    }
  } else {
    const leaves = 9;
    for (let i = 0; i < leaves; i++) {
      const a = (i / leaves) * Math.PI * 2 + rand();
      leaf(a, r * (0.55 + rand() * 0.45), r * 0.2, greens[i % greens.length]);
    }
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
  if (it.color) S = { ...S, fabric: it.color, fabric2: it.type === 'bed' || it.type === 'singleBed' ? S.fabric2 : it.color };
  const w = it.w, d = it.d, hw = w / 2, hd = d / 2;
  switch (it.type) {
    case 'rug': {
      const round = rugKey(it.pattern) === 'round';
      if (round) { ctx.beginPath(); ctx.ellipse(0, 0, hw, hd, 0, 0, Math.PI * 2); }
      else roundRect(ctx, -hw, -hd, w, d, 0.04);
      ctx.save(); ctx.clip();
      ctx.translate(-hw, -hd);
      paintRug(ctx, w, d, it.pattern, it.rugColor || S.rug, it.rugAccent || (S.stripes && it.pattern == null ? S.rugPattern : S.rugPattern), 0.01);
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
      if (it.monitor !== false) {
        ctx.fillStyle = '#2c2f33'; roundRect(ctx, -0.28, -hd + 0.05, 0.56, 0.05, 0.01); ctx.fill(); // monitor
        ctx.fillStyle = '#d9d9d9'; roundRect(ctx, -0.2, 0.02, 0.4, 0.13, 0.01); ctx.fill(); // keyboard
      }
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
    case 'bench': {
      roundRect(ctx, -hw, -hd, w, d, 0.04); fillStroke(ctx, S.wood);
      roundRect(ctx, -hw + 0.04, -hd + 0.04, w - 0.08, d - 0.08, 0.04); fillStroke(ctx, S.fabric2);
      break;
    }
    case 'chair': {
      roundRect(ctx, -hw, -hd, w, d, 0.06); fillStroke(ctx, S.woodDark);
      roundRect(ctx, -hw + 0.05, -hd + 0.08, w - 0.1, d - 0.12, 0.05); fillStroke(ctx, S.fabric);
      break;
    }
    case 'floorLamp': case 'arcLamp': {
      drawLampGlow(ctx, 0.9);
      if (it.shade === 'tripod') {
        ctx.strokeStyle = S.woodDark; ctx.lineWidth = 0.02;
        for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * hw, Math.sin(a) * hw); ctx.stroke(); }
      }
      ctx.beginPath(); ctx.arc(0, 0, hw * 0.75, 0, Math.PI * 2); fillStroke(ctx, '#fff3d6', S.metal, 0.02);
      ctx.beginPath(); ctx.arc(0, 0, 0.05, 0, Math.PI * 2); ctx.fillStyle = S.metal; ctx.fill();
      break;
    }
    case 'plantLarge': case 'plantMedium': drawPlant(ctx, hw, S, it.id + (it.variant || 0), undefined, it.species); break;
    case 'custom': {
      roundRect(ctx, -hw, -hd, w, d, 0.03); fillStroke(ctx, shade(S.fabric2, 0.35));
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(-hw, -hd, w, Math.min(0.06, d * 0.15)); // back edge
      const fs = Math.max(0.06, Math.min(0.13, w / 7, d / 3));
      ctx.fillStyle = '#2d2a26'; ctx.font = `600 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(it.name || 'Piece').slice(0, 24), 0, 0, w * 0.92);
      break;
    }
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
    case 'laptop':
      ctx.fillStyle = '#9ea3a8'; roundRect(ctx, -0.17, -0.12, 0.34, 0.24, 0.015); ctx.fill();
      ctx.fillStyle = '#2c2f33'; roundRect(ctx, -0.17, -0.13, 0.34, 0.035, 0.01); ctx.fill(); // screen edge
      ctx.fillStyle = '#c8cbce'; roundRect(ctx, -0.13, -0.06, 0.26, 0.1, 0.008); ctx.fill(); // keys
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
      ctx.fillStyle = wi.finish || S.frame; ctx.fillRect(-hw, -depth / 2 + (wi.lean ? 0.03 : 0), wi.width, depth);
      ctx.fillStyle = wi.art; ctx.fillRect(-hw + 0.02, -depth / 2 + 0.012 + (wi.lean ? 0.03 : 0), wi.width - 0.04, depth - 0.024);
      break;
    case 'shelf': {
      if (wi.ledge) {
        ctx.fillStyle = S.wood; ctx.fillRect(-hw, -wi.depth / 2, wi.width, wi.depth);
        ctx.strokeStyle = shade(S.wood, -0.3); ctx.lineWidth = 0.008; ctx.strokeRect(-hw, -wi.depth / 2, wi.width, wi.depth);
        break;
      }
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
  const b = poly.reduce((a, p) => ({ x0: Math.min(a.x0, p.x), y0: Math.min(a.y0, p.y), x1: Math.max(a.x1, p.x), y1: Math.max(a.y1, p.y) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const type = S.floorType || 'wood';
  if (type === 'carpet') {
    // soft speckled pile
    const r = rng(7);
    ctx.fillStyle = S.floorLine;
    for (let x = b.x0; x < b.x1; x += 0.05) for (let y = b.y0; y < b.y1; y += 0.05) {
      if (r() < 0.35) { ctx.globalAlpha = 0.25 + r() * 0.35; ctx.fillRect(x + r() * 0.04, y + r() * 0.04, 0.012, 0.012); }
    }
    ctx.globalAlpha = 1;
  } else if (type === 'tile') {
    ctx.strokeStyle = S.floorLine; ctx.lineWidth = 0.012;
    ctx.beginPath();
    for (let x = b.x0; x < b.x1; x += 0.6) { ctx.moveTo(x, b.y0); ctx.lineTo(x, b.y1); }
    for (let y = b.y0; y < b.y1; y += 0.6) { ctx.moveTo(b.x0, y); ctx.lineTo(b.x1, y); }
    ctx.stroke();
  } else if (type === 'concrete') {
    const r = rng(3);
    for (let k = 0; k < 40; k++) {
      ctx.fillStyle = S.floorLine; ctx.globalAlpha = 0.08 + r() * 0.1;
      ctx.beginPath(); ctx.arc(b.x0 + r() * (b.x1 - b.x0), b.y0 + r() * (b.y1 - b.y0), 0.2 + r() * 0.5, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = S.floorLine; ctx.lineWidth = 0.01; ctx.beginPath();
    for (let x = b.x0 + 1.5; x < b.x1; x += 1.5) { ctx.moveTo(x, b.y0); ctx.lineTo(x, b.y1); }
    ctx.stroke();
  } else {
    ctx.strokeStyle = S.floorLine; ctx.lineWidth = 0.008;
    let row = 0;
    for (let y = b.y0; y < b.y1; y += 0.18, row++) {
      ctx.beginPath(); ctx.moveTo(b.x0, y); ctx.lineTo(b.x1, y); ctx.stroke();
      for (let x = b.x0 + (row % 3) * 0.4; x < b.x1; x += 1.2) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 0.18); ctx.stroke(); }
    }
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
    } else if (o.swing === 'slide') {
      // sliding wardrobe doors: two overlapping panels in the wall thickness
      ctx.strokeStyle = selected ? '#2d6cdf' : '#5b544c'; ctx.lineWidth = 0.025;
      const m = add(a, mul(w.dir, o.width / 2));
      for (const [p0, p1, k] of [[a, add(m, mul(w.dir, 0.05)), -0.025], [add(m, mul(w.dir, -0.05)), b, -0.075]]) {
        const off = mul(w.n, k);
        ctx.beginPath(); ctx.moveTo(p0.x + off.x, p0.y + off.y); ctx.lineTo(p1.x + off.x, p1.y + off.y); ctx.stroke();
      }
      ctx.fillStyle = '#5b544c'; ctx.font = '0.09px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lp = add(m, mul(w.n, 0.08));
      ctx.fillText('wardrobe', lp.x, lp.y);
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
      if (o.kind === 'bathroom') {
        const lp = add(add(a, mul(w.dir, o.width / 2)), mul(w.n, -WALL_T * 2.2));
        ctx.fillStyle = '#3f7f99'; ctx.font = '600 0.14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('bath', lp.x, lp.y);
      }
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
  const S = surfaces(STYLES[design?.style] || STYLES.scandinavian, room);
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
