// Pattern painters shared by the 2D plan and the 3D textures.
// Each one paints into a 0..W × 0..H box on a 2D canvas context, so callers
// can use meters (plan) or pixels (texture) — `u` is the size of one "unit"
// (≈ 1 cm in meters for the plan, or pixels per cm for a texture).
import { rng } from './geometry.js';

/** Rug pattern keys, plus the numeric ones older designs used. */
const LEGACY_RUG = ['stripes', 'diagonal', 'border'];
export const rugKey = (p) => (typeof p === 'number' ? LEGACY_RUG[p] || 'border' : p || 'border');

export function paintRug(g, W, H, pattern, base, accent, u) {
  const key = rugKey(pattern);
  g.save();
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  g.strokeStyle = accent; g.fillStyle = accent;
  const lw = 3 * u;
  g.lineWidth = lw;
  const inset = (k) => { g.strokeRect(k, k, W - 2 * k, H - 2 * k); };
  switch (key) {
    case 'solid':
      g.lineWidth = 1.5 * u; inset(6 * u);
      break;
    case 'stripes':
      for (let x = 9 * u; x < W; x += 18 * u) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      break;
    case 'diagonal':
      for (let k = -H; k < W + H; k += 25 * u) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + H * 0.6, H); g.stroke(); }
      break;
    case 'border':
      inset(12 * u); inset(24 * u);
      break;
    case 'trellis': {
      // Moroccan diamond lattice
      const s = 22 * u;
      g.lineWidth = 2 * u;
      for (let y = 0; y < H + s; y += s) for (let x = 0; x < W + s; x += s) {
        g.beginPath();
        g.moveTo(x, y - s / 2); g.quadraticCurveTo(x + s / 2, y - s / 2, x + s / 2, y);
        g.quadraticCurveTo(x + s / 2, y + s / 2, x, y + s / 2);
        g.quadraticCurveTo(x - s / 2, y + s / 2, x - s / 2, y);
        g.quadraticCurveTo(x - s / 2, y - s / 2, x, y - s / 2);
        g.stroke();
      }
      break;
    }
    case 'medallion': {
      // Persian-style: two borders, corner spandrels and a central medallion
      inset(8 * u); g.lineWidth = 1.5 * u; inset(16 * u);
      g.globalAlpha = 0.85;
      g.beginPath(); g.ellipse(W / 2, H / 2, W * 0.18, H * 0.22, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      g.fillStyle = base; g.beginPath(); g.ellipse(W / 2, H / 2, W * 0.09, H * 0.11, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = accent;
      for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) { g.beginPath(); g.ellipse(cx, cy, W * 0.2, H * 0.2, 0, 0, Math.PI * 2); g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1; }
      break;
    }
    case 'checker': {
      const s = 30 * u;
      g.globalAlpha = 0.8;
      for (let y = 0, r = 0; y < H; y += s, r++) for (let x = 0, c = 0; x < W; x += s, c++) if ((r + c) % 2) g.fillRect(x, y, s, s);
      g.globalAlpha = 1;
      break;
    }
    case 'round':
      g.lineWidth = 2 * u;
      for (const k of [0.42, 0.3, 0.16]) { g.beginPath(); g.ellipse(W / 2, H / 2, W * k, H * k, 0, 0, Math.PI * 2); g.stroke(); }
      break;
    default:
      inset(12 * u);
  }
  g.restore();
}

/** Paint a piece of art of the given kind into a W×H box (pixels). */
export function paintArt(g, W, H, kind, color, pal, seed = 1) {
  const r = rng(seed * 7 + 3);
  const pick = () => pal[Math.floor(r() * pal.length)];
  g.save();
  g.fillStyle = '#f4efe6'; g.fillRect(0, 0, W, H);
  switch (kind) {
    case 'arches': {
      g.fillStyle = color; g.beginPath(); g.arc(W / 2, H * 0.72, W * 0.36, Math.PI, 0); g.fill();
      g.fillStyle = pick(); g.beginPath(); g.arc(W / 2, H * 0.72, W * 0.2, Math.PI, 0); g.fill();
      g.fillStyle = pick(); g.beginPath(); g.arc(W * (0.25 + r() * 0.5), H * 0.24, W * 0.11, 0, 7); g.fill();
      g.fillStyle = color; g.fillRect(0, H * 0.72, W, H * 0.03);
      break;
    }
    case 'botanical': {
      g.strokeStyle = '#4c6b3c'; g.lineWidth = W * 0.02;
      g.beginPath(); g.moveTo(W / 2, H * 0.92); g.quadraticCurveTo(W * 0.45, H * 0.5, W / 2, H * 0.1); g.stroke();
      for (let i = 0; i < 7; i++) {
        const y = H * (0.2 + i * 0.1), side = i % 2 ? 1 : -1;
        g.fillStyle = i % 3 ? '#5f8f4e' : color;
        g.beginPath(); g.ellipse(W / 2 + side * W * 0.14, y, W * 0.15, W * 0.06, side * 0.5, 0, 7); g.fill();
      }
      break;
    }
    case 'landscape': {
      const sky = g.createLinearGradient(0, 0, 0, H * 0.6);
      sky.addColorStop(0, '#f1d9b8'); sky.addColorStop(1, '#e9c7a0');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      g.fillStyle = color; g.beginPath(); g.arc(W * 0.7, H * 0.3, W * 0.09, 0, 7); g.fill();
      const hills = [pick(), '#7a8f6a', '#4f6146'];
      hills.forEach((c, k) => {
        g.fillStyle = c; g.beginPath(); g.moveTo(0, H);
        for (let x = 0; x <= W; x += W / 8) g.lineTo(x, H * (0.5 + k * 0.12) + Math.sin(x / W * 6 + k * 2 + r()) * H * 0.05);
        g.lineTo(W, H); g.closePath(); g.fill();
      });
      break;
    }
    case 'line': {
      g.strokeStyle = '#2b2b2b'; g.lineWidth = W * 0.018; g.lineCap = 'round';
      // a single-line face/profile doodle
      g.beginPath();
      g.moveTo(W * 0.3, H * 0.85);
      g.bezierCurveTo(W * 0.2, H * 0.5, W * 0.35, H * 0.2, W * 0.55, H * 0.25);
      g.bezierCurveTo(W * 0.8, H * 0.3, W * 0.75, H * 0.55, W * 0.6, H * 0.6);
      g.bezierCurveTo(W * 0.5, H * 0.65, W * 0.62, H * 0.75, W * 0.7, H * 0.85);
      g.stroke();
      g.fillStyle = color; g.globalAlpha = 0.6; g.beginPath(); g.arc(W * 0.42, H * 0.4, W * 0.12, 0, 7); g.fill();
      break;
    }
    case 'geometric': {
      const n = 3;
      for (let i = 0; i < n; i++) for (let j = 0; j < n + 1; j++) {
        g.fillStyle = (i + j) % 3 === 0 ? color : pick();
        const x = W * 0.12 + i * (W * 0.76 / n), y = H * 0.1 + j * (H * 0.8 / (n + 1));
        if ((i + j) % 2) { g.beginPath(); g.arc(x + W * 0.12, y + H * 0.1, W * 0.1, 0, 7); g.fill(); }
        else g.fillRect(x + W * 0.02, y + H * 0.01, W * 0.22, H * 0.18);
      }
      break;
    }
    case 'photo': {
      g.fillStyle = '#3a3a3a'; g.fillRect(W * 0.06, H * 0.06, W * 0.88, H * 0.88);
      const grd = g.createLinearGradient(0, H * 0.06, 0, H * 0.94);
      grd.addColorStop(0, '#d9d9d9'); grd.addColorStop(0.55, '#8a8a8a'); grd.addColorStop(1, '#2b2b2b');
      g.fillStyle = grd; g.fillRect(W * 0.08, H * 0.08, W * 0.84, H * 0.84);
      g.fillStyle = '#1f1f1f'; g.beginPath(); g.moveTo(W * 0.08, H * 0.7); g.lineTo(W * 0.35, H * 0.45); g.lineTo(W * 0.55, H * 0.62); g.lineTo(W * 0.75, H * 0.4); g.lineTo(W * 0.92, H * 0.6); g.lineTo(W * 0.92, H * 0.92); g.lineTo(W * 0.08, H * 0.92); g.fill();
      break;
    }
    default: { // abstract
      for (let i = 0; i < 5; i++) {
        g.fillStyle = i === 0 ? color : pick();
        g.beginPath(); g.ellipse(W * (0.15 + r() * 0.7), H * (0.12 + r() * 0.76), W * (0.08 + r() * 0.22), H * (0.06 + r() * 0.18), r() * 3, 0, 7); g.fill();
      }
    }
  }
  g.restore();
}
